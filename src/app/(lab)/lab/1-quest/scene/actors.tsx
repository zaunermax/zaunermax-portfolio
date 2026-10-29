'use client';

import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import * as THREE from 'three';
import {
	isPassable,
	isWalkable,
	mulberry32,
	sampleHeight,
	type CompiledWorld,
	type NpcEntity,
} from '../world/compile';
import type { GameBus } from './bus';
import { actorRig, isBeast, type ActorKind } from './characters';
import { blobGeometry, materials } from './materials';
import { dropOffset, now, popScale, type Spawns } from './spawn';

const tmpPos = new THREE.Vector3();

export type Motion = { moving: boolean; speed: number; airborne?: boolean };

/** A rigged chibi: swings its limbs while moving and breathes while idle. */
export function ActorModel({
	kind,
	motion,
	reducedMotion,
}: {
	kind: ActorKind;
	motion: RefObject<Motion>;
	reducedMotion: boolean;
}) {
	const rig = actorRig(kind);
	const mats = materials();
	const bodyRef = useRef<THREE.Group>(null);
	const limbRefs = useRef<(THREE.Group | null)[]>([]);
	const phase = useRef(kind.length * 1.7);
	const swing = useRef(0);

	useFrame((_, dt) => {
		const m = motion.current;
		const target = m?.moving ? 1 : 0;
		swing.current += (target - swing.current) * Math.min(1, dt * 10);
		phase.current += dt * (m?.moving ? 9 * (m.speed || 1) : 2);
		const s = swing.current;
		const p = phase.current;
		limbRefs.current.forEach((g, i) => {
			if (!g) return;
			const limb = rig.limbs[i];
			const dir = limb.phase ? 1 : -1;
			const amp = limb.kind === 'leg' ? 0.7 : 0.55;
			g.rotation.x = m?.airborne
				? limb.kind === 'leg'
					? 0.5 * dir
					: -0.9
				: Math.sin(p) * amp * s * dir;
		});
		const body = bodyRef.current;
		if (body) {
			if (rig.hop) body.position.y = m?.moving ? Math.abs(Math.sin(p * 0.6)) * 0.25 : 0;
			else if (!reducedMotion)
				body.position.y = m?.moving
					? Math.abs(Math.sin(p)) * 0.05
					: Math.sin(p * 0.9) * 0.012;
			if (!reducedMotion && !m?.moving) body.scale.y = 1 + Math.sin(p * 0.9) * 0.015;
			else body.scale.y = 1;
		}
	});

	return (
		<group ref={bodyRef}>
			<mesh geometry={rig.body} material={mats.body} castShadow />
			{rig.glow ? <mesh geometry={rig.glow} material={mats.glow} /> : null}
			{rig.limbs.map((limb, i) => (
				<group
					key={i}
					position={limb.pivot}
					ref={(g) => {
						limbRefs.current[i] = g;
					}}
				>
					<mesh geometry={limb.geometry} material={mats.body} castShadow />
				</group>
			))}
		</group>
	);
}

export function BlobShadow({ scale = 1 }: { scale?: number }) {
	return (
		<mesh
			geometry={blobGeometry}
			material={materials().shadow}
			position={[0, 0.03, 0]}
			scale={scale}
			renderOrder={2}
		/>
	);
}

export function setCursor(on: boolean) {
	document.body.style.cursor = on ? 'pointer' : '';
}

/**
 * Where a label hangs. The labels themselves are plain HTML in the HUD layer (one DOM tree,
 * no per-label React roots); this just reports the world position every frame.
 */
export function Anchor({
	bus,
	id,
	height,
}: {
	bus: GameBus;
	id: string;
	height: number;
}) {
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

type Wander = {
	x: number;
	y: number;
	heading: number;
	target: { x: number; y: number } | null;
	waitUntil: number;
	rng: () => number;
};

export function Npc({
	entity,
	world,
	bus,
	spawns,
	reducedMotion,
}: {
	entity: NpcEntity;
	world: CompiledWorld;
	bus: GameBus;
	spawns: Spawns;
	reducedMotion: boolean;
}) {
	const group = useRef<THREE.Group>(null);
	const inner = useRef<THREE.Group>(null);
	const motion = useRef<Motion>({ moving: false, speed: 1 });
	const state = useRef<Wander | null>(null);
	const rig = actorRig(entity.kind);
	const speech = useSyncExternalStore(bus.subscribeSpeech, bus.getSpeech, bus.getSpeech);

	useFrame((_, rawDt) => {
		const g = group.current;
		if (!g) return;
		const dt = Math.min(rawDt, 0.1);
		let s = state.current;
		if (
			!s ||
			(s.target === null &&
				Math.hypot(s.x - entity.x, s.y - entity.y) > entity.radius + 1.5)
		) {
			s = state.current = {
				x: entity.x,
				y: entity.y,
				heading: entity.rotation,
				target: null,
				waitUntil: now() + 1 + (entity.variant % 3),
				rng: mulberry32(entity.x * 997 + entity.y * 31 + entity.variant),
			};
		}
		const t = now();
		const talking = speech.get(entity.id);
		const isTalking = talking ? performance.now() < talking.until : false;
		let moving = false;
		if (isTalking) {
			s.target = null;
			const want = Math.atan2(bus.player.x - s.x, bus.player.y - s.y);
			s.heading = turn(s.heading, want, dt * 6);
		} else if (entity.wanders && !reducedMotion) {
			if (!s.target && t > s.waitUntil) {
				for (let tries = 0; tries < 6; tries++) {
					const tx = entity.cell.x + Math.round((s.rng() - 0.5) * 2 * entity.radius);
					const ty = entity.cell.y + Math.round((s.rng() - 0.5) * 2 * entity.radius);
					if (isWalkable(world, tx, ty)) {
						s.target = { x: tx + 0.3 + s.rng() * 0.4, y: ty + 0.3 + s.rng() * 0.4 };
						break;
					}
				}
				if (!s.target) s.waitUntil = t + 2;
			}
			if (s.target) {
				const dx = s.target.x - s.x;
				const dy = s.target.y - s.y;
				const d = Math.hypot(dx, dy);
				if (d < 0.08) {
					s.target = null;
					s.waitUntil = t + 1.5 + s.rng() * 3.5;
				} else {
					const step = Math.min(d, rig.speed * dt);
					const nx = s.x + (dx / d) * step;
					const ny = s.y + (dy / d) * step;
					if (isPassable(world, Math.floor(nx), Math.floor(ny))) {
						s.x = nx;
						s.y = ny;
						moving = true;
						s.heading = turn(s.heading, Math.atan2(dx, dy), dt * 8);
					} else {
						s.target = null;
						s.waitUntil = t + 1;
					}
				}
			}
		}
		motion.current.moving = moving;
		motion.current.speed = rig.speed;
		const p = spawns.progress(entity.id, t);
		const sc = popScale(p);
		g.position.set(s.x, sampleHeight(world, s.x, s.y) + dropOffset(p), s.y);
		g.scale.setScalar(sc);
		if (inner.current) inner.current.rotation.y = s.heading;
		bus.setNpc(entity.id, s.x, s.y);
	});

	const onClick = (e: ThreeEvent<MouseEvent>) => {
		e.stopPropagation();
		if (e.delta > 8) return;
		bus.walkTo({ kind: 'npc', id: entity.id });
	};

	const beast = isBeast(entity.kind);
	return (
		<group
			ref={group}
			position={[entity.x, sampleHeight(world, entity.x, entity.y), entity.y]}
			scale={0.0001}
		>
			<group ref={inner} rotation-y={entity.rotation}>
				<ActorModel kind={entity.kind} motion={motion} reducedMotion={reducedMotion} />
			</group>
			<BlobShadow scale={beast ? 1.1 : 1} />
			<mesh
				position={[0, 0.5, 0]}
				material={materials().hitbox}
				onClick={onClick}
				onPointerOver={(e) => {
					e.stopPropagation();
					setCursor(true);
				}}
				onPointerOut={() => setCursor(false)}
			>
				<boxGeometry args={[0.9, 1.2, 0.9]} />
			</mesh>
			<Anchor bus={bus} id={entity.id} height={rig.height} />
		</group>
	);
}

export function turn(from: number, to: number, k: number) {
	let d = to - from;
	while (d > Math.PI) d -= Math.PI * 2;
	while (d < -Math.PI) d += Math.PI * 2;
	return from + d * Math.min(1, k);
}
