'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { hIndex, vIndex } from '../world/furnish';
import { EDGE, type CompiledWorld } from '../world/types';
import type { GameBus } from './bus';
import { materials, radialTexture } from './materials';
import { VIBES, type Lighting } from './palette';
import { now, popScale, type Spawns } from './spawn';
import { canvasTexture, paintFloor } from './textures';

/*
 * The building itself, all procedural: a plinth, pixel-art floors (one canvas for the whole
 * grid, 16 pixels per tile), voxel-thick walls with baseboards and a darker cut cap, windows,
 * glass partitions and doorways.
 *
 * Walls between the camera and the visitor are cut down to 6 voxels so every room stays
 * readable; walls beyond the visitor stand at full height as a backdrop. Heights ease between
 * the two as the visitor walks, and the camera can turn, so "between" is measured along the
 * camera's view direction.
 */

const T = 4 / 16;
const LOW = 6 / 16;
const TALL = 1.9;
const TALL_OUTER = 2.75;
const GLASS_LOW = 0.9;
const GLASS_TALL = 1.6;
const SILL = 0.9;
const LINTEL = 2.2;
const DOOR = 34 / 16;
const BASE = 3 / 16;

type Segment = {
	axis: 'h' | 'v';
	x: number;
	y: number;
	kind: number;
	/** An outside wall: the building is on one side only. */
	outer: boolean;
	/** Outward normal of an outside wall (0, 0 inside the building). */
	nx: number;
	nz: number;
	/** Centre on the floor. */
	cx: number;
	cz: number;
	/** Length along the wall, including corner overlap. */
	len: number;
	/** Offset of the centre along the wall (for one-sided corner overlap). */
	shift: number;
};

const SOLID = new Set<number>([EDGE.wall, EDGE.window, EDGE.door, EDGE.entrance]);
const GLASSY = new Set<number>([EDGE.glass, EDGE.glassdoor]);

/** Whether a cell is part of the building (the grid's outline need not be a rectangle). */
export function indoors(world: Pick<CompiledWorld, 'width' | 'height' | 'roomAt'>, x: number, y: number) {
	return x >= 0 && y >= 0 && x < world.width && y < world.height && world.roomAt[y * world.width + x] >= 0;
}

function segments(world: CompiledWorld): Segment[] {
	const { width: W, height: H, hEdge, vEdge } = world;
	const out: Segment[] = [];
	const solidV = (x: number, y: number) =>
		y >= 0 && y < H && x >= 0 && x <= W && SOLID.has(vEdge[vIndex(x, y)]);
	for (let y = 0; y <= H; y++)
		for (let x = 0; x < W; x++) {
			const kind = hEdge[hIndex(x, y)];
			if (!SOLID.has(kind) && !GLASSY.has(kind)) continue;
			const above = indoors(world, x, y - 1);
			const below = indoors(world, x, y);
			const outer = above !== below;
			// Outside walls stand just outside the floor, so rooms keep their full width.
			const nz = outer ? (above ? 1 : -1) : 0;
			// Overlap into a corner where a side wall meets this one.
			const west = solidV(x, y - 1) || solidV(x, y) ? T / 2 : 0;
			const east = solidV(x + 1, y - 1) || solidV(x + 1, y) ? T / 2 : 0;
			out.push({ axis: 'h', x, y, kind, outer, nx: 0, nz, cx: x + 0.5, cz: y + (nz * T) / 2, len: 1 + west + east, shift: (east - west) / 2 });
		}
	for (let y = 0; y < H; y++)
		for (let x = 0; x <= W; x++) {
			const kind = vEdge[vIndex(x, y)];
			if (!SOLID.has(kind) && !GLASSY.has(kind)) continue;
			const left = indoors(world, x - 1, y);
			const outer = left !== indoors(world, x, y);
			const nx = outer ? (left ? 1 : -1) : 0;
			out.push({ axis: 'v', x, y, kind, outer, nx, nz: 0, cx: x + (nx * T) / 2, cz: y + 0.5, len: 1, shift: 0 });
		}
	return out;
}

/**
 * Current height of every wall edge, shared with props hanging on them. It outlives the worlds
 * streamed in during a build, so walls that were already standing keep their height.
 */
export class WallCut {
	h: Float32Array;
	v: Float32Array;
	/** Bumped whenever any height changes, so readers can skip work while walls stand still. */
	version = 0;
	constructor(width: number, height: number) {
		this.h = new Float32Array((height + 1) * width).fill(Number.NaN);
		this.v = new Float32Array(height * (width + 1)).fill(Number.NaN);
	}
	/** NaN for an edge that has never had a wall. */
	known(axis: 'h' | 'v', x: number, y: number) {
		return axis === 'h' ? this.h[hIndex(x, y)] : this.v[vIndex(x, y)];
	}
	height(axis: 'h' | 'v', x: number, y: number) {
		const h = this.known(axis, x, y);
		return Number.isNaN(h) ? TALL : h;
	}
	set(axis: 'h' | 'v', x: number, y: number, value: number) {
		const arr = axis === 'h' ? this.h : this.v;
		const i = axis === 'h' ? hIndex(x, y) : vIndex(x, y);
		if (arr[i] === value) return;
		arr[i] = value;
		this.version++;
	}
}

/** Overview heights of inner walls: across the view they stay low enough not to hide the room
 * behind them, along the view they can stand tall, so every room reads as a room. */
const OVERVIEW_ACROSS = 1.05;
const OVERVIEW_ALONG = 1.5;

/** Target height of a segment given the focus point and the camera's forward direction. */
function targetHeight(s: Segment, fx: number, fz: number, dirX: number, dirZ: number, overview: boolean) {
	const glass = GLASSY.has(s.kind);
	// Outer walls on the far side of the building stand tall as a backdrop, whichever way the
	// camera faces (north and west by default).
	if (s.outer && s.nx * dirX + s.nz * dirZ > 0.5) return TALL_OUTER;
	const ahead = (s.cx - fx) * dirX + (s.cz - fz) * dirZ;
	if (overview) {
		if (s.outer) return ahead > 6 ? TALL_OUTER : ahead > -6 ? TALL : LOW;
		const across = Math.abs(s.axis === 'h' ? dirZ : dirX) > 0.7;
		const h = across ? OVERVIEW_ACROSS : OVERVIEW_ALONG;
		return glass ? Math.min(h, GLASS_TALL) : h;
	}
	const tall = ahead > 0.9;
	if (glass) return tall ? GLASS_TALL : GLASS_LOW;
	return tall ? (s.outer ? TALL_OUTER : TALL) : LOW;
}

const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const p = new THREE.Vector3();
const sc = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

/** Caps sit a hair above the wall body so their top faces never z-fight with it. */
const CAP_LIFT = 0.004;

/** Slots per segment in each instanced mesh. */
const BODY_SLOTS = 2;

export function Walls({
	world,
	bus,
	cut,
	reducedMotion,
}: {
	world: CompiledWorld;
	bus: GameBus;
	cut: WallCut;
	reducedMotion: boolean;
}) {
	const list = useMemo(() => segments(world), [world]);
	// Room for a wall on every edge of the grid, so streamed-in walls never remount the meshes.
	const capacity = Math.max(1, (world.height + 1) * world.width + world.height * (world.width + 1));
	const heights = useRef(new Float32Array(0));
	const body = useRef<THREE.InstancedMesh>(null);
	const cap = useRef<THREE.InstancedMesh>(null);
	const base = useRef<THREE.InstancedMesh>(null);
	const pane = useRef<THREE.InstancedMesh>(null);
	const frame = useRef<THREE.InstancedMesh>(null);
	const jamb = useRef<THREE.InstancedMesh>(null);
	const force = useRef(true);
	const vibe = VIBES[world.meta.vibe];

	useLayoutEffect(() => {
		// Walls that already stood keep their height; new ones start where the cut-away wants
		// them, so a world streaming in never makes the walls bob.
		const yaw = bus.cameraYaw;
		const dirX = -Math.sin(yaw);
		const dirZ = -Math.cos(yaw);
		heights.current = Float32Array.from(list, (s) => {
			const h = cut.known(s.axis, s.x, s.y);
			return Number.isNaN(h) ? targetHeight(s, bus.player.x, bus.player.y, dirX, dirZ, bus.view.overview) : h;
		});
		force.current = true;
		for (const [mesh, slots] of [
			[body.current, BODY_SLOTS],
			[cap.current, 1],
			[base.current, 1],
			[pane.current, 1],
			[frame.current, 2],
			[jamb.current, 3],
		] as const)
			if (mesh) mesh.count = list.length * slots;
		const inner = new THREE.Color(vibe.wall);
		const outer = new THREE.Color(vibe.wall).multiplyScalar(0.92);
		const trim = new THREE.Color(vibe.trim);
		// A dark cap outlines every wall from above, cut or not, so rooms read in the overview.
		const capColor = trim.clone().multiplyScalar(0.55);
		const frameColor = new THREE.Color('#7d8796');
		list.forEach((s, i) => {
			for (let k = 0; k < BODY_SLOTS; k++) body.current?.setColorAt(i * BODY_SLOTS + k, s.outer ? outer : inner);
			cap.current?.setColorAt(i, GLASSY.has(s.kind) ? frameColor : capColor);
			base.current?.setColorAt(i, trim.clone().multiplyScalar(0.85));
			frame.current?.setColorAt(i * 2, frameColor);
			frame.current?.setColorAt(i * 2 + 1, frameColor);
			for (let k = 0; k < 3; k++) jamb.current?.setColorAt(i * 3 + k, s.kind === EDGE.glassdoor ? frameColor : trim);
		});
		for (const mesh of [body.current, cap.current, base.current, frame.current, jamb.current])
			if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
	}, [list, vibe, cut, bus, capacity]);

	useFrame((state, rawDt) => {
		const dt = Math.min(rawDt, 0.1);
		const yaw = bus.cameraYaw;
		const dirX = -Math.sin(yaw);
		const dirZ = -Math.cos(yaw);
		const { x: fx, y: fz } = bus.player;
		const overview = bus.view.overview;
		const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
		let changed = force.current;
		const hs = heights.current;
		list.forEach((s, i) => {
			const target = targetHeight(s, fx, fz, dirX, dirZ, overview);
			const h = hs[i];
			if (Math.abs(target - h) < 0.002) {
				if (h !== target) {
					hs[i] = target;
					changed = true;
				}
				return;
			}
			hs[i] = h + (target - h) * k;
			changed = true;
		});
		if (!changed) return;
		force.current = false;
		const b = body.current;
		const c = cap.current;
		const bb = base.current;
		const g = pane.current;
		const f = frame.current;
		const j = jamb.current;
		if (!b || !c || !bb || !g || !f || !j) return;
		/** Door frame: a post at each end of the opening and a lintel over it. */
		const doorFrame = (i: number, s: Segment, h: number) => {
			q.setFromAxisAngle(UP, s.axis === 'h' ? 0 : Math.PI / 2);
			const top = Math.min(h, DOOR + 0.0625);
			for (const [k, side] of [
				[0, -1],
				[1, 1],
			] as const) {
				const off = side * (0.5 - 0.05);
				p.set(s.cx + (s.axis === 'h' ? off : 0), 0, s.cz + (s.axis === 'h' ? 0 : off));
				sc.set(0.1, Math.max(0.001, top), T + 0.06);
				m4.compose(p, q, sc);
				j.setMatrixAt(i * 3 + k, m4);
			}
			if (h > DOOR) {
				p.set(s.cx, DOOR, s.cz);
				sc.set(1, 0.0625, T + 0.06);
				m4.compose(p, q, sc);
				j.setMatrixAt(i * 3 + 2, m4);
			} else j.setMatrixAt(i * 3 + 2, HIDE);
		};
		const noFrame = (i: number) => {
			for (let k = 0; k < 3; k++) j.setMatrixAt(i * 3 + k, HIDE);
		};
		const put = (mesh: THREE.InstancedMesh, slot: number, s: Segment, y0: number, y1: number, thick = T, lenScale = 1) => {
			if (y1 - y0 < 0.001) return mesh.setMatrixAt(slot, HIDE);
			q.setFromAxisAngle(UP, s.axis === 'h' ? 0 : Math.PI / 2);
			const along = s.axis === 'h' ? [s.shift, 0] : [0, s.shift];
			p.set(s.cx + along[0], y0, s.cz + along[1]);
			sc.set(s.len * lenScale, y1 - y0, thick);
			m4.compose(p, q, sc);
			mesh.setMatrixAt(slot, m4);
		};
		list.forEach((s, i) => {
			const h = hs[i];
			cut.set(s.axis, s.x, s.y, h);
			const b0 = i * BODY_SLOTS;
			if (GLASSY.has(s.kind)) {
				b.setMatrixAt(b0, HIDE);
				b.setMatrixAt(b0 + 1, HIDE);
				put(c, i, s, h - 0.06, h, T * 0.7);
				bb.setMatrixAt(i, HIDE);
				if (s.kind === EDGE.glassdoor) {
					g.setMatrixAt(i, HIDE);
					f.setMatrixAt(i * 2, HIDE);
					c.setMatrixAt(i, HIDE);
					doorFrame(i, s, h);
				} else {
					noFrame(i);
					put(g, i, s, 0.08, h - 0.06, 1 / 16);
					put(f, i * 2, s, 0, 0.08, T * 0.6);
				}
				f.setMatrixAt(i * 2 + 1, HIDE);
				return;
			}
			if (s.kind !== EDGE.door && s.kind !== EDGE.entrance) noFrame(i);
			if (s.kind === EDGE.window) {
				put(b, b0, s, 0, Math.min(h, SILL));
				put(b, b0 + 1, s, LINTEL, Math.max(LINTEL, h));
				put(g, i, s, SILL, Math.max(SILL, Math.min(h, LINTEL)), 1 / 16);
				put(f, i * 2, s, SILL, SILL + (h > SILL ? 0.0625 : 0), T + 0.08);
				put(f, i * 2 + 1, s, LINTEL - 0.06, h > LINTEL ? LINTEL : LINTEL - 0.06, T + 0.02);
				put(c, i, s, h - 0.0625, h + CAP_LIFT, T + 0.02);
				put(bb, i, s, 0, Math.min(h, BASE), T + 0.06);
				return;
			}
			g.setMatrixAt(i, HIDE);
			f.setMatrixAt(i * 2, HIDE);
			f.setMatrixAt(i * 2 + 1, HIDE);
			if (s.kind === EDGE.door || s.kind === EDGE.entrance) {
				b.setMatrixAt(b0, HIDE);
				put(b, b0 + 1, s, DOOR, Math.max(DOOR, h));
				if (h > DOOR + 0.05) put(c, i, s, h - 0.0625, h + CAP_LIFT, T + 0.02);
				else c.setMatrixAt(i, HIDE);
				if (s.kind === EDGE.entrance) put(g, i, s, 0, Math.min(h, DOOR), 1 / 16);
				bb.setMatrixAt(i, HIDE);
				doorFrame(i, s, h);
				return;
			}
			put(b, b0, s, 0, h);
			b.setMatrixAt(b0 + 1, HIDE);
			put(c, i, s, h - 0.125, h + CAP_LIFT, T + 0.04);
			put(bb, i, s, 0, Math.min(h, BASE), T + 0.06);
		});
		for (const mesh of [b, c, bb, g, f, j]) mesh.instanceMatrix.needsUpdate = true;
		void state;
	});

	const m = materials();
	const n = capacity;
	return (
		<group key={capacity}>
			<instancedMesh ref={body} args={[box, m.solid, n * BODY_SLOTS]} castShadow receiveShadow frustumCulled={false} />
			<instancedMesh ref={cap} args={[box, m.solid, n]} frustumCulled={false} />
			<instancedMesh ref={base} args={[box, m.solid, n]} frustumCulled={false} />
			<instancedMesh ref={frame} args={[box, m.solid, n * 2]} frustumCulled={false} />
			<instancedMesh ref={jamb} args={[box, m.solid, n * 3]} castShadow frustumCulled={false} />
			<instancedMesh ref={pane} args={[box, m.pane, n]} frustumCulled={false} renderOrder={3} />
		</group>
	);
}

/**
 * A low threshold strip in the trim colour along every open-plan boundary, so zones without
 * walls still read as rooms from above. Walkable: it is only two voxels high.
 */
export function Seams({ world }: { world: CompiledWorld }) {
	const ref = useRef<THREE.InstancedMesh>(null);
	const vibe = VIBES[world.meta.vibe];
	const list = useMemo(() => {
		const out: { x: number; z: number; rot: number }[] = [];
		for (let y = 1; y < world.height; y++)
			for (let x = 0; x < world.width; x++)
				if (world.hEdge[hIndex(x, y)] === EDGE.open) out.push({ x: x + 0.5, z: y, rot: 0 });
		for (let y = 0; y < world.height; y++)
			for (let x = 1; x < world.width; x++)
				if (world.vEdge[vIndex(x, y)] === EDGE.open) out.push({ x, z: y + 0.5, rot: Math.PI / 2 });
		return out;
	}, [world]);
	useLayoutEffect(() => {
		const mesh = ref.current;
		if (!mesh) return;
		const color = new THREE.Color(vibe.trim).multiplyScalar(0.7);
		list.forEach((e, i) => {
			q.setFromAxisAngle(UP, e.rot);
			p.set(e.x, 0, e.z);
			sc.set(1.02, 2 / 16, 4 / 16);
			m4.compose(p, q, sc);
			mesh.setMatrixAt(i, m4);
			mesh.setColorAt(i, color);
		});
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}, [list, vibe]);
	if (!list.length) return null;
	return <instancedMesh key={list.length} ref={ref} args={[box, materials().solid, list.length]} receiveShadow frustumCulled={false} />;
}

// ---------------------------------------------------------------------------------------------
// Floors

function roomPlane(world: CompiledWorld, x: number, y: number, w: number, h: number) {
	const g = new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2);
	const uv = g.getAttribute('uv');
	const position = g.getAttribute('position');
	for (let i = 0; i < uv.count; i++) {
		const px = position.getX(i) + x + w / 2;
		const pz = position.getZ(i) + y + h / 2;
		uv.setXY(i, px / world.width, 1 - pz / world.height);
	}
	// Centre the geometry on the room so it can pop in place.
	return g;
}

/** Everything the floor painting reads; streamed worlds that keep it skip the repaint. */
function floorSignature(world: CompiledWorld) {
	const rooms = world.rooms.map((r) => `${r.index}:${r.x},${r.y},${r.w},${r.h},${r.floor},${r.kind ?? ''}`);
	return `${world.seed}|${world.meta.company}|${world.meta.vibe}|${world.width}x${world.height}|${rooms.join(';')}`;
}

/**
 * The pixel floor's material for the component's life: a fresh one per streamed world would
 * dispose its shader program and relink it on the next frame. Repaints happen in place, and
 * only when something the painting reads has changed.
 */
class FloorPaint {
	readonly material: THREE.MeshLambertMaterial;
	private canvas: HTMLCanvasElement;
	private key: string;
	constructor(world: CompiledWorld) {
		this.canvas = paintFloor(world);
		this.material = new THREE.MeshLambertMaterial({ map: canvasTexture(this.canvas) });
		this.key = floorSignature(world);
	}
	update(world: CompiledWorld) {
		const key = floorSignature(world);
		if (key === this.key) return;
		this.key = key;
		const { width, height } = this.canvas;
		paintFloor(world, this.canvas);
		const map = this.material.map;
		if (map && width === this.canvas.width && height === this.canvas.height) map.needsUpdate = true;
		else {
			// A new size needs new texture storage; the program stays the same.
			map?.dispose();
			this.material.map = canvasTexture(this.canvas);
		}
	}
	dispose() {
		this.material.map?.dispose();
		this.material.dispose();
	}
}

export function Floors({ world, spawns }: { world: CompiledWorld; spawns: Spawns }) {
	const [floor] = useState(() => new FloorPaint(world));
	const rooms = useRef<(THREE.Mesh | null)[]>([]);
	useLayoutEffect(() => floor.update(world), [world, floor]);
	useEffect(() => () => floor.dispose(), [floor]);
	const material = floor.material;

	const planes = useMemo(
		() =>
			world.rooms.map((r) => ({
				id: `floor-${r.index}-${r.kind ?? 'bare'}`,
				x: r.x + r.w / 2,
				z: r.y + r.h / 2,
				geometry: roomPlane(world, r.x, r.y, r.w, r.h),
			})),
		[world],
	);
	useEffect(() => () => planes.forEach((plane) => plane.geometry.dispose()), [planes]);

	useFrame(() => {
		const t = now();
		planes.forEach((plane, i) => {
			const mesh = rooms.current[i];
			if (!mesh) return;
			const s = popScale(spawns.progress(plane.id, t, 0.5));
			mesh.scale.set(s, 1, s);
		});
	});

	return (
		<group>
			{/* The plinth the office stands on, following the building's outline. */}
			{world.footprint.map((r, i) => (
				<group key={`plinth-${i}-${r.x},${r.y},${r.w},${r.h}`}>
					<mesh position={[r.x + r.w / 2, -0.16, r.y + r.h / 2]} receiveShadow>
						<boxGeometry args={[r.w + 0.8, 0.3, r.h + 0.8]} />
						<meshLambertMaterial color="#a39a8c" />
					</mesh>
					<mesh position={[r.x + r.w / 2, -0.001, r.y + r.h / 2]} rotation-x={-Math.PI / 2} receiveShadow>
						<planeGeometry args={[r.w, r.h]} />
						<meshLambertMaterial color="#c8c2b6" />
					</mesh>
				</group>
			))}
			{planes.map((plane, i) => (
				<mesh
					key={plane.id}
					ref={(m) => {
						rooms.current[i] = m;
					}}
					position={[plane.x, 0.002, plane.z]}
					geometry={plane.geometry}
					material={material}
					receiveShadow
				/>
			))}
		</group>
	);
}

/**
 * Every outside window: the middle of its edge, which way the building lies from it and the edge
 * it sits on (for the wall cut).
 */
export function windowPanes(world: CompiledWorld) {
	const out: { axis: 'h' | 'v'; ex: number; ey: number; x: number; z: number; inX: number; inZ: number }[] = [];
	for (let y = 0; y <= world.height; y++)
		for (let x = 0; x < world.width; x++)
			if (world.hEdge[hIndex(x, y)] === EDGE.window)
				out.push({ axis: 'h', ex: x, ey: y, x: x + 0.5, z: y, inX: 0, inZ: indoors(world, x, y) ? 1 : -1 });
	for (let y = 0; y < world.height; y++)
		for (let x = 0; x <= world.width; x++)
			if (world.vEdge[vIndex(x, y)] === EDGE.window)
				out.push({ axis: 'v', ex: x, ey: y, x, z: y + 0.5, inX: indoors(world, x, y) ? 1 : -1, inZ: 0 });
	return out;
}

/** Planes that pool the light from each window on the floor. */
export function WindowLight({ world, lighting }: { world: CompiledWorld; lighting: Lighting }) {
	const spots = useMemo(
		() =>
			windowPanes(world).map((p) => ({
				x: p.x + p.inX * 0.9,
				z: p.z + p.inZ * 0.9,
				rot: p.axis === 'h' ? 0 : Math.PI / 2,
			})),
		[world],
	);
	const material = useMemo(
		() =>
			new THREE.MeshBasicMaterial({
				map: radialTexture(),
				color: lighting.windowLight,
				opacity: lighting.windowStrength,
				transparent: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
			}),
		[lighting],
	);
	useEffect(() => {
		materials().pane.color.set(lighting.windowGlass);
	}, [lighting]);
	return (
		<group>
			{spots.map((s, i) => (
				<mesh key={i} position={[s.x, 0.01, s.z]} rotation={[-Math.PI / 2, 0, s.rot]} material={material} renderOrder={2}>
					<planeGeometry args={[1.3, 2]} />
				</mesh>
			))}
		</group>
	);
}

/** The world outside: a lawn, a pavement around the building and the sky colour. */
export function Outside({ world, lighting }: { world: CompiledWorld; lighting: Lighting }) {
	return (
		<group>
			<mesh position={[world.width / 2, -0.32, world.height / 2]} rotation-x={-Math.PI / 2} receiveShadow>
				<planeGeometry args={[400, 400]} />
				<meshLambertMaterial color={lighting.ground} />
			</mesh>
			<mesh position={[world.width / 2, -0.31, world.height / 2]} rotation-x={-Math.PI / 2} receiveShadow>
				<planeGeometry args={[world.width + 5, world.height + 5]} />
				<meshLambertMaterial color="#c9c3b7" />
			</mesh>
		</group>
	);
}
