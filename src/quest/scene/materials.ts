import * as THREE from 'three';

/**
 * Materials shared by the whole office. The kit's three material names map onto these:
 * `voxel` (opaque, vertex colours), `voxel_glow` (unlit and bright, for screens and LEDs) and
 * `voxel_glass` (translucent). Procedural surfaces (walls, placeholders) get the same
 * hand-pixelled look from a tiny shader patch that jitters each 1/16 voxel cell's brightness.
 */

/**
 * Per-voxel brightness jitter in world space, like the kit's baked pixel noise.
 *
 * The cell is looked up at the centroid of the pixel's covered samples. The office renders with
 * MSAA (pipeline.ts), where a pixel on a face's edge whose centre lies just off the face still
 * shades it, at a position extrapolated past the edge: there the lookup lands in the next cell
 * over, so every edge was fringed with stray light and dark dashes that crawled as the camera
 * moved. The face's normal still comes from the centre position, whose derivatives are exact.
 */
export function voxelize<T extends THREE.Material>(material: T, amount = 0.06): T {
	material.onBeforeCompile = (shader) => {
		shader.uniforms.uVoxelJitter = { value: amount };
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nvarying vec3 vVoxelPos;\ncentroid varying vec3 vVoxelCell;')
			.replace(
				'#include <project_vertex>',
				`#include <project_vertex>
				vec4 voxelWorld = vec4(transformed, 1.0);
				#ifdef USE_INSTANCING
					voxelWorld = instanceMatrix * voxelWorld;
				#endif
				vVoxelPos = (modelMatrix * voxelWorld).xyz;
				vVoxelCell = vVoxelPos;`,
			);
		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				`#include <common>
				varying vec3 vVoxelPos;
				// The same position, taken where the pixel's covered samples are (see below).
				centroid varying vec3 vVoxelCell;
				uniform float uVoxelJitter;
				float voxelHash(vec3 p) {
					return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
				}`,
			)
			.replace(
				'#include <color_fragment>',
				`#include <color_fragment>
				vec3 voxelNormal = normalize(cross(dFdx(vVoxelPos), dFdy(vVoxelPos)));
				vec3 voxelCell = floor(vVoxelCell * 16.0 - voxelNormal * 0.5);
				diffuseColor.rgb *= 1.0 + (voxelHash(voxelCell) - 0.5) * 2.0 * uVoxelJitter;`,
			);
	};
	material.customProgramCacheKey = () => `voxel-${amount}`;
	return material;
}

let shared: ReturnType<typeof create> | null = null;

function create() {
	const voxel = new THREE.MeshLambertMaterial({ vertexColors: true });
	const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
	// Transparent and double-sided, glass and panes would be drawn twice by default (back faces,
	// then front faces), with three.js flipping `side` and re-resolving the program both times, on
	// every frame. Both faces of these thin, evenly lit shells blend to the same colour either way.
	const glass = new THREE.MeshLambertMaterial({
		vertexColors: true,
		transparent: true,
		opacity: 0.38,
		depthWrite: false,
		side: THREE.DoubleSide,
		forceSinglePass: true,
	});
	/** Walls and placeholders: one colour per instance, voxel jitter on top. */
	const solid = voxelize(new THREE.MeshLambertMaterial({ color: '#ffffff' }));
	/**
	 * Wall caps and baseboards: `solid`, pulled a hair towards the camera. They are as long as
	 * the wall body they wrap, so at every wall end their end faces share a plane with the body's;
	 * without the offset the two colours z-fought there in speckles and stripes that crawled as the
	 * camera moved. Same program as `solid`; the offset is only GL state.
	 */
	const trim = voxelize(
		new THREE.MeshLambertMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
	);
	const pane = new THREE.MeshLambertMaterial({
		color: '#bfe6ff',
		emissive: '#2a4a66',
		transparent: true,
		opacity: 0.32,
		depthWrite: false,
		side: THREE.DoubleSide,
		forceSinglePass: true,
	});
	const shadow = new THREE.MeshBasicMaterial({
		color: '#2b2433',
		transparent: true,
		opacity: 0.3,
		depthWrite: false,
	});
	// Never drawn (an invisible material is skipped by the renderer), still hit by raycasts.
	const hitbox = new THREE.MeshBasicMaterial({
		transparent: true,
		opacity: 0,
		depthWrite: false,
		colorWrite: false,
		visible: false,
	});
	/**
	 * The kit's materials again, for plain (non-instanced) meshes: characters. Instanced and plain
	 * meshes compile different programs, and one material shared by both makes three.js work out
	 * its program afresh every time a frame switches between the two.
	 */
	const actor = { voxel: voxel.clone(), glow: glow.clone(), glass: glass.clone() };
	/**
	 * Shadow depth for instanced meshes: per-instance colours (walls, floors, the street's props)
	 * and the kit's furniture. Variance shadows draw casters and receivers into the shadow map, and
	 * three.js's one built-in depth material, left to plain meshes (floors, characters), would
	 * re-resolve its program at every switch between these kinds of mesh.
	 */
	const depth = { tinted: new THREE.MeshDepthMaterial(), kit: new THREE.MeshDepthMaterial() };
	return { voxel, glow, glass, solid, trim, pane, shadow, hitbox, actor, depth };
}

export function materials() {
	if (!shared) shared = create();
	return shared;
}

let radial: THREE.Texture | null = null;
/** A soft white dot for glows, light pools and sparkles. */
export function radialTexture() {
	if (radial) return radial;
	const size = 64;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	g.addColorStop(0, 'rgba(255,255,255,1)');
	g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
	g.addColorStop(1, 'rgba(255,255,255,0)');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, size, size);
	radial = new THREE.CanvasTexture(canvas);
	radial.colorSpace = THREE.SRGBColorSpace;
	return radial;
}

/** Blob shadow under characters: chunky and soft. */
export const blobGeometry = new THREE.CircleGeometry(0.3, 12).rotateX(-Math.PI / 2);
