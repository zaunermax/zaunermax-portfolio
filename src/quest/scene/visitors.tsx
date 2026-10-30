'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type * as THREE from 'three';
import { lookFor, visitorAnchor, type Presence } from '../room/presence';
import { ActorModel, Anchor, BlobShadow, LABEL_HEIGHT, turn, type Motion } from './actors';
import type { GameBus } from './bus';

/*
 * Other visitors, live from the room. They are visual only: nobody collides with them, and they
 * glide towards each reported position so 10 updates a second read as a smooth walk.
 */

/** Further than this from where we drew them, a visitor jumps instead of gliding (a respawn). */
const SNAP = 4;

export function Visitors({
	presence,
	bus,
	reducedMotion,
}: {
	presence: Presence;
	bus: GameBus;
	reducedMotion: boolean;
}) {
	const ids = useSyncExternalStore(presence.subscribe, presence.getIds, presence.getIds);
	return ids.map((id) => (
		<Visitor key={id} id={id} presence={presence} bus={bus} reducedMotion={reducedMotion} />
	));
}

function Visitor({
	id,
	presence,
	bus,
	reducedMotion,
}: {
	id: string;
	presence: Presence;
	bus: GameBus;
	reducedMotion: boolean;
}) {
	const group = useRef<THREE.Group>(null);
	const inner = useRef<THREE.Group>(null);
	const look = useMemo(() => lookFor(id), [id]);
	const motion = useRef<Motion>({ moving: false, pose: 'stand', waveAt: -10, look: 0 });
	const drawn = useRef<{ x: number; y: number; h: number } | null>(null);

	useEffect(() => () => void bus.visitors.delete(id), [bus, id]);

	useFrame((_, rawDt) => {
		const target = presence.get(id);
		const g = group.current;
		if (!target || !g) return;
		const dt = Math.min(rawDt, 0.1);
		let s = drawn.current;
		if (!s || Math.hypot(target.x - s.x, target.y - s.y) > SNAP)
			s = drawn.current = { x: target.x, y: target.y, h: target.h };
		const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 10);
		const dx = target.x - s.x;
		const dy = target.y - s.y;
		s.x += dx * k;
		s.y += dy * k;
		s.h = turn(s.h, target.h, reducedMotion ? 1 : dt * 12);
		const m = motion.current;
		m.moving = target.m || Math.hypot(dx, dy) > 0.08;
		m.waveAt = target.waveAt;
		g.position.set(s.x, 0, s.y);
		if (inner.current) inner.current.rotation.y = s.h;
		const pos = bus.visitors.get(id);
		if (pos) {
			pos.x = s.x;
			pos.y = s.y;
		} else bus.visitors.set(id, { x: s.x, y: s.y });
	});

	const start = presence.get(id);
	return (
		<group ref={group} position={[start?.x ?? 0, 0, start?.y ?? 0]}>
			<group ref={inner} rotation-y={start?.h ?? 0}>
				<ActorModel
					character="visitor"
					appearance={look}
					motion={motion}
					reducedMotion={reducedMotion}
				/>
			</group>
			<BlobShadow />
			<Anchor bus={bus} id={visitorAnchor(id)} height={LABEL_HEIGHT.human} />
		</group>
	);
}
