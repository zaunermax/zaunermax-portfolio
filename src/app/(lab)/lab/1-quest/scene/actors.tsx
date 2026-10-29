'use client';

import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { CHARACTERS, type CharacterId } from '../world/catalog';
import { cellAt, collides, findPath } from '../world/compile';
import { hashString, mulberry32 } from '../world/random';
import type { Appearance } from '../world/appearance';
import type { Actor, CompiledWorld, Pose } from '../world/types';
import type { GameBus } from './bus';
import { materialFor } from './furniture';
import { resolveCharacter } from './characters';
import { useKit } from './kit';
import { blobGeometry, materials } from './materials';
import { dropOffset, now, popScale, type Spawns } from './spawn';

const tmpPos = new THREE.Vector3();

export type Motion = {
	moving: boolean;
	/** What the body is doing when it is not walking. */
	pose: Pose;
	/** Waves for a moment after this time (seconds, `now()`). */
	waveAt: number;
	/** Head turn towards something interesting, radians relative to the body. */
	look: number;
	/** On a seat: hips and legs sit whatever the pose's arms are doing. */
	seated?: boolean;
};

/**
 * CAST.md puts a seated root 8/16 below the seat top; half a voxel more sinks people into the
 * cushion instead of perching on it.
 */
const SEATED = -8.5 / 16;
/**
 * Seated hips: not quite level, so shins angle down and shoes stay well under a tabletop
 * (straight legs put the shoes at desk height).
 */
const SEATED_HIPS = -1.34;

export function turn(from: number, to: number, k: number) {
	let d = to - from;
	while (d > Math.PI) d -= Math.PI * 2;
	while (d < -Math.PI) d += Math.PI * 2;
	return from + d * Math.min(1, k);
}

/** A rigged voxel character: kit parts when available, a placeholder chibi otherwise. */
export function ActorModel({
	character,
	appearance = null,
	motion,
	reducedMotion,
	castShadow = false,
}: {
	character: CharacterId;
	appearance?: Appearance | null;
	motion: RefObject<Motion>;
	reducedMotion: boolean;
	/** Real shadows cost a draw per body part per shadow pass; the crowd makes do with blobs. */
	castShadow?: boolean;
}) {
	const kit = useKit();
	const rig = resolveCharacter(kit, character, appearance);
	const kind = CHARACTERS[character];
	const root = useRef<THREE.Group>(null);
	const parts = useRef(new Map<string, THREE.Group>());
	const phase = useRef((hashString(character) % 100) / 10);
	const swing = useRef(0);
	/** How far the hamster's ball has rolled, in radians. */
	const roll = useRef(0);

	useFrame((_, rawDt) => {
		const dt = Math.min(rawDt, 0.1);
		const m = motion.current;
		const t = now();
		swing.current += ((m.moving ? 1 : 0) - swing.current) * Math.min(1, dt * 10);
		phase.current += dt * (m.moving ? 10 : 2);
		const s = swing.current;
		const ph = phase.current;
		const calm = reducedMotion ? 0 : 1;
		const get = (name: string) => parts.current.get(name);
		const body = root.current;
		if (!body) return;

		if (kind === 'robot') {
			const top = get('top');
			body.position.y = m.moving ? Math.abs(Math.sin(ph * 2)) * 0.015 * calm : 0;
			if (!top) return;
			const base = (top.userData.pivotY as number | undefined) ?? top.position.y;
			switch (character) {
				case 'robo_courier':
					// The parcel tips and bobs while it waits.
					top.rotation.z = m.moving ? 0 : Math.sin(t * 2.1 + phase.current) * 0.07 * calm;
					top.position.y = base + (m.moving ? 0 : Math.abs(Math.sin(t * 3)) * (0.25 / 16) * calm);
					break;
				case 'robo_barista':
					top.rotation.y = Math.sin(t * 0.8 + phase.current) * 0.26 * calm;
					top.rotation.x = Math.sin(t * 1.7) * 0.087 * calm;
					break;
				case 'plant_bot':
					top.rotation.z = Math.sin(t * 2.4 + phase.current) * 0.07 * calm;
					break;
				default:
					top.rotation.y += dt * (m.moving ? 3 : 0.6) * calm;
			}
			return;
		}
		if (kind === 'drone') {
			// Hovering: a gentle bob, a lean into the direction of travel, spinning rotors.
			body.position.y = Math.sin(t * 2.2 + phase.current) * (0.3 / 16) * calm;
			body.rotation.x += ((m.moving ? 0.14 : 0) - body.rotation.x) * Math.min(1, dt * 4);
			const spin = dt * (reducedMotion ? 8 : 34);
			for (const [name, dir] of [
				['rotor_fl', 1],
				['rotor_br', 1],
				['rotor_fr', -1],
				['rotor_bl', -1],
			] as const) {
				const rotor = get(name);
				if (rotor) rotor.rotation.y += spin * dir;
			}
			return;
		}
		if (kind === 'bird') {
			// Parrot head jerks between poses, an occasional flap and a hop.
			const head = get('head');
			if (head) head.rotation.y = Math.round(Math.sin(t * 0.9 + phase.current) * 2) * 0.17 * calm;
			const flap = Math.pow(Math.max(0, Math.sin(t * 1.6 + phase.current)), 6) * Math.sin(t * 24) * calm;
			const wl = get('wing_l');
			const wr = get('wing_r');
			if (wl) wl.rotation.z = -Math.abs(flap) * 0.35;
			if (wr) wr.rotation.z = Math.abs(flap) * 0.35;
			const tail = get('tail');
			if (tail) tail.rotation.x = Math.sin(t * 3 + phase.current) * 0.14 * calm;
			const hop = (t * 0.45 + phase.current) % 1;
			body.position.y = hop < 0.12 ? Math.sin((hop / 0.12) * Math.PI) * 0.07 * calm : 0;
			return;
		}
		if (kind === 'hamster') {
			// The ball rolls with the distance travelled; the hamster stays upright inside.
			if (m.moving) roll.current += dt * SPEED.hamster / 0.25;
			const ball = get('ball');
			if (ball) ball.rotation.x = roll.current;
			const head = get('head');
			if (head) head.rotation.y = Math.sin(t * 2 + phase.current) * 0.17 * calm;
			body.position.y = m.moving ? Math.abs(Math.sin(t * 14)) * 0.01 : 0;
			return;
		}
		if (kind === 'animal') {
			for (const [name, dir] of [
				['leg_fl', 1],
				['leg_br', 1],
				['leg_fr', -1],
				['leg_bl', -1],
			] as const) {
				const leg = get(name);
				if (leg) leg.rotation.x = Math.sin(ph * 1.4) * 0.42 * s * dir;
			}
			const tail = get('tail');
			if (tail) tail.rotation.y = Math.sin(t * (m.moving ? 14 : 6)) * 0.35 * calm;
			const head = get('head');
			if (head) head.rotation.y = THREE.MathUtils.clamp(m.look, -0.25, 0.25);
			body.position.y = m.moving ? Math.abs(Math.sin(ph * 1.4)) * 0.04 : 0;
			return;
		}

		// People. Sitting is its own state: the pose only says what the arms and head do.
		const seated = !m.moving && (m.seated === true || m.pose === 'sit' || m.pose === 'type' || m.pose === 'nap');
		const armL = get('arm_l');
		const armR = get('arm_r');
		const legL = get('leg_l');
		const legR = get('leg_r');
		const head = get('head');
		const torso = get('body');
		let al = 0;
		let ar = 0;
		let alz = 0;
		let arz = 0;
		let ll = 0;
		let lr = 0;
		let bob = 0;
		let headX = 0;
		const waving = t - m.waveAt < 1.6 && t >= m.waveAt;
		if (m.moving) {
			ll = Math.sin(ph) * 0.46 * s;
			lr = -ll;
			al = -ll * 0.9;
			ar = ll * 0.9;
			bob = Math.abs(Math.sin(ph)) * 0.05;
		} else {
			const idle = Math.sin(t * 1.8 + phase.current) * calm;
			if (seated) {
				// Relaxed: hands resting beside the thighs, never through them.
				ll = lr = SEATED_HIPS;
				al = ar = -0.5;
				alz = arz = -0.12;
				bob = idle * 0.008;
			} else {
				// Arms loose at the sides with a slow sway, nothing held out.
				al = -0.06 + idle * 0.04;
				ar = -0.06 - idle * 0.04;
				alz = arz = 0.03;
				bob = idle * 0.012;
			}
			switch (m.pose) {
				case 'type': {
					const tap = Math.sin(t * 16) * 0.08 * calm;
					al = -1.15 + tap;
					ar = -1.15 - tap;
					headX = 0.12;
					break;
				}
				case 'serve':
					al = -0.9 + Math.sin(t * 3) * 0.25 * calm;
					ar = -0.7 - Math.sin(t * 3.3) * 0.2 * calm;
					break;
				case 'play':
					al = -1 + Math.sin(t * 9) * 0.15 * calm;
					ar = -1 - Math.sin(t * 7) * 0.15 * calm;
					break;
				case 'chat':
					ar = -0.4 - Math.max(0, Math.sin(t * 2.2 + phase.current)) * 0.7 * calm;
					arz = -0.2;
					bob += Math.max(0, Math.sin(t * 4)) * 0.01 * calm;
					break;
				case 'present':
					ar = -2.4 + Math.sin(t * 1.5) * 0.3 * calm;
					arz = -0.2;
					al = -0.3;
					break;
				case 'cheer': {
					// Standing cheerers hop; seated ones bounce in their seat and pump their arms.
					const hop = Math.max(0, Math.sin(t * 6 + phase.current));
					al = ar = -2.8 + hop * 0.3;
					alz = -0.3;
					arz = -0.3;
					bob += hop * (seated ? 0.015 : 0.08) * calm;
					break;
				}
				case 'clap': {
					// Hands meet in front of the chest, a few claps then a rest.
					const burst = Math.sin(t * 1.3 + phase.current) > -0.2 ? 1 : 0;
					const clap = Math.abs(Math.sin(t * 9 + phase.current)) * burst * calm;
					al = ar = -1.25;
					alz = arz = 0.18 + clap * 0.22;
					headX = -0.05;
					break;
				}
				case 'panic':
					al = ar = -2.9 + Math.sin(t * 18) * 0.2 * calm;
					alz = -0.4;
					arz = -0.4;
					bob += Math.abs(Math.sin(t * 9)) * (seated ? 0.008 : 0.03) * calm;
					break;
				case 'nap':
					headX = 0.35;
					bob = Math.sin(t * 0.9) * 0.01 * calm;
					break;
				case 'call':
					// Phone to the ear, the free hand gesturing now and then.
					ar = -2.5;
					arz = 0.55;
					headX = -0.06;
					al = -0.3 - Math.max(0, Math.sin(t * 1.8 + phase.current)) * 0.6 * calm;
					break;
				case 'wave':
					break;
			}
			// A greeter waves now and then rather than holding an arm out all day.
			const greeting = m.pose === 'wave' && (t + phase.current) % 5 < 1.6;
			if (greeting || waving) {
				// CAST.md: a wave raises the right arm around Z, up to −120°.
				ar = seated ? -0.4 : 0;
				arz = -1.75 - Math.sin(t * 10) * 0.3 * calm;
			}
		}
		if (legL) legL.rotation.x = ll;
		if (legR) legR.rotation.x = lr;
		if (armL) {
			armL.rotation.x = al;
			armL.rotation.z = -alz;
		}
		if (armR) {
			armR.rotation.x = ar;
			armR.rotation.z = arz;
		}
		if (head) {
			// Gentle turns only (less when seated), and no nod while turned, so hair and hats
			// stay square on the head rather than reading as skewed.
			const reach = seated ? 0.35 : 0.5;
			head.rotation.y += (THREE.MathUtils.clamp(m.look, -reach, reach) - head.rotation.y) * Math.min(1, dt * 6);
			head.rotation.x = Math.abs(head.rotation.y) > 0.12 ? Math.min(headX, 0.04) : headX;
		}
		if (torso) torso.rotation.x = seated ? -0.05 : 0;
		body.position.y = (seated ? SEATED : 0) + bob;
	});

	return (
		<group ref={root}>
			{rig.parts.map((part) => (
				<group
					key={part.name}
					position={part.pivot}
					ref={(g) => {
						if (g) {
							g.userData.pivotY = part.pivot.y;
							parts.current.set(part.name, g);
						} else parts.current.delete(part.name);
					}}
				>
					{part.parts.map((p, k) => (
						<mesh key={k} geometry={p.geometry} material={materialFor(p.material)} castShadow={castShadow && p.material === 'voxel'} />
					))}
				</group>
			))}
		</group>
	);
}

export function BlobShadow({ scale = 1, y = 0 }: { scale?: number; y?: number }) {
	return (
		<mesh geometry={blobGeometry} material={materials().shadow} position={[0, y + 0.02, 0]} scale={scale} renderOrder={2} />
	);
}

export function setCursor(on: boolean) {
	document.body.style.cursor = on ? 'pointer' : '';
}

/**
 * Where a label hangs. The labels themselves are plain HTML in the HUD layer; this just reports
 * the world position every frame.
 */
export function Anchor({ bus, id, height }: { bus: GameBus; id: string; height: number }) {
	const ref = useRef<THREE.Group>(null);
	useFrame(() => {
		const g = ref.current;
		if (!g) return;
		g.getWorldPosition(tmpPos);
		bus.setAnchor(id, tmpPos.x, tmpPos.y, tmpPos.z);
	});
	useEffect(() => () => bus.removeAnchor(id), [bus, id]);
	return <group ref={ref} position={[0, height, 0]} />;
}

export const LABEL_HEIGHT: Record<string, number> = {
	human: 1.85,
	animal: 0.95,
	robot: 0.95,
	drone: 0.6,
	bird: 0.95,
	hamster: 0.75,
};

type Wander = {
	x: number;
	y: number;
	heading: number;
	/** Waypoints still to walk (cell centres from an A* path), empty while idling. */
	path: { x: number; y: number }[];
	waitUntil: number;
	rng: () => number;
	greeted: number;
};

const SPEED: Record<string, number> = { human: 1.3, animal: 1.9, robot: 1.1, drone: 1.4, bird: 0, hamster: 1.2 };
/** Body radius for collisions; people are wider at the shoulders than robots. */
const RADIUS: Record<string, number> = { human: 0.28, animal: 0.24, robot: 0.22, drone: 0.22, bird: 0.15, hamster: 0.22 };
/** Pause between strolls, seconds [min, extra]: robots barely stop, people linger. */
const PAUSE: Record<string, [number, number]> = {
	human: [2, 4],
	animal: [1, 2.5],
	robot: [0.3, 0.9],
	drone: [0.8, 1.5],
	bird: [2, 2],
	hamster: [0.5, 1.2],
};

/** One person, pet or robot: idles in their pose, strolls if they wander, greets visitors. */
export function Npc({
	actor,
	world,
	bus,
	spawns,
	reducedMotion,
	anchor,
}: {
	actor: Actor;
	world: CompiledWorld;
	bus: GameBus;
	spawns: Spawns;
	reducedMotion: boolean;
	/** Label anchor id (Max uses his own). */
	anchor?: string;
}) {
	const group = useRef<THREE.Group>(null);
	const inner = useRef<THREE.Group>(null);
	const motion = useRef<Motion>({ moving: false, pose: actor.pose, waveAt: -10, look: 0, seated: actor.sit });
	const state = useRef<Wander | null>(null);
	const kind = CHARACTERS[actor.character];
	const isMax = actor.character === 'max';
	// Fliers only bump into walls; furniture passes underneath.
	const space = useMemo(
		() => (actor.flies ? { ...world, blocked: new Uint8Array(world.blocked.length) } : world),
		[actor.flies, world],
	);

	useFrame((_, rawDt) => {
		const g = group.current;
		if (!g) return;
		const dt = Math.min(rawDt, 0.1);
		let s = state.current;
		if (!s || (!actor.wanders && (s.x !== actor.x || s.y !== actor.y) && !s.path.length)) {
			s = state.current = {
				x: actor.x,
				y: actor.y,
				heading: actor.heading,
				path: [],
				waitUntil: now() + 1 + (hashString(actor.id) % 3),
				rng: mulberry32(hashString(actor.id)),
				greeted: -100,
			};
		}
		const t = now();
		const m = motion.current;
		const px = bus.player.x;
		const py = bus.player.y;
		const toPlayer = Math.hypot(px - s.x, py - s.y);
		const talking = bus.getSpeech().get(actor.id);
		const isTalking = talking ? performance.now() < talking.until : false;
		const near = toPlayer < (isMax ? 3 : 2.2) && !bus.view.overview;
		let moving = false;
		const towardsPlayer = Math.atan2(px - s.x, py - s.y);

		if (near && t - s.greeted > 12 && (actor.interactive || isMax) && kind === 'human') {
			s.greeted = t;
			m.waveAt = t + 0.2;
		}
		if (isMax) {
			// Max stays square to his desk: he swivels a little and turns his head to greet
			// visitors, then goes back to his screens.
			let rel = towardsPlayer - actor.heading;
			while (rel > Math.PI) rel -= Math.PI * 2;
			while (rel < -Math.PI) rel += Math.PI * 2;
			const swivel = near ? THREE.MathUtils.clamp(rel, -0.95, 0.95) : 0;
			s.heading = turn(s.heading, actor.heading + swivel, dt * 4);
			m.pose = near ? 'sit' : 'type';
			m.look = near ? rel - swivel : 0;
		} else if (isTalking || (near && !actor.sit && !actor.wanders)) {
			s.path = [];
			if (actor.sit) m.look = turn(0, towardsPlayer - s.heading, 1);
			else s.heading = turn(s.heading, towardsPlayer, dt * 6);
		} else if (actor.wanders && !reducedMotion) {
			m.look = 0;
			const radius = RADIUS[kind];
			if (!s.path.length && t > s.waitUntil) {
				// Somewhere within reach of home, walked to along the grid so nobody bumps about.
				for (let tries = 0; tries < 10 && !s.path.length; tries++) {
					const tx = Math.floor(actor.x + (s.rng() - 0.5) * 2 * actor.radius);
					const ty = Math.floor(actor.y + (s.rng() - 0.5) * 2 * actor.radius);
					if (Math.hypot(tx + 0.5 - s.x, ty + 0.5 - s.y) < 1.5) continue;
					if (collides(space, tx + 0.5, ty + 0.5, radius)) continue;
					const cells = findPath(space, cellAt(s.x, s.y), { x: tx, y: ty });
					if (!cells || cells.length < 2 || cells.length > actor.radius * 3 + 4) continue;
					s.path = cells.slice(1).map((c) => ({ x: c.x + 0.5, y: c.y + 0.5 }));
				}
				if (!s.path.length) s.waitUntil = t + 1.5;
			}
			const next = s.path[0];
			if (next) {
				const dx = next.x - s.x;
				const dy = next.y - s.y;
				const d = Math.hypot(dx, dy);
				if (d < 0.06) {
					s.path.shift();
					if (!s.path.length) {
						const [min, extra] = PAUSE[kind];
						s.waitUntil = t + min + s.rng() * extra;
					}
				} else {
					const step = Math.min(d, SPEED[kind] * dt);
					const nx = s.x + (dx / d) * step;
					const ny = s.y + (dy / d) * step;
					if (!collides(space, nx, ny, Math.min(radius, 0.22))) {
						s.x = nx;
						s.y = ny;
						moving = true;
						s.heading = turn(s.heading, Math.atan2(dx, dy), dt * 8);
					} else {
						// The robot vacuum bumps, thinks, and picks somewhere else.
						s.path = [];
						s.waitUntil = t + (kind === 'robot' ? 0.4 : 1);
					}
				}
			}
		} else {
			m.look = near && actor.sit ? turn(0, towardsPlayer - s.heading, 1) * 0.8 : 0;
		}
		m.moving = moving;
		if (!isMax) m.pose = actor.pose;
		const p = spawns.progress(actor.id, t);
		g.position.set(s.x, (actor.sit ? actor.elev : actor.elev) + dropOffset(p), s.y);
		g.scale.setScalar(popScale(p));
		if (inner.current) inner.current.rotation.y = s.heading;
		bus.setNpc(actor.id, s.x, s.y);
	});

	const onClick = (e: ThreeEvent<MouseEvent>) => {
		e.stopPropagation();
		if (e.delta > 8) return;
		bus.walkTo(isMax ? { kind: 'landmark', id: 'max' } : { kind: 'npc', id: actor.id });
	};

	const clickable = actor.interactive || isMax;
	return (
		<group ref={group} position={[actor.x, actor.elev, actor.y]} scale={0.0001}>
			<group ref={inner} rotation-y={actor.heading}>
				<ActorModel
					character={actor.character}
					appearance={actor.appearance}
					motion={motion}
					reducedMotion={reducedMotion}
					castShadow={isMax}
				/>
			</group>
			{/* A soft contact shadow lifts everyone off the floor, sitters included (under the seat). */}
			<BlobShadow
				scale={kind === 'human' ? (actor.sit ? 1.15 : 1.05) : kind === 'bird' ? 0.5 : 0.9}
				y={actor.flies || actor.sit ? -actor.elev : 0}
			/>
			{clickable ? (
				<mesh
					position={[0, 0.6, 0]}
					material={materials().hitbox}
					onClick={onClick}
					onPointerOver={(e) => {
						e.stopPropagation();
						setCursor(true);
					}}
					onPointerOut={() => setCursor(false)}
				>
					<boxGeometry args={[0.8, 1.3, 0.8]} />
				</mesh>
			) : null}
			{clickable || actor.caption ? (
				<Anchor
					bus={bus}
					id={anchor ?? actor.id}
					// Max's sign hangs well clear of his bun (his top is 1.875 standing, half a tile
					// lower seated).
					height={isMax ? (actor.sit ? 1.95 : 2.4) : LABEL_HEIGHT[kind] - (actor.sit ? 0.3 : 0)}
				/>
			) : null}
		</group>
	);
}
