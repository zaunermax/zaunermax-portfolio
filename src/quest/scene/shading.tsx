'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ASSETS } from '../world/catalog';
import { hIndex, vIndex } from '../world/furnish';
import { EDGE, type CompiledWorld } from '../world/types';
import { indoors } from './office';
import type { GameBus } from './bus';
import { DirectPath, RenderPipeline, type FramePath } from './pipeline';
import { closeUpAoScale } from './quality';

/*
 * Grounding and depth. Two layers, so low-quality mode still reads well:
 *
 * - Contact shade, always on: soft dark decals on the floor under every piece of furniture
 *   and along the foot of every wall, one instanced mesh each.
 * - Ambient occlusion, high quality only: three's GTAO pass between the scene render and the
 *   output pass (pipeline.ts). It reads the scene's own depth buffer, which see-through and
 *   invisible helpers (glass, light pools, hit boxes) never write.
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
		// Each wall edge shades the floor on both sides, where there is floor.
		const out: { x: number; z: number; rot: number; len: number; soft: number }[] = [];
		const { width: W, height: H } = world;
		for (let y = 0; y <= H; y++)
			for (let x = 0; x < W; x++) {
				const kind = world.hEdge[hIndex(x, y)];
				if (!WALLS.has(kind)) continue;
				const soft = kind === EDGE.glass || kind === EDGE.glassdoor ? 0.5 : 1;
				if (kind === EDGE.door || kind === EDGE.glassdoor || kind === EDGE.entrance) continue;
				if (indoors(world, x, y)) out.push({ x: x + 0.5, z: y, rot: 0, len: 1, soft });
				if (indoors(world, x, y - 1)) out.push({ x: x + 0.5, z: y, rot: Math.PI, len: 1, soft });
			}
		for (let y = 0; y < H; y++)
			for (let x = 0; x <= W; x++) {
				const kind = world.vEdge[vIndex(x, y)];
				if (!WALLS.has(kind) || kind === EDGE.door || kind === EDGE.glassdoor) continue;
				const soft = kind === EDGE.glass ? 0.5 : 1;
				if (indoors(world, x, y)) out.push({ x, z: y + 0.5, rot: Math.PI / 2, len: 1, soft });
				if (indoors(world, x - 1, y)) out.push({ x, z: y + 0.5, rot: -Math.PI / 2, len: 1, soft });
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

/**
 * Draws every frame through the office's render pipeline (pipeline.ts): the scene into one MSAA
 * target, GTAO from its depth in high quality, then a single pass to the canvas. Low quality on
 * an antialiased canvas draws straight to it instead.
 */
export function Render({
	ao,
	aoScale,
	bus,
	direct,
	strength = 1,
	onPipeline,
}: {
	/** Ambient occlusion on (high quality, not lite). */
	ao: boolean;
	/** Occlusion buffer size per CSS pixel, in each direction, at the default camera distance. */
	aoScale: number;
	/** The camera's distance, for a coarser occlusion up close (quality.ts closeUpAoScale). */
	bus: GameBus;
	/** Straight to the canvas (low quality on a canvas created with antialiasing). */
	direct: boolean;
	strength?: number;
	/** Hands the path to whoever compiles the shaders before the first frames. */
	onPipeline: (path: FramePath | null) => void;
}) {
	const gl = useThree((state) => state.gl);
	const scene = useThree((state) => state.scene);
	const camera = useThree((state) => state.camera);
	const fx = useRef<FramePath | null>(null);
	const handOver = useRef(onPipeline);
	useEffect(() => {
		handOver.current = onPipeline;
	}, [onPipeline]);

	useEffect(() => {
		// Review aid: ?fx=ao shows the occlusion buffer alone.
		const aoOnly = new URLSearchParams(window.location.search).get('fx') === 'ao';
		const current = direct && !ao ? new DirectPath(gl) : new RenderPipeline(gl, scene, camera, { ao, aoOnly });
		fx.current = current;
		handOver.current(current);
		return () => {
			fx.current = null;
			handOver.current(null);
			current.dispose();
		};
	}, [gl, scene, camera, ao, direct]);

	// A positive priority takes over rendering from R3F.
	useFrame((state) => {
		const current = fx.current;
		// Nothing draws while the shaders link in the background (under the loading veil).
		if (!current || current.compiling) return;
		if (current instanceof RenderPipeline) current.aoScale = closeUpAoScale(aoScale, bus.view.dist);
		current.render(scene, camera, strength, state.clock.elapsedTime);
	}, 1);
	return null;
}
