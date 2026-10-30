'use client';

import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
	cellAt,
	collides,
	findPath,
	nearestOpenCell,
	type Cell,
	type CompiledWorld,
} from '../world/compile';
import { CAMERA_YAW } from '../world/types';
import type { Appearance } from '../world/appearance';
import { isTypingTarget } from '../ui/hooks';
import { ActorModel, BlobShadow, turn, type Motion } from './actors';
import type { GameBus, Interactable, WalkTarget } from './bus';
import { materials } from './materials';
import { now } from './spawn';

/*
 * The visitor and the camera. The camera is a fixed three-quarter view (pitch 50°) from the
 * south-east (CAMERA_YAW) that follows the visitor, Minecraft Dungeons style; Q/E turn it by
 * 90°, the wheel zooms a little. WASD walks relative to the camera; clicks walk along an A*
 * path on the grid. On touch, a finger held on the screen walks the visitor towards it.
 */

const RUN = 4;
const RADIUS = 0.22;
const PITCH = (50 * Math.PI) / 180;
const OVERVIEW_PITCH = (62 * Math.PI) / 180;
const MIN_DIST = 13;
const MAX_DIST = 30;
const OVERVIEW_DIST = 50;
/** A touch held this long (or dragged this far) steers the visitor instead of tapping. */
const HOLD_MS = 180;
const HOLD_DRAG_PX = 10;
/** A still finger lifted sooner than this still taps (a slow tap on a person must still reach them). */
const HOLD_SWALLOW_MS = 400;
/** Within this many cells of the finger the visitor stands still rather than jitter. */
const HOLD_DEAD_ZONE = 0.45;

/** The finger steering the visitor, in client px. */
type Hold = { id: number; x: number; y: number; startX: number; startY: number; at: number; active: boolean };

type Player = {
	x: number;
	y: number;
	heading: number;
	path: { x: number; y: number }[];
	goal: WalkTarget | null;
	nearbyAt: number;
};

type Rig = {
	yaw: number;
	targetYaw: number;
	dist: number;
	targetDist: number;
	overview: number;
	focus: THREE.Vector3;
};

const viewProj = new THREE.Matrix4();
// At the camera's focus height, so a finger on the visitor's body lands on the visitor.
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.6);
const holdRay = new THREE.Raycaster();
const holdNdc = new THREE.Vector2();
const holdPoint = new THREE.Vector3();

/** Free screen area around the HUD, in px from each edge, re-measured a few times a second. */
type Insets = { top: number; bottom: number; left: number; right: number };
const fitCam = new THREE.PerspectiveCamera();
const fitPoint = new THREE.Vector3();
const fitRight = new THREE.Vector3();
const fitUp = new THREE.Vector3();

/**
 * The overview's camera distance and focus: the whole building (walls included) as large as it
 * fits in the screen area the HUD leaves free, centred in it.
 */
function fitOverview(
	world: Pick<CompiledWorld, 'width' | 'height'>,
	yaw: number,
	pitch: number,
	camera: THREE.PerspectiveCamera,
	size: { width: number; height: number },
	insets: Insets,
	out: { dist: number; focus: THREE.Vector3 },
) {
	fitCam.fov = camera.fov;
	fitCam.aspect = size.width / Math.max(1, size.height);
	fitCam.near = camera.near;
	fitCam.far = camera.far;
	fitCam.updateProjectionMatrix();
	const free = {
		w: Math.max(80, size.width - insets.left - insets.right),
		h: Math.max(80, size.height - insets.top - insets.bottom),
	};
	const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
	const focus = out.focus.set(world.width / 2, 0, world.height / 2);
	/** Screen-space bounds of the building in px for a camera `d` away from `focus`. */
	const bounds = (d: number) => {
		fitCam.position.copy(focus).addScaledVector(dir, d);
		fitCam.lookAt(focus);
		fitCam.updateMatrixWorld();
		const b = { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity };
		for (const x of [0, world.width])
			for (const z of [0, world.height])
				for (const y of [0, 2.3]) {
					fitPoint.set(x, y, z).project(fitCam);
					const px = ((fitPoint.x + 1) / 2) * size.width;
					const py = ((1 - fitPoint.y) / 2) * size.height;
					b.l = Math.min(b.l, px);
					b.r = Math.max(b.r, px);
					b.t = Math.min(b.t, py);
					b.b = Math.max(b.b, py);
				}
		return b;
	};
	let lo = 15;
	let hi = 400;
	for (let i = 0; i < 22; i++) {
		const mid = (lo + hi) / 2;
		const b = bounds(mid);
		if (b.r - b.l <= free.w && b.b - b.t <= free.h) hi = mid;
		else lo = mid;
	}
	// Slide the camera so the building sits in the middle of the free area.
	for (let pass = 0; pass < 2; pass++) {
		const b = bounds(hi);
		const dx = (insets.left + free.w / 2 - (b.l + b.r) / 2) / size.height;
		const dy = (insets.top + free.h / 2 - (b.t + b.b) / 2) / size.height;
		const span = 2 * hi * Math.tan(THREE.MathUtils.degToRad(fitCam.fov / 2));
		fitRight.setFromMatrixColumn(fitCam.matrixWorld, 0);
		fitUp.set(fitRight.z, 0, -fitRight.x).normalize();
		// Moving the focus along the ground: screen-up is the ground direction away from the camera.
		focus.addScaledVector(fitRight, -dx * span);
		focus.addScaledVector(fitUp, (dy * span) / Math.sin(pitch));
	}
	out.dist = hi;
}

/**
 * What the HUD covers: the dock and #general along the bottom, a small margin elsewhere (the
 * corner panels sit beside the building's top corner, not over it).
 */
function hudInsets(canvas: HTMLElement): Insets {
	const box = canvas.getBoundingClientRect();
	let bottom = 16;
	for (const el of document.querySelectorAll<HTMLElement>('[data-hud]')) {
		const r = el.getBoundingClientRect();
		if (r.width === 0 || r.height === 0) continue;
		// Bottom-anchored panels in the middle half of the screen push the building up.
		const centre = (r.left + r.right) / 2 - box.left;
		if (r.bottom > box.bottom - 40 && centre > box.width * 0.25 && centre < box.width * 0.75)
			bottom = Math.max(bottom, box.bottom - r.top + 10);
	}
	return { top: 22, bottom, left: 16, right: 16 };
}

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
	const clear = (a: { x: number; y: number }, b: { x: number; y: number }) => {
		const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.15);
		for (let i = 1; i <= n; i++) {
			const t = i / n;
			if (collides(world, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, RADIUS + 0.02)) return false;
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
	appearance = null,
}: {
	world: CompiledWorld;
	bus: GameBus;
	mode: 'play' | 'overview';
	inputEnabled: boolean;
	reducedMotion: boolean;
	respawnKey: string;
	/** How others in the room see this visitor; the default visitor when null. */
	appearance?: Appearance | null;
}) {
	const gl = useThree((s) => s.gl);
	const group = useRef<THREE.Group>(null);
	const inner = useRef<THREE.Group>(null);
	const ring = useRef<THREE.Mesh>(null);
	const ringAt = useRef<{ x: number; y: number; t: number } | null>(null);
	const motion = useRef<Motion>({ moving: false, pose: 'stand', waveAt: -10, look: 0 });
	const keys = useRef(new Set<string>());
	const hold = useRef<Hold | null>(null);
	const input = useRef(inputEnabled);
	const worldRef = useRef(world);
	const player = useRef<Player>({
		x: world.spawn.x + 0.5,
		y: world.spawn.y + 0.5,
		heading: Math.PI,
		path: [],
		goal: null,
		nearbyAt: 0,
	});
	const fit = useRef({ at: -1e9, yaw: NaN, dist: OVERVIEW_DIST, focus: new THREE.Vector3(world.width / 2, 0, world.height / 2) });
	const rig = useRef<Rig>({
		yaw: CAMERA_YAW,
		targetYaw: CAMERA_YAW,
		dist: 19,
		targetDist: 19,
		overview: mode === 'overview' ? 1 : 0,
		focus: new THREE.Vector3(),
	});

	useEffect(() => {
		input.current = inputEnabled;
		if (!inputEnabled) {
			keys.current.clear();
			hold.current = null;
		}
	}, [inputEnabled]);

	// Keep the visitor out of anything a new world put where they stood.
	useEffect(() => {
		worldRef.current = world;
		const p = player.current;
		if (collides(world, p.x, p.y, RADIUS)) {
			const near = nearestOpenCell(world, cellAt(p.x, p.y));
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
		const max = w.landmark.max;
		p.heading = max ? Math.atan2(max.x - p.x, max.y - p.y) : Math.PI;
		// Review aids: ?at=coffee starts the visitor in that zone, ?dist=10 moves the camera in.
		const q = new URLSearchParams(window.location.search);
		const room = w.rooms.find((r) => r.kind === q.get('at'));
		const near = room && nearestOpenCell(w, { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) });
		if (near) {
			p.x = near.x + 0.5;
			p.y = near.y + 0.5;
			p.heading = Math.PI;
		}
		const dist = Number(q.get('dist'));
		if (dist >= 6 && dist <= 40) rig.current.targetDist = rig.current.dist = dist;
		// ?yaw=0 looks straight north (degrees).
		if (q.has('yaw') && Number.isFinite(Number(q.get('yaw'))))
			rig.current.targetYaw = rig.current.yaw = (Number(q.get('yaw')) * Math.PI) / 180;
	}, [respawnKey]);

	// Keyboard: walk, turn the camera, interact.
	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (!input.current || isTypingTarget(e.target)) return;
			if (MOVE_KEYS[e.code]) {
				keys.current.add(e.code);
				if (e.code.startsWith('Arrow')) e.preventDefault();
				return;
			}
			if (e.repeat) return;
			if (e.code === 'KeyQ') rig.current.targetYaw += Math.PI / 2;
			if (e.code === 'KeyE') rig.current.targetYaw -= Math.PI / 2;
			if (e.code === 'KeyF') bus.interact();
			if (e.code === 'KeyG') bus.wave();
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

	useEffect(() => bus.onWave(() => (motion.current.waveAt = now())), [bus]);
	useEffect(
		() =>
			bus.onStop(() => {
				const p = player.current;
				p.path = [];
				p.goal = null;
				bus.setGoal(null);
			}),
		[bus],
	);

	// Wheel and pinch zoom, within a narrow range; a single held finger steers (see useFrame).
	useEffect(() => {
		const el = gl.domElement;
		const r = rig.current;
		const pointers = new Map<number, { x: number; y: number }>();
		let pinch: number | null = null;
		// A finger lifted after steering must not also tap-to-walk where it ended.
		let swallowClick = false;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			r.targetDist = THREE.MathUtils.clamp(r.targetDist * (1 + Math.sign(e.deltaY) * 0.1), MIN_DIST, MAX_DIST);
		};
		const onDown = (e: PointerEvent) => {
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			swallowClick = false;
			hold.current =
				pointers.size === 1 && e.pointerType !== 'mouse' && input.current
					? { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, at: performance.now(), active: false }
					: null;
		};
		const onMove = (e: PointerEvent) => {
			if (!pointers.has(e.pointerId)) return;
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			const h = hold.current;
			if (h && h.id === e.pointerId) {
				h.x = e.clientX;
				h.y = e.clientY;
			}
			if (pointers.size !== 2) return;
			const [a, b] = [...pointers.values()];
			const d = Math.hypot(a.x - b.x, a.y - b.y);
			if (pinch) r.targetDist = THREE.MathUtils.clamp(r.targetDist * (pinch / d), MIN_DIST, MAX_DIST);
			pinch = d;
		};
		const onUp = (e: PointerEvent) => {
			pointers.delete(e.pointerId);
			if (pointers.size < 2) pinch = null;
			if (hold.current?.id === e.pointerId) {
				// Drags are ignored by every click handler already (e.delta); long still holds are not.
				swallowClick = hold.current.active && performance.now() - hold.current.at > HOLD_SWALLOW_MS;
				hold.current = null;
			}
		};
		const onClick = (e: MouseEvent) => {
			if (!swallowClick) return;
			swallowClick = false;
			e.stopPropagation();
		};
		// Android opens a context menu on a long press; a held finger is walking, not asking.
		const onContextMenu = (e: Event) => {
			if (hold.current) e.preventDefault();
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		el.addEventListener('pointerdown', onDown);
		el.addEventListener('click', onClick);
		el.addEventListener('contextmenu', onContextMenu);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
		return () => {
			el.removeEventListener('wheel', onWheel);
			el.removeEventListener('pointerdown', onDown);
			el.removeEventListener('click', onClick);
			el.removeEventListener('contextmenu', onContextMenu);
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
		};
	}, [gl]);

	const arrive = (goal: WalkTarget) => {
		const w = worldRef.current;
		const p = player.current;
		let target: Interactable | null = null;
		if (goal.kind === 'landmark') {
			const l = w.landmark[goal.id];
			if (l) {
				target = { kind: 'landmark', id: l.landmark, name: l.name };
				p.heading = Math.atan2(l.x - p.x, l.y - p.y);
			}
		} else if (goal.kind === 'npc') {
			const n = w.npcs.find((x) => x.id === goal.id);
			const pos = bus.npcs.get(goal.id);
			if (n) target = { kind: 'npc', id: n.id, name: n.name, npc: n.character, line: n.line };
			if (pos) p.heading = Math.atan2(pos.x - p.x, pos.y - p.y);
		}
		if (target) bus.emitInteract(target);
	};

	// Walk commands from clicks, the minimap and the HUD.
	useEffect(
		() =>
			bus.onWalk((target) => {
				const w = worldRef.current;
				const p = player.current;
				let goal: Cell | null = null;
				if (target.kind === 'cell') goal = { x: target.x, y: target.y };
				else if (target.kind === 'landmark') goal = w.landmark[target.id]?.interact ?? null;
				else {
					const pos = bus.npcs.get(target.id);
					if (pos) goal = cellAt(pos.x, pos.y);
				}
				if (!goal) return false;
				if (target.warp) {
					p.x = goal.x + 0.5;
					p.y = goal.y + 0.5;
					p.path = [];
					p.goal = null;
					bus.setGoal(null);
					return true;
				}
				const cells = findPath(w, cellAt(p.x, p.y), goal);
				if (!cells) return false;
				p.path = waypoints(w, cells.slice(1), p);
				// Stop next to a person rather than inside them.
				if (target.kind === 'npc' && p.path.length) {
					const last = p.path[p.path.length - 1];
					const pos = bus.npcs.get(target.id)!;
					if (Math.hypot(last.x - pos.x, last.y - pos.y) < 0.6) p.path.pop();
				}
				p.goal = target.kind === 'cell' ? null : target;
				bus.setGoal(p.goal);
				const end = p.path.at(-1) ?? { x: p.x, y: p.y };
				ringAt.current = { x: end.x, y: end.y, t: performance.now() };
				if (!p.path.length && p.goal) {
					const g = p.goal;
					p.goal = null;
					bus.setGoal(null);
					arrive(g);
				}
				return true;
			}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[bus],
	);

	useFrame((state, rawDt) => {
		const dt = Math.min(rawDt, 0.05);
		const w = worldRef.current;
		const p = player.current;
		const r = rig.current;
		const overviewWanted = mode === 'overview';
		const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 8);
		r.yaw += (r.targetYaw - r.yaw) * k;

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
		// A held finger: walk towards the spot on the floor under it.
		let hx = 0;
		let hy = 0;
		const h = hold.current;
		if (h && !h.active && !overviewWanted && (performance.now() - h.at > HOLD_MS || Math.hypot(h.x - h.startX, h.y - h.startY) > HOLD_DRAG_PX))
			h.active = true;
		if (h?.active && !overviewWanted && input.current) {
			const box = gl.domElement.getBoundingClientRect();
			holdNdc.set(((h.x - box.left) / box.width) * 2 - 1, -((h.y - box.top) / box.height) * 2 + 1);
			holdRay.setFromCamera(holdNdc, state.camera);
			if (holdRay.ray.intersectPlane(ground, holdPoint)) {
				const dx = holdPoint.x - p.x;
				const dy = holdPoint.z - p.y;
				const d = Math.hypot(dx, dy);
				if (d > HOLD_DEAD_ZONE) {
					hx = dx / d;
					hy = dy / d;
				}
			}
		}
		let vx = 0;
		let vy = 0;
		if (ix || iy) {
			p.path = [];
			p.goal = null;
			const yaw = r.targetYaw;
			const fx = -Math.sin(yaw);
			const fz = -Math.cos(yaw);
			vx = fx * iy - fz * ix;
			vy = fz * iy + fx * ix;
			const len = Math.hypot(vx, vy) || 1;
			vx = (vx / len) * RUN;
			vy = (vy / len) * RUN;
		} else if (h?.active && !overviewWanted) {
			// Holding still counts as steering too: it cancels any tap-to-walk path.
			p.path = [];
			p.goal = null;
			vx = hx * RUN;
			vy = hy * RUN;
		} else if (p.path.length && !overviewWanted) {
			const next = p.path[0];
			const dx = next.x - p.x;
			const dy = next.y - p.y;
			const d = Math.hypot(dx, dy);
			if (d < 0.1) {
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
			if (!collides(w, nx, ny, RADIUS)) {
				px = nx;
				py = ny;
			} else if (!collides(w, nx, p.y, RADIUS)) px = nx;
			else if (!collides(w, p.x, ny, RADIUS)) py = ny;
			else if (p.path.length) p.path = [];
			moving = Math.hypot(px - p.x, py - p.y) > 1e-4;
			p.x = px;
			p.y = py;
			p.heading = turn(p.heading, Math.atan2(vx, vy), dt * 14);
		}

		motion.current.moving = moving;
		if (group.current) group.current.position.set(p.x, 0, p.y);
		if (inner.current) inner.current.rotation.y = p.heading;
		bus.setPlayer(p.x, p.y, p.heading, moving);
		bus.setGoal(p.goal);

		// --- what is in reach
		if (state.clock.elapsedTime - p.nearbyAt > 0.1) {
			p.nearbyAt = state.clock.elapsedTime;
			let best: Interactable | null = null;
			let bestD = Infinity;
			for (const l of w.landmarks) {
				const d1 = Math.hypot(p.x - (l.interact.x + 0.5), p.y - (l.interact.y + 0.5));
				const d2 = Math.hypot(p.x - l.x, p.y - l.y);
				const d = Math.min(d1 + 0.4, d2);
				if ((d1 < 1.3 || d2 < 1.8) && d < bestD) {
					best = { kind: 'landmark', id: l.landmark, name: l.name };
					bestD = d;
				}
			}
			for (const n of w.npcs) {
				if (!n.interactive) continue;
				const pos = bus.npcs.get(n.id);
				if (!pos) continue;
				const d = Math.hypot(p.x - pos.x, p.y - pos.y);
				if (d < 1.6 && d < bestD) {
					best = { kind: 'npc', id: n.id, name: n.name, npc: n.character, line: n.line };
					bestD = d;
				}
			}
			bus.setNearby(overviewWanted ? null : best);
		}

		// --- camera
		const ko = reducedMotion ? 1 : 1 - Math.exp(-dt * 1.8);
		r.overview += ((overviewWanted ? 1 : 0) - r.overview) * ko;
		r.dist += (r.targetDist - r.dist) * (1 - Math.exp(-dt * 8));
		const ov = r.overview;
		if (ov > 0.001) {
			const now = performance.now();
			if (now - fit.current.at > 400 || Math.abs(fit.current.yaw - r.yaw) > 0.01) {
				fit.current.at = now;
				fit.current.yaw = r.yaw;
				fitOverview(w, r.yaw, OVERVIEW_PITCH, state.camera as THREE.PerspectiveCamera, state.size, hudInsets(gl.domElement), fit.current);
			}
		}
		const focus = r.focus.set(p.x, 0.6, p.y).lerp(fit.current.focus, ov);
		const pitch = THREE.MathUtils.lerp(PITCH, OVERVIEW_PITCH, ov);
		const dist = THREE.MathUtils.lerp(r.dist, fit.current.dist, ov);
		const cx = focus.x + Math.sin(r.yaw) * Math.cos(pitch) * dist;
		const cz = focus.z + Math.cos(r.yaw) * Math.cos(pitch) * dist;
		const cy = focus.y + Math.sin(pitch) * dist;
		state.camera.position.set(cx, cy, cz);
		state.camera.lookAt(focus);
		state.camera.updateMatrixWorld();
		viewProj.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
		bus.setView(viewProj.elements, cx, cy, cz, ov > 0.5);
		bus.setCameraYaw(r.yaw);

		// --- click marker
		const m = ring.current;
		const at = ringAt.current;
		if (m) {
			const age = at ? (performance.now() - at.t) / 1000 : 9;
			if (at && age < 0.9) {
				m.visible = true;
				m.position.set(at.x, 0.04, at.y);
				const s = 0.6 + age * 0.6;
				m.scale.set(s, s, s);
				(m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - age / 0.9);
			} else m.visible = false;
		}
	});

	const onGround = (e: ThreeEvent<MouseEvent>) => {
		e.stopPropagation();
		if (e.delta > 8 || mode === 'overview') return;
		const x = Math.floor(e.point.x);
		const y = Math.floor(e.point.z);
		if (x < 0 || y < 0 || x >= world.width || y >= world.height) return;
		bus.walkTo({ kind: 'cell', x, y });
	};

	return (
		<>
			<group ref={group}>
				<group ref={inner}>
					<ActorModel character="visitor" appearance={appearance} motion={motion} reducedMotion={reducedMotion} castShadow />
				</group>
				<BlobShadow />
			</group>
			<mesh
				position={[world.width / 2, 0, world.height / 2]}
				rotation-x={-Math.PI / 2}
				material={materials().hitbox}
				onClick={onGround}
			>
				<planeGeometry args={[world.width, world.height]} />
			</mesh>
			<mesh ref={ring} rotation-x={-Math.PI / 2} visible={false} renderOrder={5}>
				<ringGeometry args={[0.32, 0.42, 24]} />
				<meshBasicMaterial color="#ffe37a" transparent depthWrite={false} />
			</mesh>
		</>
	);
}
