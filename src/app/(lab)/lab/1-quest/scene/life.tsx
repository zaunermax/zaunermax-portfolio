'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '../world/random';
import type { Actor, CompiledWorld, Pose } from '../world/types';
import type { GameBus } from './bus';
import { radialTexture } from './materials';
import { now, type Spawns } from './spawn';
import { iconTexture, type IconName } from './textures';

/*
 * Small signs of life, all cheap and all optional with reduced motion: coffee steam, blinking
 * server LEDs, glints on special things, confetti and bunting for events, pixel bubbles over
 * people who are chatting or napping, and a puff of voxel dust when something pops in.
 */

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const s = new THREE.Vector3();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const cube = new THREE.BoxGeometry(1, 1, 1);
const noRaycast = () => null;

/** Steam curling up from espresso machines and the odd mug. */
function Steam({ world }: { world: CompiledWorld }) {
	const sources = useMemo(
		() =>
			world.decor
				.filter((d) => d.asset === 'espresso_machine' || (d.asset === 'coffee_cup_togo' && d.x % 2 < 1))
				.slice(0, 10)
				.map((d) => ({ x: d.x, y: d.y + (d.asset === 'espresso_machine' ? 0.45 : 0.16), z: d.z })),
		[world],
	);
	const PER = 4;
	const ref = useRef<THREE.InstancedMesh>(null);
	const material = useMemo(
		() =>
			new THREE.MeshBasicMaterial({
				map: radialTexture(),
				color: '#ffffff',
				transparent: true,
				opacity: 0.45,
				depthWrite: false,
			}),
		[],
	);
	useFrame((state) => {
		const mesh = ref.current;
		if (!mesh) return;
		const t = state.clock.elapsedTime;
		q.copy(state.camera.quaternion);
		sources.forEach((src, i) => {
			for (let k = 0; k < PER; k++) {
				const life = (t * 0.45 + k / PER + i * 0.37) % 1;
				v.set(src.x + Math.sin(t * 2 + k + i) * 0.06 * life, src.y + life * 0.6, src.z);
				const size = 0.12 + life * 0.18;
				s.set(size, size, size).multiplyScalar(Math.sin(life * Math.PI));
				m4.compose(v, q, s);
				mesh.setMatrixAt(i * PER + k, m4);
			}
		});
		mesh.instanceMatrix.needsUpdate = true;
	});
	if (!sources.length) return null;
	return (
		<instancedMesh
			ref={ref}
			args={[new THREE.PlaneGeometry(1, 1), material, sources.length * PER]}
			frustumCulled={false}
			raycast={noRaycast}
			renderOrder={4}
		/>
	);
}

/** Blinking LEDs on the front of every server rack; red and frantic on deploy day. */
function RackLeds({ world, panic }: { world: CompiledWorld; panic: boolean }) {
	const racks = useMemo(() => world.furniture.filter((f) => f.asset === 'server_rack'), [world]);
	const PER = 6;
	const ref = useRef<THREE.InstancedMesh>(null);
	const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
	const colors = useMemo(() => ['#5dff8a', '#5ad6ff', '#ffd23a'].map((c) => new THREE.Color(c)), []);
	const red = useMemo(() => new THREE.Color('#ff3b3b'), []);
	const off = useMemo(() => new THREE.Color('#2b3a33'), []);
	useFrame((state) => {
		const mesh = ref.current;
		if (!mesh) return;
		const t = state.clock.elapsedTime;
		racks.forEach((r, i) => {
			const face = [
				[0, 1],
				[1, 0],
				[0, -1],
				[-1, 0],
			][r.rot];
			for (let k = 0; k < PER; k++) {
				const row = Math.floor(k / 2);
				const col = k % 2;
				const lx = (col - 0.5) * 0.3;
				const ox = face[1] !== 0 ? 0 : lx;
				const oz = face[1] !== 0 ? lx : 0;
				v.set(r.x + 0.5 + face[0] * 0.47 + oz, 0.5 + row * 0.45, r.y + 0.5 + face[1] * 0.47 + ox);
				s.setScalar(0.06);
				m4.compose(v, q.identity(), s);
				mesh.setMatrixAt(i * PER + k, m4);
				const blink = Math.sin(t * (panic ? 14 : 2 + ((i * 7 + k * 3) % 5)) + k * 1.7 + i) > (panic ? -0.2 : 0.1);
				mesh.setColorAt(i * PER + k, blink ? (panic ? red : colors[(i + k) % 3]) : off);
			}
		});
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	});
	if (!racks.length) return null;
	return <instancedMesh ref={ref} args={[cube, material, racks.length * PER]} frustumCulled={false} raycast={noRaycast} />;
}

/** A spinning red beacon over the server room on deploy day. */
function Beacon({ world, room }: { world: CompiledWorld; room: number }) {
	const r = world.rooms[room];
	const light = useRef<THREE.PointLight>(null);
	const glow = useRef<THREE.Mesh>(null);
	useFrame((state) => {
		const pulse = (Math.sin(state.clock.elapsedTime * 7) + 1) / 2;
		if (light.current) light.current.intensity = 2 + pulse * 6;
		if (glow.current) (glow.current.material as THREE.MeshBasicMaterial).opacity = 0.15 + pulse * 0.35;
	});
	return (
		<group position={[r.x + r.w / 2, 0, r.y + r.h / 2]}>
			<pointLight ref={light} color="#ff3030" position={[0, 2.2, 0]} distance={7} decay={1.6} />
			<mesh ref={glow} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} renderOrder={2}>
				<planeGeometry args={[r.w, r.h]} />
				<meshBasicMaterial map={radialTexture()} color="#ff3b3b" transparent depthWrite={false} blending={THREE.AdditiveBlending} />
			</mesh>
		</group>
	);
}

/** Twinkling pixel stars on landmarks and trophies: tasteful, a few at a time. */
function Glints({ world }: { world: CompiledWorld }) {
	const points = useMemo(() => {
		const out = world.landmarks.map((l) => ({ x: l.x, y: l.height * 0.8, z: l.y, r: 0.6 }));
		for (const d of world.decor) if (d.asset === 'trophy') out.push({ x: d.x, y: d.y + 0.3, z: d.z, r: 0.2 });
		return out;
	}, [world]);
	const PER = 2;
	const ref = useRef<THREE.InstancedMesh>(null);
	const material = useMemo(
		() =>
			new THREE.MeshBasicMaterial({
				map: iconTexture('sparkle'),
				transparent: true,
				depthWrite: false,
				toneMapped: false,
			}),
		[],
	);
	useFrame((state) => {
		const mesh = ref.current;
		if (!mesh) return;
		const t = state.clock.elapsedTime;
		q.copy(state.camera.quaternion);
		points.forEach((p, i) => {
			for (let k = 0; k < PER; k++) {
				const cycle = 2.6 + k * 0.9 + (i % 3) * 0.4;
				const local = ((t + i * 1.3 + k * 1.1) % cycle) / cycle;
				const rng = mulberry32(i * 31 + k * 7 + Math.floor((t + i * 1.3 + k * 1.1) / cycle));
				v.set(p.x + (rng() - 0.5) * p.r * 2, p.y + (rng() - 0.5) * p.r, p.z + (rng() - 0.5) * 0.3);
				const size = local < 0.3 ? Math.sin((local / 0.3) * Math.PI) * 0.22 : 0;
				s.setScalar(Math.max(0.0001, size));
				m4.compose(v, q, s);
				mesh.setMatrixAt(i * PER + k, m4);
			}
		});
		mesh.instanceMatrix.needsUpdate = true;
	});
	if (!points.length) return null;
	return (
		<instancedMesh
			ref={ref}
			args={[new THREE.PlaneGeometry(1, 1), material, points.length * PER]}
			frustumCulled={false}
			raycast={noRaycast}
			renderOrder={5}
		/>
	);
}

const CONFETTI = ['#ff6f8a', '#ffd23a', '#5fd0c0', '#8a9aff', '#ff9a4a', '#b8f070'].map((c) => new THREE.Color(c));

/** Confetti drifting down over the event, and a line of bunting across the room. */
function Party({ world, room }: { world: CompiledWorld; room: number }) {
	const r = world.rooms[room];
	const N = Math.min(140, r.w * r.h * 2);
	const ref = useRef<THREE.InstancedMesh>(null);
	const seeds = useMemo(() => {
		const rng = mulberry32(room * 97 + world.seed);
		return Array.from({ length: N }, () => ({ x: rng(), z: rng(), phase: rng(), spin: rng() * 6 + 2, color: Math.floor(rng() * CONFETTI.length) }));
	}, [N, room, world.seed]);
	const material = useMemo(() => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), []);
	const flags = useMemo(() => {
		const out: { x: number; y: number; z: number; color: THREE.Color }[] = [];
		const n = Math.max(4, r.w * 2);
		for (let i = 0; i <= n; i++) {
			const t = i / n;
			out.push({ x: r.x + 0.3 + t * (r.w - 0.6), y: 2.15 - Math.sin(t * Math.PI) * 0.35, z: r.y + 0.6, color: CONFETTI[i % CONFETTI.length] });
		}
		return out;
	}, [r]);
	const flagGeometry = useMemo(() => {
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute([-0.12, 0, 0, 0.12, 0, 0, 0, -0.22, 0], 3));
		g.computeVertexNormals();
		return g;
	}, []);
	const flagRef = useRef<THREE.InstancedMesh>(null);

	useFrame((state) => {
		const mesh = ref.current;
		const t = state.clock.elapsedTime;
		if (mesh) {
			seeds.forEach((p, i) => {
				const life = (t * 0.12 + p.phase) % 1;
				v.set(r.x + 0.3 + p.x * (r.w - 0.6) + Math.sin(t * 1.3 + i) * 0.15, 2.6 - life * 2.6, r.y + 0.3 + p.z * (r.h - 0.6));
				q.setFromEuler(new THREE.Euler(t * p.spin, t * p.spin * 0.7, 0));
				s.set(0.07, 0.1, 1);
				m4.compose(v, q, s);
				mesh.setMatrixAt(i, m4);
				mesh.setColorAt(i, CONFETTI[p.color]);
			});
			mesh.instanceMatrix.needsUpdate = true;
			if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
		}
		const fm = flagRef.current;
		if (fm) {
			flags.forEach((f, i) => {
				v.set(f.x, f.y, f.z);
				q.setFromEuler(new THREE.Euler(Math.sin(t * 2 + i) * 0.25, 0, 0));
				m4.compose(v, q, s.set(1, 1, 1));
				fm.setMatrixAt(i, m4);
				fm.setColorAt(i, f.color);
			});
			fm.instanceMatrix.needsUpdate = true;
			if (fm.instanceColor) fm.instanceColor.needsUpdate = true;
		}
	});
	return (
		<group>
			<instancedMesh ref={ref} args={[new THREE.PlaneGeometry(1, 1), material, N]} frustumCulled={false} raycast={noRaycast} />
			<instancedMesh ref={flagRef} args={[flagGeometry, material, flags.length]} frustumCulled={false} raycast={noRaycast} />
		</group>
	);
}

const POSE_ICONS: Partial<Record<Pose, IconName[]>> = {
	chat: ['heart', 'note', 'dots', 'heart'],
	nap: ['zzz'],
	panic: ['bang'],
	serve: ['coffee'],
	cheer: ['note', 'heart', 'sparkle'],
	present: ['sparkle', 'dots'],
	play: ['bang', 'sparkle'],
};

/** Pixel bubbles drifting up from people who are chatting, napping, panicking… */
function Bubbles({ world, bus }: { world: CompiledWorld; bus: GameBus }) {
	const actors = useMemo(
		() => world.npcs.filter((a) => POSE_ICONS[a.pose]).slice(0, 18),
		[world],
	);
	const sprites = useRef<(THREE.Sprite | null)[]>([]);
	const materials = useMemo(
		() =>
			actors.map(
				(a) =>
					new THREE.SpriteMaterial({
						map: iconTexture(POSE_ICONS[a.pose]![0]),
						transparent: true,
						depthWrite: false,
						toneMapped: false,
					}),
			),
		[actors],
	);
	useFrame((state) => {
		const t = state.clock.elapsedTime;
		actors.forEach((a: Actor, i) => {
			const sprite = sprites.current[i];
			if (!sprite) return;
			const pos = bus.npcs.get(a.id) ?? { x: a.x, y: a.y };
			const cycle = a.pose === 'nap' ? 3 : 4.5 + (i % 3);
			const local = ((t + i * 1.7) % cycle) / cycle;
			const icons = POSE_ICONS[a.pose]!;
			const icon = icons[Math.floor((t + i * 1.7) / cycle) % icons.length];
			if (materials[i].map !== iconTexture(icon)) {
				materials[i].map = iconTexture(icon);
				materials[i].needsUpdate = true;
			}
			const shown = local < 0.45;
			sprite.visible = shown && !bus.view.overview;
			const k = local / 0.45;
			sprite.position.set(pos.x + 0.25, a.elev + (a.sit ? 1.2 : 1.75) + k * 0.4, pos.y);
			const size = 0.28 * Math.min(1, k * 4) * (1 - Math.max(0, k - 0.75) * 2);
			sprite.scale.setScalar(Math.max(0.0001, size));
			materials[i].opacity = 1 - Math.max(0, k - 0.6) * 2.5;
		});
	});
	return (
		<group>
			{actors.map((a, i) => (
				<sprite
					key={a.id}
					ref={(sp) => {
						sprites.current[i] = sp;
					}}
					material={materials[i]}
					renderOrder={6}
				/>
			))}
		</group>
	);
}

/** Voxel dust and a twinkle of sparkles where something just popped in. */
function Dust({ spawns }: { spawns: Spawns }) {
	const MAX = 240;
	const SPARKS = 96;
	const ref = useRef<THREE.InstancedMesh>(null);
	const sparkRef = useRef<THREE.InstancedMesh>(null);
	const material = useMemo(() => new THREE.MeshLambertMaterial({ color: '#efe6d6' }), []);
	const sparkMaterial = useMemo(
		() =>
			new THREE.MeshBasicMaterial({
				map: iconTexture('sparkle'),
				transparent: true,
				depthWrite: false,
				toneMapped: false,
			}),
		[],
	);
	useFrame((state) => {
		const mesh = ref.current;
		if (!mesh) return;
		const t = now();
		const puffs = spawns.prune(t);
		const sparks = sparkRef.current;
		if (sparks) {
			let k = 0;
			const camera = state.camera.quaternion;
			for (const p of puffs) {
				const age = t - p.t0;
				if (age < 0 || age > 0.9) continue;
				for (let j = 0; j < 2 && k < SPARKS; j++, k++) {
					const a = p.x * 3.1 + p.z * 1.7 + j * 2.6;
					const r = 0.25 + age * 0.4;
					v.set(p.x + Math.cos(a) * r * p.size, p.y + 0.35 + age * 0.9 + j * 0.2, p.z + Math.sin(a) * r * p.size);
					s.setScalar(Math.sin(Math.min(1, age / 0.9) * Math.PI) * 0.32);
					m4.compose(v, camera, s);
					sparks.setMatrixAt(k, m4);
				}
			}
			for (let i = k; i < SPARKS; i++) sparks.setMatrixAt(i, HIDE);
			sparks.instanceMatrix.needsUpdate = true;
		}
		let n = 0;
		for (const p of puffs) {
			const age = t - p.t0;
			if (age < 0) continue;
			for (let k = 0; k < 6 && n < MAX; k++, n++) {
				const a = (k / 6) * Math.PI * 2 + p.x;
				const r = (0.2 + age * 0.9) * p.size;
				v.set(p.x + Math.cos(a) * r, p.y + 0.08 + age * 0.4 - age * age * 0.5, p.z + Math.sin(a) * r);
				s.setScalar(0.09 * (1 - age));
				m4.compose(v, q.identity(), s);
				mesh.setMatrixAt(n, m4);
			}
		}
		for (let i = n; i < MAX; i++) mesh.setMatrixAt(i, HIDE);
		mesh.instanceMatrix.needsUpdate = true;
	});
	return (
		<>
			<instancedMesh ref={ref} args={[cube, material, MAX]} frustumCulled={false} raycast={noRaycast} />
			<instancedMesh
				ref={sparkRef}
				args={[new THREE.PlaneGeometry(1, 1), sparkMaterial, SPARKS]}
				frustumCulled={false}
				raycast={noRaycast}
				renderOrder={6}
			/>
		</>
	);
}

export function Life({
	world,
	bus,
	spawns,
	reducedMotion,
	quality,
}: {
	world: CompiledWorld;
	bus: GameBus;
	spawns: Spawns;
	reducedMotion: boolean;
	quality: 'high' | 'low';
}) {
	const event = world.event;
	return (
		<>
			<RackLeds world={world} panic={event?.kind === 'deploy'} />
			{event?.kind === 'deploy' ? <Beacon world={world} room={event.room} /> : null}
			{reducedMotion ? null : (
				<>
					<Steam world={world} />
					<Glints world={world} />
					<Bubbles world={world} bus={bus} />
					<Dust spawns={spawns} />
					{event && event.kind !== 'deploy' && quality === 'high' ? <Party world={world} room={event.room} /> : null}
				</>
			)}
		</>
	);
}
