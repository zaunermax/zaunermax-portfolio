'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { COUNTER_TOP, DESK_TOP, STAGE_TOP } from '../world/catalog';
import { hIndex, vIndex } from '../world/furnish';
import { EDGE, type CompiledWorld } from '../world/types';
import { radialTexture } from './materials';
import type { WallCut } from './office';
import type { Lighting } from './palette';

/*
 * Evening and night: the office lights itself. Warm pools under lamps and over the café,
 * cool glows from screens, the vending machine, the fish tank and the arcade, a few real point
 * lights where it matters most (the stage, the bar), rain running down the windows, and the
 * meetup's title on the projector screen. All cheap: one instanced mesh of additive decals.
 */

const noRaycast = () => null;
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const p = new THREE.Vector3();
const s = new THREE.Vector3();
const FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const quad = new THREE.PlaneGeometry(1, 1);

/** Instance buffers grow in steps, so a world streaming in rarely has to rebuild them. */
const capacityFor = (n: number) => Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, n))));

type Pool = { x: number; y: number; z: number; r: number; color: string; strength: number };

const WARM = '#ffbe6e';
const SCREEN = '#7fc8ff';

/** Where light pools on the floor (or a desk top), with its colour, size and strength. */
export function lightPools(world: CompiledWorld): Pool[] {
	const out: Pool[] = [];
	const front = (f: CompiledWorld['furniture'][number], by: number) => {
		const face = [
			[0, 1],
			[1, 0],
			[0, -1],
			[-1, 0],
		][f.rot];
		return { x: f.x + f.w / 2 + face[0] * by, z: f.y + f.d / 2 + face[1] * by };
	};
	for (const f of world.furniture) {
		switch (f.asset) {
			case 'floor_lamp':
				out.push({ x: f.x + 0.5, y: 0.015, z: f.y + 0.5, r: 2.5, color: WARM, strength: 0.5 });
				break;
			case 'vending_machine':
				out.push({ ...front(f, 0.8), y: 0.015, r: 1.7, color: '#9fe8ff', strength: 0.45 });
				break;
			case 'arcade_cabinet':
				out.push({ ...front(f, 0.8), y: 0.015, r: 1.5, color: '#ff7ad9', strength: 0.42 });
				break;
			case 'tv_console':
			case 'fish_tank':
				out.push({ ...front(f, 0.9), y: 0.015, r: 1.8, color: '#6fb8ff', strength: 0.38 });
				break;
			case 'counter_mid':
			case 'counter_end_l':
			case 'counter_end_r':
			case 'counter_sink':
				// Pendant lamps over the bar and the kitchen counter.
				out.push({ x: f.x + 0.5, y: COUNTER_TOP + 0.01, z: f.y + 0.5, r: 0.9, color: WARM, strength: 0.6 });
				out.push({ ...front(f, 0.9), y: 0.015, r: 1.5, color: WARM, strength: 0.32 });
				break;
			case 'reception_desk':
				out.push({ ...front(f, -0.9), y: 0.015, r: 2.2, color: WARM, strength: 0.36 });
				break;
			case 'stage_block':
				out.push({ x: f.x + 0.5, y: STAGE_TOP + 0.01, z: f.y + 0.5, r: 1.2, color: '#ffd59a', strength: 0.5 });
				break;
			case 'big_desk_max':
				out.push({ ...front(f, 0.9), y: 0.015, r: 2.4, color: WARM, strength: 0.42 });
				break;
		}
	}
	// Ceiling lights left on: a faint, wide wash over every room, so the lamps' pools sit in a
	// dim room rather than in the dark, and people and furniture keep their silhouettes.
	for (const room of world.rooms) {
		if (!room.revealed || !room.kind) continue;
		const r = Math.max(2, Math.min(room.w, room.h) * 0.62);
		out.push({ x: room.x + room.w / 2, y: 0.012, z: room.y + room.h / 2, r, color: '#ffd9a0', strength: 0.13 });
	}
	for (const d of world.decor) {
		if (d.asset === 'monitor' || d.asset === 'monitor_dual' || d.asset === 'laptop') {
			// A cool glow on the desk and the floor in front of the screen.
			const fx = Math.sin(d.heading);
			const fz = Math.cos(d.heading);
			out.push({ x: d.x + fx * 0.2, y: d.y + 0.01, z: d.z + fz * 0.2, r: 0.55, color: SCREEN, strength: 0.6 });
			out.push({ x: d.x + fx * 0.95, y: 0.015, z: d.z + fz * 0.95, r: 1.1, color: SCREEN, strength: 0.2 });
		} else if (d.asset === 'desk_lamp')
			out.push({ x: d.x, y: DESK_TOP + 0.012, z: d.z, r: 0.7, color: WARM, strength: 0.8 });
		else if (d.asset === 'projector_screen')
			out.push({ x: d.x, y: STAGE_TOP + 0.012, z: d.z + 1.2, r: 2.2, color: '#d6e4ff', strength: 0.55 });
	}
	return out;
}

/**
 * Real lights at night. Every one costs a little on every lit pixel, and a change in their
 * number recompiles every lit shader, so there is always exactly this many (spares stay dark)
 * and the rest of the glow comes from the pools above.
 */
const KEY_LIGHTS = 4;

/** The handful of real lights worth their cost at night, most important first. */
function keyLights(world: CompiledWorld) {
	const out: { x: number; y: number; z: number; color: string; intensity: number; distance: number }[] = [];
	const stage = world.landmark.stage;
	if (stage) out.push({ x: stage.x, y: 2.4, z: stage.y + 1.5, color: '#ffd29a', intensity: 4, distance: 8 });
	const bar = world.furniture.find((f) => f.asset === 'espresso_machine' || f.asset.startsWith('counter_'));
	if (bar) out.push({ x: bar.x + 0.5, y: 2.2, z: bar.y + 1, color: WARM, intensity: 3, distance: 6 });
	const max = world.landmark.max;
	if (max) out.push({ x: max.x, y: 2, z: max.y + 1, color: WARM, intensity: 2.4, distance: 7 });
	const vending = world.furniture.find((f) => f.asset === 'vending_machine');
	if (vending) out.push({ x: vending.x + 0.5, y: 1.4, z: vending.y + 0.5, color: '#a6e6ff', intensity: 2.2, distance: 4 });
	for (const lamp of world.furniture.filter((f) => f.asset === 'floor_lamp').slice(0, 2))
		out.push({ x: lamp.x + 0.5, y: 1.8, z: lamp.y + 0.5, color: '#ffc875', intensity: 1.7, distance: 7 });
	const spare = { x: world.width / 2, y: 2, z: world.height / 2, color: WARM, intensity: 0, distance: 1 };
	return Array.from({ length: KEY_LIGHTS }, (_, i) => out[i] ?? spare);
}

export function NightLights({ world, lighting }: { world: CompiledWorld; lighting: Lighting }) {
	const pools = useMemo(() => lightPools(world), [world]);
	const lights = useMemo(() => keyLights(world), [world]);
	const ref = useRef<THREE.InstancedMesh>(null);
	const material = useMemo(
		() =>
			new THREE.MeshBasicMaterial({
				map: radialTexture(),
				transparent: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				toneMapped: false,
			}),
		[],
	);
	useEffect(() => () => material.dispose(), [material]);
	const strength = Math.max(0, (lighting.indoor - 0.3) / 0.7);
	const capacity = capacityFor(pools.length);
	useLayoutEffect(() => {
		const mesh = ref.current;
		if (!mesh) return;
		mesh.count = pools.length;
		const c = new THREE.Color();
		// Colour the buffer from the start, so the first pools don't switch the shader over.
		if (!mesh.instanceColor) mesh.setColorAt(0, c.setRGB(0, 0, 0));
		pools.forEach((pool, i) => {
			p.set(pool.x, pool.y, pool.z);
			s.set(pool.r * 2, pool.r * 2, 1);
			m4.compose(p, FLAT, s);
			mesh.setMatrixAt(i, m4);
			mesh.setColorAt(i, c.set(pool.color).multiplyScalar(pool.strength * strength));
		});
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}, [pools, strength, capacity]);
	if (strength <= 0) return null;
	return (
		<>
			<instancedMesh
				key={capacity}
				ref={ref}
				args={[quad, material, capacity]}
				frustumCulled={false}
				raycast={noRaycast}
				renderOrder={2}
			/>
			{lights.map((l, i) => (
				<pointLight
					key={i}
					color={l.color}
					intensity={l.intensity * strength}
					distance={l.distance}
					decay={1.4}
					position={[l.x, l.y, l.z]}
				/>
			))}
		</>
	);
}

// ---------------------------------------------------------------------------------------------
// Rain on the windows

const SILL = 0.9;
const LINTEL = 2.2;

let rain: { texture: THREE.CanvasTexture; material: THREE.MeshBasicMaterial } | null = null;

/** One shared, scrolling streak texture for every window. */
function rainGlass() {
	if (rain) return rain;
	const texture = rainTexture();
	rain = {
		texture,
		material: new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
	};
	return rain;
}

function rainTexture() {
	const c = document.createElement('canvas');
	c.width = 32;
	c.height = 128;
	const ctx = c.getContext('2d')!;
	let seed = 7;
	const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
	for (let i = 0; i < 26; i++) {
		const x = Math.floor(rnd() * 32);
		const y = Math.floor(rnd() * 128);
		const len = 6 + Math.floor(rnd() * 22);
		ctx.fillStyle = `rgba(225,238,255,${0.35 + rnd() * 0.4})`;
		ctx.fillRect(x, y, 1, len);
		if (y + len < 128) ctx.fillRect(x, y + len, 2, 2);
	}
	const t = new THREE.CanvasTexture(c);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.magFilter = THREE.NearestFilter;
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

/** Streaks running down the inside view of every window while it rains. */
export function RainOnGlass({ world, cut }: { world: CompiledWorld; cut: WallCut }) {
	const panes = useMemo(() => {
		const out: { axis: 'h' | 'v'; ex: number; ey: number; x: number; z: number; rot: number }[] = [];
		for (let x = 0; x < world.width; x++)
			if (world.hEdge[hIndex(x, 0)] === EDGE.window) out.push({ axis: 'h', ex: x, ey: 0, x: x + 0.5, z: 0.03, rot: 0 });
		for (let y = 0; y < world.height; y++) {
			if (world.vEdge[vIndex(0, y)] === EDGE.window)
				out.push({ axis: 'v', ex: 0, ey: y, x: 0.03, z: y + 0.5, rot: Math.PI / 2 });
			if (world.vEdge[vIndex(world.width, y)] === EDGE.window)
				out.push({ axis: 'v', ex: world.width, ey: y, x: world.width - 0.03, z: y + 0.5, rot: -Math.PI / 2 });
		}
		return out;
	}, [world]);
	const ref = useRef<THREE.InstancedMesh>(null);
	useFrame((state) => {
		const mesh = ref.current;
		if (!mesh) return;
		rainGlass().texture.offset.y = (state.clock.elapsedTime * 0.9) % 1;
		panes.forEach((pane, i) => {
			// Only where the window stands at full height; a cut-down wall has no glass to run down.
			const visible = cut.height(pane.axis, pane.ex, pane.ey) > LINTEL - 0.05;
			q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, pane.rot);
			p.set(pane.x, (SILL + LINTEL) / 2, pane.z);
			s.set(visible ? 0.92 : 0, visible ? LINTEL - SILL - 0.08 : 0, 1);
			m4.compose(p, q, s);
			mesh.setMatrixAt(i, m4);
		});
		mesh.instanceMatrix.needsUpdate = true;
	});
	if (!panes.length) return null;
	return (
		<instancedMesh
			key={panes.length}
			ref={ref}
			args={[new THREE.PlaneGeometry(1, 1), rainGlass().material, panes.length]}
			frustumCulled={false}
			raycast={noRaycast}
			renderOrder={4}
		/>
	);
}

// ---------------------------------------------------------------------------------------------
// The meetup's title on the projector screen

function slide(title: string, font: string) {
	const c = document.createElement('canvas');
	c.width = 512;
	c.height = 240;
	const ctx = c.getContext('2d')!;
	ctx.fillStyle = '#fbf3e4';
	ctx.fillRect(0, 0, c.width, c.height);
	ctx.fillStyle = '#54a8aa';
	ctx.fillRect(0, 0, c.width, 26);
	ctx.fillStyle = '#e8836b';
	ctx.fillRect(24, 196, 140, 14);
	ctx.fillStyle = '#dbb659';
	ctx.fillRect(176, 196, 70, 14);
	ctx.fillStyle = '#2b2433';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	// The biggest size at which the title fits on two lines.
	const words = title.split(/\s+/);
	for (let size = 64; size >= 24; size -= 2) {
		ctx.font = `400 ${size}px ${font}`;
		const lines: string[] = [];
		let line = '';
		for (const w of words) {
			const next = line ? `${line} ${w}` : w;
			if (ctx.measureText(next).width > c.width - 48 && line) {
				lines.push(line);
				line = w;
			} else line = next;
		}
		if (line) lines.push(line);
		if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= c.width - 48)) {
			const lh = size * 1.12;
			lines.forEach((l, i) => ctx.fillText(l, c.width / 2, 108 + (i - (lines.length - 1) / 2) * lh));
			break;
		}
	}
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 4;
	return t;
}

/** The event's title, projected on the meetup's screen: the room's focal point. */
export function EventScreen({ world }: { world: CompiledWorld }) {
	const event = world.event;
	const screen = useMemo(
		() =>
			event?.kind === 'meetup' && event.title
				? world.decor.find((d) => d.asset === 'projector_screen' && d.room === event.room)
				: undefined,
		[world, event],
	);
	const title = event?.title ?? '';
	const ref = useRef<THREE.Mesh>(null);
	useEffect(() => {
		const mesh = ref.current;
		if (!screen || !title || !mesh) return;
		const material = mesh.material as THREE.MeshBasicMaterial;
		let live = true;
		const root = document.querySelector('[class*="root"]');
		const pixel = root ? getComputedStyle(root).getPropertyValue('--q-pixel').trim() : '';
		const font = pixel ? `${pixel}, monospace` : 'monospace';
		const paint = () => {
			if (!live) return;
			material.map?.dispose();
			material.map = slide(title, font);
			material.needsUpdate = true;
		};
		paint();
		document.fonts?.load(`700 40px ${font}`).then(paint, () => {});
		return () => {
			live = false;
			material.map?.dispose();
			material.map = null;
		};
	}, [screen, title]);
	if (!screen) return null;
	// The kit's screen cloth spans 13–34 voxels up, its face at the model's z = 0.
	return (
		<mesh
			ref={ref}
			position={[screen.x, screen.y + 1.47, screen.z + 0.012]}
			rotation-y={screen.heading}
			raycast={noRaycast}
		>
			<planeGeometry args={[2.36, 1.2]} />
			<meshBasicMaterial toneMapped={false} />
		</mesh>
	);
}
