'use client';

import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
	cellAt,
	findPath,
	GRID_H,
	GRID_W,
	isPassable,
	isWalkable,
	nearestWalkableCell,
	sampleHeight,
	surfaceHeight,
	WATER_LEVEL,
	type Cell,
	type CompiledWorld,
} from '../world/compile';
import { isTypingTarget } from '../ui/hooks';
import { ActorModel, BlobShadow, turn, type Motion } from './actors';
import type { GameBus, Interactable, WalkTarget } from './bus';
import { materials } from './materials';
import { terrainHeightAt } from './terrain';

const RUN = 4.2;
const JUMP = 6.2;
const GRAVITY = 18;
const RADIUS = 0.24;
const CENTER = new THREE.Vector3(GRID_W / 2, 0.5, GRID_H / 2);

type Player = {
	x: number;
	y: number;
	h: number;
	vy: number;
	heading: number;
	path: { x: number; y: number }[];
	goal: WalkTarget | null;
	airborne: boolean;
	nearbyAt: number;
};

type Rig = {
	yaw: number;
	pitch: number;
	dist: number;
	targetDist: number;
	overview: number;
	focus: THREE.Vector3;
	pointers: Map<number, { x: number; y: number }>;
	dragFrom: { x: number; y: number } | null;
	dragged: boolean;
	pinch: number | null;
	/** Distance the camera may use without clipping into a building. */
	clear: number;
	/** Extra pitch while looking over an obstacle. */
	lift: number;
};

type Box = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };

const BUILDING_HEIGHT: Record<string, number> = {
	cottage: 3.2,
	farmhouse: 3.6,
	windmill: 4.8,
	watchtower: 6,
	barn: 3.4,
	tent: 1.5,
	ruin: 2.4,
	well: 2.2,
	smithy: 2.4,
	tavern: 4,
	chapel: 5.2,
};
const LANDMARK_HEIGHT: Record<string, number> = {
	max: 1.9,
	library: 5,
	stage: 3.2,
	questboard: 2.3,
	worldforge: 3,
};

/** Slab test: distance along the ray to the box, or null. */
function rayBox(
	ox: number,
	oy: number,
	oz: number,
	dx: number,
	dy: number,
	dz: number,
	b: Box,
) {
	let tmin = 0;
	let tmax = Infinity;
	const axes: [number, number, number, number][] = [
		[ox, dx, b.x0, b.x1],
		[oy, dy, b.y0, b.y1],
		[oz, dz, b.z0, b.z1],
	];
	for (const [o, d, lo, hi] of axes) {
		if (Math.abs(d) < 1e-6) {
			if (o < lo || o > hi) return null;
			continue;
		}
		let t1 = (lo - o) / d;
		let t2 = (hi - o) / d;
		if (t1 > t2) [t1, t2] = [t2, t1];
		tmin = Math.max(tmin, t1);
		tmax = Math.min(tmax, t2);
		if (tmin > tmax) return null;
	}
	return tmin > 0 ? tmin : null;
}

const viewProj = new THREE.Matrix4();

const MOVE_KEYS: Record<string, [number, number]> = {
	KeyW: [0, 1],
	ArrowUp: [0, 1],
	KeyS: [0, -1],
	ArrowDown: [0, -1],
	KeyA: [-1, 0],
	ArrowLeft: [-1, 0],
	KeyD: [1, 0],
	ArrowRight: [1, 0],
};

/** Smooths a cell path into waypoints, dropping corners a straight walk can skip. */
function waypoints(world: CompiledWorld, cells: Cell[], from: { x: number; y: number }) {
	const pts = cells.map((c) => ({ x: c.x + 0.5, y: c.y + 0.5 }));
	if (!pts.length) return pts;
	const clear = (a: { x: number; y: number }, b: { x: number; y: number }) => {
		const d = Math.hypot(b.x - a.x, b.y - a.y);
		const n = Math.ceil(d / 0.2);
		for (let i = 1; i <= n; i++) {
			const t = i / n;
			const x = a.x + (b.x - a.x) * t;
			const y = a.y + (b.y - a.y) * t;
			for (const [ox, oy] of [
				[RADIUS, 0],
				[-RADIUS, 0],
				[0, RADIUS],
				[0, -RADIUS],
			])
				if (!isWalkable(world, Math.floor(x + ox), Math.floor(y + oy))) return false;
		}
		return true;
	};
	const out: { x: number; y: number }[] = [];
	let anchor = from;
	let i = 0;
	while (i < pts.length) {
		let j = pts.length - 1;
		while (j > i && !clear(anchor, pts[j])) j--;
		out.push(pts[j]);
		anchor = pts[j];
		i = j + 1;
	}
	return out;
}

export function Controller({
	world,
	bus,
	mode,
	inputEnabled,
	reducedMotion,
	respawnKey,
}: {
	world: CompiledWorld;
	bus: GameBus;
	mode: 'play' | 'overview';
	inputEnabled: boolean;
	reducedMotion: boolean;
	respawnKey: string;
}) {
	const gl = useThree((s) => s.gl);
	const group = useRef<THREE.Group>(null);
	const inner = useRef<THREE.Group>(null);
	const ring = useRef<THREE.Mesh>(null);
	const ringAt = useRef<{ x: number; y: number; t: number } | null>(null);
	const motion = useRef<Motion>({ moving: false, speed: 1 });
	const keys = useRef(new Set<string>());
	const jumpQueued = useRef(false);
	const input = useRef(inputEnabled);
	const worldRef = useRef(world);
	const player = useRef<Player>({
		x: world.spawn.x + 0.5,
		y: world.spawn.y + 0.5,
		h: 0,
		vy: 0,
		heading: Math.PI,
		path: [],
		goal: null,
		airborne: false,
		nearbyAt: 0,
	});
	const rig = useRef<Rig>({
		yaw: 0,
		pitch: 0.5,
		dist: 10.5,
		targetDist: 10.5,
		overview: mode === 'overview' ? 1 : 0,
		focus: new THREE.Vector3(),
		pointers: new Map(),
		dragFrom: null,
		dragged: false,
		pinch: null,
		clear: 10.5,
		lift: 0,
	});

	useEffect(() => {
		input.current = inputEnabled;
		if (!inputEnabled) keys.current.clear();
	}, [inputEnabled]);

	const obstacles = useMemo(() => {
		const out: Box[] = [];
		for (const b of world.buildings) {
			const h = BUILDING_HEIGHT[b.kind];
			if (!h) continue;
			const half = b.kind === 'tent' || b.kind === 'well' ? 0.6 : 1.25;
			const y = sampleHeight(world, b.x, b.y);
			out.push({
				x0: b.x - half,
				x1: b.x + half,
				y0: y - 1,
				y1: y + h,
				z0: b.y - half,
				z1: b.y + half,
			});
		}
		for (const l of world.landmarks) {
			const half = l.landmark === 'questboard' || l.landmark === 'worldforge' ? 0.5 : 1.4;
			const y = sampleHeight(world, l.x, l.y);
			out.push({
				x0: l.x - half,
				x1: l.x + half,
				y0: y - 1,
				y1: y + LANDMARK_HEIGHT[l.landmark],
				z0: l.y - half,
				z1: l.y + half,
			});
		}
		return out;
	}, [world]);

	const treeCells = useMemo(() => {
		const map = new Map<number, { x: number; y: number }[]>();
		for (const t of world.trees) {
			const i = Math.floor(t.y) * GRID_W + Math.floor(t.x);
			map.set(i, [...(map.get(i) ?? []), { x: t.x, y: t.y }]);
		}
		return map;
	}, [world]);

	// Keep the visitor out of anything a new world put where they stood.
	useEffect(() => {
		worldRef.current = world;
		const p = player.current;
		const c = cellAt(p.x, p.y);
		if (!isPassable(world, c.x, c.y)) {
			const near = nearestWalkableCell(world, c);
			if (near) {
				p.x = near.x + 0.5;
				p.y = near.y + 0.5;
			}
		}
		p.path = [];
	}, [world]);

	// Respawn next to Max when a new world arrives (and on first mount).
	useEffect(() => {
		const w = worldRef.current;
		const p = player.current;
		p.x = w.spawn.x + 0.5;
		p.y = w.spawn.y + 0.5;
		p.path = [];
		p.goal = null;
		p.vy = 0;
		const max = w.landmark.max;
		p.heading = max ? Math.atan2(max.x - p.x, max.y - p.y) : Math.PI;
		rig.current.yaw = p.heading + Math.PI;
	}, [respawnKey]);

	// Keyboard.
	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (!input.current || isTypingTarget(e.target)) return;
			if (MOVE_KEYS[e.code]) {
				keys.current.add(e.code);
				if (e.code.startsWith('Arrow')) e.preventDefault();
				return;
			}
			if (e.code === 'Space') {
				const t = e.target as HTMLElement | null;
				if (t && t !== document.body && t.tagName !== 'CANVAS') return;
				e.preventDefault();
				jumpQueued.current = true;
			}
			if (e.code === 'KeyF' && !e.repeat) bus.interact();
		};
		const up = (e: KeyboardEvent) => keys.current.delete(e.code);
		const blur = () => keys.current.clear();
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		window.addEventListener('blur', blur);
		return () => {
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
			window.removeEventListener('blur', blur);
		};
	}, [bus]);

	// Drag to orbit, wheel and pinch to zoom.
	useEffect(() => {
		const el = gl.domElement;
		const r = rig.current;
		const onDown = (e: PointerEvent) => {
			r.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			r.dragFrom = { x: e.clientX, y: e.clientY };
			r.dragged = false;
			if (r.pointers.size === 2) {
				const [a, b] = [...r.pointers.values()];
				r.pinch = Math.hypot(a.x - b.x, a.y - b.y);
			}
		};
		const onMove = (e: PointerEvent) => {
			const prev = r.pointers.get(e.pointerId);
			if (!prev) return;
			const dx = e.clientX - prev.x;
			const dy = e.clientY - prev.y;
			r.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (r.pointers.size >= 2) {
				const [a, b] = [...r.pointers.values()];
				const d = Math.hypot(a.x - b.x, a.y - b.y);
				if (r.pinch)
					r.targetDist = THREE.MathUtils.clamp(r.targetDist * (r.pinch / d), 4, 24);
				r.pinch = d;
				r.dragged = true;
				return;
			}
			if (
				r.dragFrom &&
				Math.hypot(e.clientX - r.dragFrom.x, e.clientY - r.dragFrom.y) > 5
			)
				r.dragged = true;
			if (!r.dragged) return;
			r.yaw -= dx * 0.006;
			r.pitch = THREE.MathUtils.clamp(r.pitch + dy * 0.004, 0.08, 1.3);
		};
		const onUp = (e: PointerEvent) => {
			r.pointers.delete(e.pointerId);
			if (r.pointers.size < 2) r.pinch = null;
		};
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			r.targetDist = THREE.MathUtils.clamp(
				r.targetDist *
					(1 + Math.sign(e.deltaY) * Math.min(0.25, Math.abs(e.deltaY) * 0.0015)),
				4,
				24,
			);
		};
		el.addEventListener('pointerdown', onDown);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			el.removeEventListener('pointerdown', onDown);
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
			el.removeEventListener('wheel', onWheel);
		};
	}, [gl]);

	// Walk commands from clicks, the minimap and the HUD.
	useEffect(
		() =>
			bus.onWalk((target) => {
				const w = worldRef.current;
				const p = player.current;
				let goal: Cell | null = null;
				if (target.kind === 'cell') goal = { x: target.x, y: target.y };
				else if (target.kind === 'landmark')
					goal = w.landmark[target.id]?.interact ?? null;
				else {
					const pos = bus.npcs.get(target.id);
					if (pos) goal = cellAt(pos.x, pos.y);
				}
				if (!goal) return;
				const cells = findPath(w, cellAt(p.x, p.y), goal);
				if (!cells) return;
				p.path = waypoints(w, cells.slice(1), p);
				if (target.kind === 'npc' && p.path.length > 1) p.path.pop();
				p.goal = target.kind === 'cell' ? null : target;
				const last = p.path.at(-1) ?? { x: p.x, y: p.y };
				ringAt.current = { x: last.x, y: last.y, t: performance.now() };
			}),
		[bus],
	);

	const arrive = (goal: WalkTarget) => {
		const w = worldRef.current;
		let target: Interactable | null = null;
		if (goal.kind === 'landmark') {
			const l = w.landmark[goal.id];
			if (l) {
				target = { kind: 'landmark', id: l.landmark, name: l.name };
				player.current.heading = Math.atan2(
					l.x - player.current.x,
					l.y - player.current.y,
				);
			}
		} else if (goal.kind === 'npc') {
			const n = w.npcs.find((x) => x.id === goal.id);
			if (n) target = { kind: 'npc', id: n.id, name: n.name, npc: n.kind, line: n.line };
		}
		if (target) bus.emitInteract(target);
	};

	const canStand = (x: number, y: number) => {
		const w = worldRef.current;
		if (x < 0.3 || y < 0.3 || x > GRID_W - 0.3 || y > GRID_H - 0.3) return false;
		for (const [ox, oy] of [
			[0, 0],
			[RADIUS, 0],
			[-RADIUS, 0],
			[0, RADIUS],
			[0, -RADIUS],
		])
			if (!isPassable(w, Math.floor(x + ox), Math.floor(y + oy))) return false;
		return true;
	};

	const pushOutOfTrunks = (x: number, y: number) => {
		const cx = Math.floor(x);
		const cy = Math.floor(y);
		for (let dy = -1; dy <= 1; dy++)
			for (let dx = -1; dx <= 1; dx++) {
				const list = treeCells.get((cy + dy) * GRID_W + cx + dx);
				if (!list) continue;
				for (const t of list) {
					const ddx = x - t.x;
					const ddy = y - t.y;
					const d = Math.hypot(ddx, ddy);
					const min = 0.4;
					if (d < min && d > 1e-4) {
						x = t.x + (ddx / d) * min;
						y = t.y + (ddy / d) * min;
					}
				}
			}
		return { x, y };
	};

	useFrame((state, rawDt) => {
		const dt = Math.min(rawDt, 0.05);
		const w = worldRef.current;
		const p = player.current;
		const r = rig.current;
		const overviewWanted = mode === 'overview';

		// --- input
		let ix = 0;
		let iy = 0;
		if (!overviewWanted)
			for (const code of keys.current) {
				const v = MOVE_KEYS[code];
				if (v) {
					ix += v[0];
					iy += v[1];
				}
			}
		let vx = 0;
		let vy = 0;
		if (ix || iy) {
			p.path = [];
			p.goal = null;
			const fx = -Math.sin(r.yaw);
			const fz = -Math.cos(r.yaw);
			const rx = -fz;
			const rz = fx;
			vx = fx * iy + rx * ix;
			vy = fz * iy + rz * ix;
			const len = Math.hypot(vx, vy) || 1;
			vx = (vx / len) * RUN;
			vy = (vy / len) * RUN;
		} else if (p.path.length && !overviewWanted) {
			const next = p.path[0];
			const dx = next.x - p.x;
			const dy = next.y - p.y;
			const d = Math.hypot(dx, dy);
			if (d < 0.12) {
				p.path.shift();
				if (!p.path.length && p.goal) {
					const g = p.goal;
					p.goal = null;
					arrive(g);
				}
			} else {
				const speed = Math.min(RUN, d / dt);
				vx = (dx / d) * speed;
				vy = (dy / d) * speed;
			}
		}

		let moving = false;
		if (vx || vy) {
			const nx = p.x + vx * dt;
			const ny = p.y + vy * dt;
			let px = p.x;
			let py = p.y;
			if (canStand(nx, ny)) {
				px = nx;
				py = ny;
			} else if (canStand(nx, p.y)) px = nx;
			else if (canStand(p.x, ny)) py = ny;
			else if (p.path.length) p.path = [];
			const pushed = pushOutOfTrunks(px, py);
			if (canStand(pushed.x, pushed.y)) {
				px = pushed.x;
				py = pushed.y;
			}
			moving = Math.hypot(px - p.x, py - p.y) > 1e-4;
			p.x = px;
			p.y = py;
			p.heading = turn(p.heading, Math.atan2(vx, vy), dt * 14);
		}

		// --- jump and gravity
		const ground = surfaceHeight(w, p.x, p.y);
		if (jumpQueued.current && !p.airborne) {
			p.vy = JUMP;
			p.airborne = true;
		}
		jumpQueued.current = false;
		if (p.airborne || p.h > ground + 0.01) {
			p.vy -= GRAVITY * dt;
			p.h += p.vy * dt;
			if (p.h <= ground) {
				p.h = ground;
				p.vy = 0;
				p.airborne = false;
			}
		} else p.h = ground;

		motion.current.moving = moving;
		motion.current.speed = 1;
		motion.current.airborne = p.airborne;
		const g = group.current;
		if (g) g.position.set(p.x, p.h, p.y);
		if (inner.current) inner.current.rotation.y = p.heading;
		bus.setPlayer(p.x, p.y, p.heading, moving);

		// --- what is in reach
		if (state.clock.elapsedTime - p.nearbyAt > 0.1) {
			p.nearbyAt = state.clock.elapsedTime;
			let best: Interactable | null = null;
			let bestD = Infinity;
			for (const l of w.landmarks) {
				const d1 = Math.hypot(p.x - (l.interact.x + 0.5), p.y - (l.interact.y + 0.5));
				const d2 = Math.hypot(p.x - l.x, p.y - l.y);
				const reach =
					l.landmark === 'questboard' || l.landmark === 'worldforge' ? 2.2 : 2.7;
				const d = Math.min(d1 + 0.6, d2);
				if ((d1 < 1.5 || d2 < reach) && d < bestD) {
					best = { kind: 'landmark', id: l.landmark, name: l.name };
					bestD = d;
				}
			}
			for (const n of w.npcs) {
				const pos = bus.npcs.get(n.id);
				if (!pos) continue;
				const d = Math.hypot(p.x - pos.x, p.y - pos.y);
				if (d < 1.8 && d < bestD) {
					best = { kind: 'npc', id: n.id, name: n.name, npc: n.kind, line: n.line };
					bestD = d;
				}
			}
			bus.setNearby(mode === 'overview' ? null : best);
		}

		// --- camera
		const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 1.6);
		r.overview += ((overviewWanted ? 1 : 0) - r.overview) * k;
		if (overviewWanted && !reducedMotion) r.yaw += dt * 0.07;
		r.dist += (r.targetDist - r.dist) * (1 - Math.exp(-dt * 8));
		const ov = r.overview;
		const focus = r.focus.set(p.x, p.h + 1.15, p.y).lerp(CENTER, ov);
		const pitch = THREE.MathUtils.lerp(r.pitch, 0.78, ov);
		// Like the old games: walls and roofs pull the camera in instead of hiding the hero, and
		// when that would put it in the hero's face it tilts up to look over the obstacle.
		const wanted = r.dist;
		const reach = (pt: number) => {
			const dx = Math.sin(r.yaw) * Math.cos(pt);
			const dy = Math.sin(pt);
			const dz = Math.cos(r.yaw) * Math.cos(pt);
			let c = wanted;
			for (const b of obstacles) {
				const t = rayBox(focus.x, focus.y, focus.z, dx, dy, dz, b);
				if (t !== null && t < c) c = Math.max(1, t - 0.35);
			}
			return c;
		};
		let clear = wanted;
		let lift = 0;
		if (ov < 0.5) {
			clear = reach(pitch);
			if (clear < wanted * 0.75)
				for (const step of [0.45, 0.8]) {
					const up = Math.min(1.3, pitch + step) - pitch;
					const higher = reach(pitch + up);
					if (higher > clear + 0.5) {
						clear = higher;
						lift = up;
					}
				}
		}
		const kIn = 1 - Math.exp(-dt * 14);
		const kOut = 1 - Math.exp(-dt * 2.5);
		r.clear += (clear - r.clear) * (clear < r.clear ? kIn : kOut);
		r.lift += (lift - r.lift) * (lift > r.lift ? kIn : kOut);
		const camPitch = pitch + r.lift * (1 - ov);
		const dist = THREE.MathUtils.lerp(Math.min(r.dist, r.clear), 34, ov);
		const cx = focus.x + Math.sin(r.yaw) * Math.cos(camPitch) * dist;
		const cz = focus.z + Math.cos(r.yaw) * Math.cos(camPitch) * dist;
		let cy = focus.y + Math.sin(camPitch) * dist;
		const floor = Math.max(terrainHeightAt(w.heights, cx, cz), WATER_LEVEL) + 0.6;
		if (cy < floor) cy = floor;
		state.camera.position.set(cx, cy, cz);
		state.camera.lookAt(focus);
		state.camera.updateMatrixWorld();
		viewProj.multiplyMatrices(
			state.camera.projectionMatrix,
			state.camera.matrixWorldInverse,
		);
		bus.setView(viewProj.elements, cx, cy, cz, ov > 0.5);
		bus.setCameraYaw(r.yaw);

		// --- click marker
		const m = ring.current;
		const at = ringAt.current;
		if (m) {
			const age = at ? (performance.now() - at.t) / 1000 : 9;
			if (at && age < 0.9) {
				m.visible = true;
				m.position.set(at.x, sampleHeight(w, at.x, at.y) + 0.06, at.y);
				const s = 0.6 + age * 0.6;
				m.scale.set(s, s, s);
				(m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - age / 0.9);
			} else m.visible = false;
		}
	});

	const onGround = (e: ThreeEvent<MouseEvent>) => {
		e.stopPropagation();
		if (e.delta > 8 || rig.current.dragged || mode === 'overview') return;
		const w = worldRef.current;
		const o = e.ray.origin;
		const d = e.ray.direction;
		let prev = 0;
		for (let t = 0.5; t < 160; t += 0.25) {
			const x = o.x + d.x * t;
			const y = o.y + d.y * t;
			const z = o.z + d.z * t;
			const inside = x >= 0 && z >= 0 && x < GRID_W && z < GRID_H;
			const h = inside
				? Math.max(sampleHeight(w, x, z), WATER_LEVEL)
				: terrainHeightAt(w.heights, x, z);
			if (y <= h) {
				if (!inside) return;
				let lo = prev;
				let hi = t;
				for (let i = 0; i < 8; i++) {
					const mid = (lo + hi) / 2;
					const mx = o.x + d.x * mid;
					const mz = o.z + d.z * mid;
					if (o.y + d.y * mid <= Math.max(sampleHeight(w, mx, mz), WATER_LEVEL)) hi = mid;
					else lo = mid;
				}
				const hx = o.x + d.x * hi;
				const hz = o.z + d.z * hi;
				bus.walkTo({ kind: 'cell', x: Math.floor(hx), y: Math.floor(hz) });
				return;
			}
			prev = t;
		}
	};

	return (
		<>
			<group ref={group}>
				<group ref={inner}>
					<ActorModel kind="visitor" motion={motion} reducedMotion={reducedMotion} />
				</group>
				<BlobShadow />
			</group>
			<mesh
				position={[GRID_W / 2, -4, GRID_H / 2]}
				rotation-x={-Math.PI / 2}
				material={materials().hitbox}
				onClick={onGround}
			>
				<planeGeometry args={[400, 400]} />
			</mesh>
			<mesh ref={ring} rotation-x={-Math.PI / 2} visible={false} renderOrder={5}>
				<ringGeometry args={[0.32, 0.42, 24]} />
				<meshBasicMaterial color="#9dff5a" transparent depthWrite={false} />
			</mesh>
		</>
	);
}
