import * as THREE from 'three';

/**
 * Materials shared by every prefab. Lambert with vertex colours keeps the hand-painted look
 * cheap; glass and glow are tuned per time of day by the atmosphere.
 */

let shared: ReturnType<typeof create> | null = null;

function create() {
	const body = new THREE.MeshLambertMaterial({ vertexColors: true });
	const glass = new THREE.MeshLambertMaterial({ color: '#3a4a66', emissive: '#000000' });
	const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
	const flame = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
	const marker = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
	const shadow = new THREE.MeshBasicMaterial({
		color: '#000000',
		transparent: true,
		opacity: 0.28,
		depthWrite: false,
	});
	const hitbox = new THREE.MeshBasicMaterial({
		transparent: true,
		opacity: 0,
		depthWrite: false,
		colorWrite: false,
	});
	const halo = new THREE.SpriteMaterial({
		map: radialTexture(),
		color: '#ffc864',
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		opacity: 0,
	});
	const pool = new THREE.MeshBasicMaterial({
		map: radialTexture(),
		color: '#ffb850',
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		opacity: 0,
	});
	const rune = new THREE.SpriteMaterial({
		map: radialTexture(),
		color: '#7ff0ff',
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		opacity: 0.6,
	});
	return { body, glass, glow, flame, marker, shadow, hitbox, halo, pool, rune };
}

export function materials() {
	if (!shared) shared = create();
	return shared;
}

let radial: THREE.Texture | null = null;
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

/** Blob shadow under characters and small props: WoW never had real ones either. */
export const blobGeometry = new THREE.CircleGeometry(0.32, 16).rotateX(-Math.PI / 2);
