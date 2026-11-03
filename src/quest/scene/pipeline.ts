import * as THREE from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { markShadows, shadowSchedule } from './shadows';

/*
 * The office's whole render path, in every quality:
 *
 *   scene → one 4× MSAA half-float target (colour + depth texture, resolved once per frame)
 *         → GTAO from that depth (high quality only; normals rebuilt from depth; at a fraction
 *           of the CSS resolution, aoScale)
 *         → one full-screen pass to the canvas: colour × mix(1, ao, strength), then the tone
 *           mapping and sRGB encoding OutputPass used to do
 *
 * The canvas itself has no antialiasing, alpha or depth: the target does the antialiasing, and
 * the scene always renders into a target, so every shader is compiled once for linear output
 * and dropping to lite quality never recompiles them.
 *
 * Low quality (phones) keeps drawing straight to an antialiased canvas instead (DirectPath):
 * the cheapest path on tile-based mobile GPUs, and the look phones have always had.
 *
 * The sun's shadow map is cached: redrawn on demand (shadows.ts) rather than every frame.
 */

/** How the scene reaches the canvas. */
export interface FramePath {
	/** Shaders are linking in the background; drawing now would stall on them. */
	readonly compiling: boolean;
	/** Compiles every shader the scene needs, as it will render, off the main path. */
	compile(scene: THREE.Object3D, camera: THREE.Camera): Promise<unknown>;
	/** Draws a frame; `time` is the scene clock (s), for the shadow map's idle refresh. */
	render(scene: THREE.Scene, camera: THREE.Camera, strength: number, time: number): void;
	dispose(): void;
}

/** Builds programs for the given target, then waits for the driver to link them. */
function compileFor(gl: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null, scene: THREE.Object3D, camera: THREE.Camera) {
	const previous = gl.getRenderTarget();
	// Programs depend on the target (linear output for a target, sRGB for the canvas).
	gl.setRenderTarget(target);
	// compileAsync builds the programs synchronously, then waits for the driver to link them.
	const done = gl.compileAsync(scene, camera);
	gl.setRenderTarget(previous);
	return done;
}

/** Redraws the sun's shadow map when it is due (shadows.ts). */
function scheduleShadows(gl: THREE.WebGLRenderer, time: number) {
	if (gl.shadowMap.enabled && shadowSchedule.due(time)) gl.shadowMap.needsUpdate = true;
}

/** Straight to the canvas, which antialiases itself (low quality only). */
export class DirectPath implements FramePath {
	compiling = false;
	private key = '';
	private readonly size = new THREE.Vector2();

	constructor(private readonly gl: THREE.WebGLRenderer) {
		gl.shadowMap.autoUpdate = false;
		markShadows();
	}

	compile(scene: THREE.Object3D, camera: THREE.Camera) {
		this.compiling = true;
		return compileFor(this.gl, null, scene, camera).finally(() => {
			this.compiling = false;
		});
	}

	render(scene: THREE.Scene, camera: THREE.Camera, _strength: number, time: number) {
		const gl = this.gl;
		gl.getDrawingBufferSize(this.size);
		const key = `${this.size.x}x${this.size.y}`;
		if (key !== this.key) {
			this.key = key;
			markShadows();
		}
		scheduleShadows(gl, time);
		gl.setRenderTarget(null);
		gl.render(scene, camera);
	}

	dispose() {}
}

/** GTAO whose buffers run at a fraction of the drawing buffer's size (AO is soft anyway). */
class OfficeAO extends GTAOPass {
	/** Size of the AO buffers relative to the drawing buffer's. */
	scale = 1;

	setSize(width: number, height: number) {
		const k = this.scale ?? 1;
		super.setSize(Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k)));
	}

	dispose() {
		super.dispose();
		// GTAOPass.dispose() leaves these two behind.
		this.gtaoMaterial.dispose();
		this.blendMaterial.dispose();
	}
}

/** OutputPass's shader with GTAO's blend folded in front of it (same maths, one pass). */
const finalShader = {
	vertexShader: /* glsl */ `
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,
	fragmentShader: /* glsl */ `
		precision highp float;

		uniform sampler2D tDiffuse;
		uniform sampler2D tAO;
		uniform float intensity;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			#if defined( AO_ONLY )

				// Review aid (?fx=ao): the denoised occlusion buffer alone.
				gl_FragColor = texture2D( tAO, vUv );

			#elif defined( USE_AO )

				// GTAOBlendShader, applied as its multiply blend did.
				vec4 ao = texture2D( tAO, vUv );
				gl_FragColor = vec4( gl_FragColor.rgb * mix( vec3( 1. ), ao.rgb, intensity ), gl_FragColor.a * ao.a );

			#endif

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#elif defined( CUSTOM_TONE_MAPPING )

				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`,
};

const TONE_DEFINES: Partial<Record<THREE.ToneMapping, string>> = {
	[THREE.LinearToneMapping]: 'LINEAR_TONE_MAPPING',
	[THREE.ReinhardToneMapping]: 'REINHARD_TONE_MAPPING',
	[THREE.CineonToneMapping]: 'CINEON_TONE_MAPPING',
	[THREE.ACESFilmicToneMapping]: 'ACES_FILMIC_TONE_MAPPING',
	[THREE.AgXToneMapping]: 'AGX_TONE_MAPPING',
	[THREE.NeutralToneMapping]: 'NEUTRAL_TONE_MAPPING',
	[THREE.CustomToneMapping]: 'CUSTOM_TONE_MAPPING',
};

export type PipelineOptions = {
	/** Ambient occlusion (high quality). */
	ao: boolean;
	/** Show the occlusion buffer alone (?fx=ao). */
	aoOnly?: boolean;
};

const MSAA_SAMPLES = 4;
const size = new THREE.Vector2();

export class RenderPipeline implements FramePath {
	readonly target: THREE.WebGLRenderTarget;
	/** Shaders are linking in the background; drawing now would stall on them. */
	compiling = false;
	/**
	 * Size of the occlusion buffers per CSS pixel, in each direction, whatever the screen's
	 * density: GTAO and its denoise are the costliest passes on a large canvas, and soft
	 * occlusion upsampled (linear filtering) loses little. Takes effect on the next frame.
	 */
	aoScale = 0.7;
	private readonly ao: OfficeAO | null;
	private readonly material: THREE.RawShaderMaterial;
	private readonly quad: FullScreenQuad;
	private key = '';
	private aoKey = '';
	private outputColorSpace: string | null = null;
	private toneMapping: THREE.ToneMapping | null = null;

	constructor(
		private readonly gl: THREE.WebGLRenderer,
		scene: THREE.Scene,
		camera: THREE.Camera,
		private readonly options: PipelineOptions,
	) {
		this.target = new THREE.WebGLRenderTarget(1, 1, {
			type: THREE.HalfFloatType,
			samples: MSAA_SAMPLES,
			resolveDepthBuffer: options.ao,
			// The occlusion reads the scene's own depth, resolved from the MSAA buffer.
			...(options.ao ? { depthTexture: new THREE.DepthTexture(1, 1) } : {}),
		});
		if (options.ao) {
			const ao = new OfficeAO(scene, camera, 1, 1);
			// No normal texture: GTAO and its denoiser rebuild normals from depth, so the scene is
			// drawn once per frame instead of a second time with a normal material.
			ao.setGBuffer(this.target.depthTexture!);
			ao.updateGtaoMaterial({ radius: 1.1, distanceExponent: 1.2, thickness: 2, scale: 1.6, samples: 8 });
			ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
			// The final pass does the blend.
			ao.output = GTAOPass.OUTPUT.Off;
			this.ao = ao;
		} else this.ao = null;
		this.material = new THREE.RawShaderMaterial({
			name: 'OfficeOutput',
			uniforms: {
				tDiffuse: { value: null },
				tAO: { value: null },
				intensity: { value: 1 },
				toneMappingExposure: { value: 1 },
			},
			vertexShader: finalShader.vertexShader,
			fragmentShader: finalShader.fragmentShader,
			depthTest: false,
			depthWrite: false,
			blending: THREE.NoBlending,
		});
		this.quad = new FullScreenQuad(this.material);
		gl.shadowMap.autoUpdate = false;
		markShadows();
	}

	compile(scene: THREE.Object3D, camera: THREE.Camera) {
		this.compiling = true;
		return compileFor(this.gl, this.target, scene, camera).finally(() => {
			this.compiling = false;
		});
	}

	render(scene: THREE.Scene, camera: THREE.Camera, strength: number, time: number) {
		const gl = this.gl;
		gl.getDrawingBufferSize(size);
		const ratio = gl.getPixelRatio();
		const key = `${size.x}x${size.y}@${ratio}`;
		if (key !== this.key) {
			this.key = key;
			this.target.setSize(size.x, size.y);
			markShadows();
		}
		// Resized only when the canvas or the scale changes.
		const aoKey = `${key}/${this.aoScale}`;
		if (this.ao && aoKey !== this.aoKey) {
			this.aoKey = aoKey;
			this.ao.scale = this.aoScale / ratio;
			this.ao.setSize(size.x, size.y);
		}
		scheduleShadows(gl, time);

		gl.setRenderTarget(this.target);
		gl.render(scene, camera);
		// With its output off, GTAO only fills its occlusion buffer (ao.gtaoMap) for the final pass.
		if (this.ao) this.ao.render(gl, this.target, this.target, 0, false);

		const m = this.material;
		if (this.outputColorSpace !== gl.outputColorSpace || this.toneMapping !== gl.toneMapping) {
			this.outputColorSpace = gl.outputColorSpace;
			this.toneMapping = gl.toneMapping;
			const defines: Record<string, string> = {};
			if (THREE.ColorManagement.getTransfer(gl.outputColorSpace) === THREE.SRGBTransfer) defines.SRGB_TRANSFER = '';
			const tone = TONE_DEFINES[gl.toneMapping];
			if (tone) defines[tone] = '';
			if (this.ao) defines[this.options.aoOnly ? 'AO_ONLY' : 'USE_AO'] = '';
			m.defines = defines;
			m.needsUpdate = true;
		}
		m.uniforms.tDiffuse.value = this.target.texture;
		m.uniforms.tAO.value = this.ao ? this.ao.gtaoMap : null;
		m.uniforms.intensity.value = strength;
		m.uniforms.toneMappingExposure.value = gl.toneMappingExposure;
		gl.setRenderTarget(null);
		// The quad covers every pixel with an opaque colour: nothing to clear first.
		const autoClear = gl.autoClear;
		gl.autoClear = false;
		this.quad.render(gl);
		gl.autoClear = autoClear;
	}

	dispose() {
		this.target.depthTexture?.dispose();
		this.target.dispose();
		this.ao?.dispose();
		this.material.dispose();
		this.quad.dispose();
	}
}
