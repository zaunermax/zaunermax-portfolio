'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ASSETS } from '../world/catalog';
import { hIndex, vIndex } from '../world/furnish';
import { EDGE, type CompiledWorld } from '../world/types';

/*
 * Grounding and depth. Two layers, so low-quality mode still reads well:
 *
 * - Contact shade, always on: soft dark decals on the floor under every piece of furniture
 *   and along the foot of every wall, one instanced mesh each.
 * - Ambient occlusion, high quality only: three's GTAO pass between the scene render and the
 *   output pass, ignoring see-through and invisible helpers (glass, light pools, hit boxes).
 */

const noRaycast = () => null;

let rounded: THREE.Texture | null = null;
/** A blurred rounded square: dark in the middle, fading out over the outer quarter. */
function shadeTexture() {
	if (rounded) return rounded;
	const size = 64;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	// alphaMap reads the green channel, so paint grey levels on opaque black.
	ctx.fillStyle = '#000';
	ctx.fillRect(0, 0, size, size);
	ctx.filter = 'blur(7px)';
	ctx.fillStyle = '#fff';
	ctx.beginPath();
	ctx.roundRect(14, 14, size - 28, size - 28, 10);
	ctx.fill();
	rounded = new THREE.CanvasTexture(canvas);
	return rounded;
}

let fade: THREE.Texture | null = null;
/** Opaque along v = 0, gone by v = 1: the darkening at the foot of a wall. */
function fadeTexture() {
	if (fade) return fade;
	const canvas = document.createElement('canvas');
	canvas.width = 4;
	canvas.height = 32;
	const ctx = canvas.getContext('2d')!;
	const g = ctx.createLinearGradient(0, 0, 0, 32);
	g.addColorStop(0, '#fff');
	g.addColorStop(0.35, '#737373');
	g.addColorStop(1, '#000');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 4, 32);
	fade = new THREE.CanvasTexture(canvas);
	return fade;
}

const shadeMaterial = (map: THREE.Texture, opacity: number) =>
	new THREE.MeshBasicMaterial({
		color: '#2b2433',
		alphaMap: map,
		transparent: true,
		opacity,
		depthWrite: false,
		polygonOffset: true,
		polygonOffsetFactor: -2,
	});

const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
/** A strip whose v runs from the wall (0) into the room (1), lying on the floor. */
const strip = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const p = new THREE.Vector3();
const s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const WALLS = new Set<number>([EDGE.wall, EDGE.window, EDGE.door, EDGE.entrance, EDGE.glass, EDGE.glassdoor]);

export function ContactShade({ world }: { world: CompiledWorld }) {
	const under = useRef<THREE.InstancedMesh>(null);
	const foot = useRef<THREE.InstancedMesh>(null);
	const pieces = useMemo(
		() => world.furniture.filter((f) => f.blocks && ASSETS[f.asset].h > 0.2 && f.elev === 0),
		[world],
	);
	const walls = useMemo(() => {
		// Each wall edge shades the floor on both sides (outer walls only inside).
		const out: { x: number; z: number; rot: number; len: number; soft: number }[] = [];
		const { width: W, height: H } = world;
		for (let y = 0; y <= H; y++)
			for (let x = 0; x < W; x++) {
				const kind = world.hEdge[hIndex(x, y)];
				if (!WALLS.has(kind)) continue;
				const soft = kind === EDGE.glass || kind === EDGE.glassdoor ? 0.5 : 1;
				if (kind === EDGE.door || kind === EDGE.glassdoor || kind === EDGE.entrance) continue;
				if (y < H) out.push({ x: x + 0.5, z: y, rot: 0, len: 1, soft });
				if (y > 0) out.push({ x: x + 0.5, z: y, rot: Math.PI, len: 1, soft });
			}
		for (let y = 0; y < H; y++)
			for (let x = 0; x <= W; x++) {
				const kind = world.vEdge[vIndex(x, y)];
				if (!WALLS.has(kind) || kind === EDGE.door || kind === EDGE.glassdoor) continue;
				const soft = kind === EDGE.glass ? 0.5 : 1;
				if (x < W) out.push({ x, z: y + 0.5, rot: Math.PI / 2, len: 1, soft });
				if (x > 0) out.push({ x, z: y + 0.5, rot: -Math.PI / 2, len: 1, soft });
			}
		return out;
	}, [world]);
	const materials = useMemo(
		() => ({ under: shadeMaterial(shadeTexture(), 0.34), foot: shadeMaterial(fadeTexture(), 0.3) }),
		[],
	);

	useLayoutEffect(() => {
		const a = under.current;
		if (a) {
			pieces.forEach((f, i) => {
				// Taller things cast a wider, darker skirt.
				const grow = Math.min(0.5, 0.18 + ASSETS[f.asset].h * 0.12);
				p.set(f.x + f.w / 2, 0.006, f.y + f.d / 2);
				s.set(f.w + grow, 1, f.d + grow);
				m4.compose(p, q.identity(), s);
				a.setMatrixAt(i, m4);
			});
			a.instanceMatrix.needsUpdate = true;
		}
		const b = foot.current;
		if (b) {
			const white = new THREE.Color('#ffffff');
			walls.forEach((w, i) => {
				p.set(w.x, 0.005, w.z);
				q.setFromAxisAngle(UP, w.rot);
				s.set(w.len, 1, 0.42);
				m4.compose(p, q, s);
				b.setMatrixAt(i, m4);
				b.setColorAt(i, white.clone().multiplyScalar(w.soft));
			});
			b.instanceMatrix.needsUpdate = true;
			if (b.instanceColor) b.instanceColor.needsUpdate = true;
		}
	}, [pieces, walls]);

	return (
		<group>
			{pieces.length ? (
				<instancedMesh
					key={`u${pieces.length}`}
					ref={under}
					args={[plane, materials.under, pieces.length]}
					frustumCulled={false}
					raycast={noRaycast}
					renderOrder={1}
				/>
			) : null}
			{walls.length ? (
				<instancedMesh
					key={`w${walls.length}`}
					ref={foot}
					args={[strip, materials.foot, walls.length]}
					frustumCulled={false}
					raycast={noRaycast}
					renderOrder={1}
				/>
			) : null}
		</group>
	);
}

type Hideable = { _visibilityCache: THREE.Object3D[] };
type Overridable = { _renderOverride: (renderer: THREE.WebGLRenderer, ...rest: unknown[]) => void };

/**
 * GTAO that leaves out anything which does not write depth or colour: glass, decals, hit boxes.
 * Its buffers run at a fraction of the composer's size (AO is soft anyway), and its extra scene
 * render reuses the frame's shadow map instead of drawing and blurring it a second time.
 */
class OfficeAO extends GTAOPass {
	/** Size of the AO buffers relative to the composer's. */
	scale = 1;

	setSize(width: number, height: number) {
		const k = this.scale ?? 1;
		super.setSize(Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k)));
	}

	_renderOverride(renderer: THREE.WebGLRenderer, ...rest: unknown[]) {
		const auto = renderer.shadowMap.autoUpdate;
		renderer.shadowMap.autoUpdate = false;
		try {
			(GTAOPass.prototype as unknown as Overridable)._renderOverride.call(this, renderer, ...rest);
		} finally {
			renderer.shadowMap.autoUpdate = auto;
		}
	}

	_overrideVisibility() {
		const cache = (this as unknown as Hideable)._visibilityCache;
		this.scene.traverse((object) => {
			if (!object.visible) return;
			const mesh = object as THREE.Mesh;
			const material = mesh.material as THREE.Material | undefined;
			const skip =
				(object as THREE.Points).isPoints ||
				(object as THREE.Line).isLine ||
				(object as THREE.Sprite).isSprite ||
				(mesh.isMesh && material && !Array.isArray(material) && (material.transparent || !material.depthWrite || !material.colorWrite));
			if (skip) {
				object.visible = false;
				cache.push(object);
			}
		});
	}
}

/** Renders the scene through ambient occlusion and the output transform (high quality only). */
export function PostFX({ strength = 1 }: { strength?: number }) {
	const gl = useThree((state) => state.gl);
	const scene = useThree((state) => state.scene);
	const camera = useThree((state) => state.camera);
	const fx = useRef<{ composer: EffectComposer; ao: OfficeAO; size: string } | null>(null);

	useEffect(() => {
		const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
		const composer = new EffectComposer(gl, target);
		composer.addPass(new RenderPass(scene, camera));
		const ao = new OfficeAO(scene, camera, 1, 1);
		ao.updateGtaoMaterial({ radius: 1.1, distanceExponent: 1.2, thickness: 2, scale: 1.6, samples: 8 });
		ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
		// Review aid: ?fx=ao shows the occlusion buffer alone.
		if (new URLSearchParams(window.location.search).get('fx') === 'ao') ao.output = GTAOPass.OUTPUT.Denoise;
		composer.addPass(ao);
		composer.addPass(new OutputPass());
		fx.current = { composer, ao, size: '' };
		return () => {
			fx.current = null;
			composer.dispose();
		};
	}, [gl, scene, camera]);

	// A positive priority takes over rendering from R3F.
	useFrame((state, delta) => {
		const current = fx.current;
		if (!current) return gl.render(scene, camera);
		const { width, height } = state.size;
		// AO is soft anyway; capping the pixel ratio keeps it affordable on retina screens.
		const ratio = Math.min(state.viewport.dpr, 1.5);
		const size = `${width}x${height}@${ratio}`;
		if (current.size !== size) {
			// The occlusion buffers stay at one sample per CSS pixel, whatever the screen's density.
			current.ao.scale = 1 / ratio;
			current.composer.setPixelRatio(ratio);
			current.composer.setSize(width, height);
			current.size = size;
		}
		current.ao.blendIntensity = strength;
		current.composer.render(delta);
	}, 1);
	return null;
}
