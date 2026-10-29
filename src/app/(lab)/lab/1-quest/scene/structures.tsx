'use client';

import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import {
	DECK_HEIGHT,
	sampleHeight,
	type BuildingEntity,
	type CompiledWorld,
	type LandmarkEntity,
	type PropEntity,
	type RockEntity,
	type RockSize,
	type TreeEntity,
	type TreeSpecies,
} from '../world/compile';
import type { LandmarkId } from '../world/schema';
import { ActorModel, BlobShadow, Anchor, setCursor, type Motion, turn } from './actors';
import { MAX_ANCHOR, type GameBus } from './bus';
import { rockGeometry, treeGeometry } from './flora';
import { materials } from './materials';
import { BIOMES, type Lighting } from './palette';
import {
	buildingGeometry,
	CAMP_FIRE,
	CAMP_MAX,
	exclamationGeometry,
	flameGeometry,
	landmarkGeometry,
	propGeometry,
	windmillBlades,
	type PrefabGeometry,
} from './prefabs';
import { dropOffset, now, popScale, type Spawns } from './spawn';

type Common = { world: CompiledWorld; spawns: Spawns; reducedMotion: boolean };

/** Applies the pop-in animation to its group whenever its id is new. */
function Spawned({
	id,
	position,
	rotation,
	spawns,
	children,
}: {
	id: string;
	position: [number, number, number];
	rotation: number;
	spawns: Spawns;
	children: ReactNode;
}) {
	const ref = useRef<THREE.Group>(null);
	const settled = useRef(false);
	useFrame(() => {
		const g = ref.current;
		if (!g) return;
		const t = spawns.progress(id, now());
		if (t >= 1) {
			if (!settled.current) {
				g.scale.setScalar(1);
				g.position.y = position[1];
				settled.current = true;
			}
			return;
		}
		settled.current = false;
		g.scale.setScalar(popScale(t));
		g.position.y = position[1] + dropOffset(t);
	});
	return (
		<group ref={ref} position={position} rotation-y={rotation} scale={0.0001}>
			{children}
		</group>
	);
}

function Prefab({ geo, shadows = true }: { geo: PrefabGeometry; shadows?: boolean }) {
	const m = materials();
	return (
		<>
			<mesh geometry={geo.body} material={m.body} castShadow={shadows} receiveShadow />
			{geo.glass ? <mesh geometry={geo.glass} material={m.glass} /> : null}
			{geo.glow ? <mesh geometry={geo.glow} material={m.glow} /> : null}
		</>
	);
}

function Flame({
	position,
	scale = 1,
	reducedMotion,
}: {
	position: [number, number, number];
	scale?: number;
	reducedMotion: boolean;
}) {
	const ref = useRef<THREE.Mesh>(null);
	const seed = useMemo(() => position[0] * 3.1 + position[2] * 1.7, [position]);
	useFrame(({ clock }) => {
		const m = ref.current;
		if (!m || reducedMotion) return;
		const t = clock.elapsedTime * 9 + seed;
		m.scale.set(
			scale * (1 + Math.sin(t * 1.3) * 0.08),
			scale * (1 + Math.sin(t) * 0.18 + Math.sin(t * 2.7) * 0.08),
			scale,
		);
		m.rotation.y = t * 0.1;
	});
	return (
		<mesh
			ref={ref}
			geometry={flameGeometry()}
			material={materials().flame}
			position={position}
			scale={scale}
		/>
	);
}

function Halo({
	position,
	scale = 1.4,
	kind = 'halo',
}: {
	position: [number, number, number];
	scale?: number;
	kind?: 'halo' | 'rune';
}) {
	const m = materials();
	return (
		<sprite
			position={position}
			scale={scale}
			material={kind === 'rune' ? m.rune : m.halo}
			renderOrder={3}
		/>
	);
}

function LightPool({
	position,
	radius = 2.2,
}: {
	position: [number, number, number];
	radius?: number;
}) {
	return (
		<mesh
			position={position}
			rotation-x={-Math.PI / 2}
			material={materials().pool}
			renderOrder={2}
		>
			<circleGeometry args={[radius, 20]} />
		</mesh>
	);
}

// ---------------------------------------------------------------------------
// Buildings

function Building({
	entity,
	world,
	spawns,
	reducedMotion,
}: Common & { entity: BuildingEntity }) {
	const snow = BIOMES[world.meta.biome].snow;
	const geo = buildingGeometry(entity.kind, entity.roof, snow, entity.length);
	const y =
		entity.kind === 'dock' ? DECK_HEIGHT : sampleHeight(world, entity.x, entity.y);
	const blades = useRef<THREE.Group>(null);
	useFrame((_, dt) => {
		if (blades.current && !reducedMotion) blades.current.rotation.z += dt * 0.7;
	});
	return (
		<Spawned
			id={entity.id}
			position={[entity.x, y, entity.y]}
			rotation={entity.rotation}
			spawns={spawns}
		>
			<Prefab geo={geo} />
			{entity.kind === 'windmill' ? (
				<group ref={blades} position={[0, 3.2, 1.05]}>
					<mesh geometry={windmillBlades()} material={materials().body} castShadow />
				</group>
			) : null}
			{entity.kind === 'smithy' ? (
				<LightPool position={[-0.5, 0.05, 0.3]} radius={1.6} />
			) : null}
			{entity.kind === 'tavern' ? (
				<>
					<Halo position={[-0.5, 1.15, 1.25]} scale={0.9} />
					<Halo position={[0.5, 1.15, 1.25]} scale={0.9} />
					<LightPool position={[0, 0.05, 1.7]} radius={1.8} />
				</>
			) : null}
		</Spawned>
	);
}

// ---------------------------------------------------------------------------
// Landmarks

export const LANDMARK_PLATE: Record<LandmarkId, number> = {
	max: 0,
	library: 5.4,
	stage: 3.6,
	questboard: 3.5,
	worldforge: 3.6,
};

function Landmark({
	entity,
	world,
	spawns,
	reducedMotion,
	bus,
}: Common & { entity: LandmarkEntity; bus: GameBus }) {
	const snow = BIOMES[world.meta.biome].snow;
	const geo = landmarkGeometry(entity.landmark, snow);
	const y = sampleHeight(world, entity.x, entity.y);
	const onClick = (e: ThreeEvent<MouseEvent>) => {
		e.stopPropagation();
		if (e.delta > 8) return;
		bus.walkTo({ kind: 'landmark', id: entity.landmark });
	};
	const hitSize: [number, number, number] =
		entity.landmark === 'questboard' || entity.landmark === 'worldforge'
			? [2.2, 3, 1.6]
			: [3, 3.4, 3];
	return (
		<Spawned
			id={entity.id}
			position={[entity.x, y, entity.y]}
			rotation={entity.rotation}
			spawns={spawns}
		>
			<Prefab geo={geo} />
			<mesh
				position={[0, hitSize[1] / 2, 0]}
				material={materials().hitbox}
				onClick={onClick}
				onPointerOver={(e) => {
					e.stopPropagation();
					setCursor(true);
				}}
				onPointerOut={() => setCursor(false)}
			>
				<boxGeometry args={hitSize} />
			</mesh>
			{entity.landmark === 'max' ? (
				<MaxAtCamp bus={bus} reducedMotion={reducedMotion} entity={entity} />
			) : null}
			{entity.landmark === 'library' ? (
				<>
					<Halo position={[-0.25, 1.55, 1.2]} scale={1} />
					<LightPool position={[0.2, 0.06, 1.8]} radius={1.8} />
				</>
			) : null}
			{entity.landmark === 'stage' ? (
				<>
					<Halo position={[-1.3, 0.6, 0.45]} scale={0.9} />
					<Halo position={[1.3, 0.6, 0.45]} scale={0.9} />
					<LightPool position={[0, 0.5, -0.3]} radius={1.8} />
				</>
			) : null}
			{entity.landmark === 'questboard' ? (
				<>
					<FloatingMark position={[0, 2.55, 0.1]} reducedMotion={reducedMotion} />
					<Halo position={[-0.72, 2.2, 0.1]} scale={0.9} />
				</>
			) : null}
			{entity.landmark === 'worldforge' ? (
				<ForgeMagic reducedMotion={reducedMotion} />
			) : null}
			{LANDMARK_PLATE[entity.landmark] ? (
				<Anchor bus={bus} id={entity.id} height={LANDMARK_PLATE[entity.landmark]} />
			) : null}
		</Spawned>
	);
}

function FloatingMark({
	position,
	reducedMotion,
}: {
	position: [number, number, number];
	reducedMotion: boolean;
}) {
	const ref = useRef<THREE.Group>(null);
	useFrame(({ clock }) => {
		const g = ref.current;
		if (!g || reducedMotion) return;
		const t = clock.elapsedTime;
		g.position.y = position[1] + Math.sin(t * 2.2) * 0.1;
		g.rotation.y = t * 1.6;
	});
	return (
		<group ref={ref} position={position}>
			<mesh geometry={exclamationGeometry()} material={materials().marker} />
			<Halo position={[0, 0.35, 0]} scale={1.3} />
		</group>
	);
}

/** Max himself: by the fire, turning to face visitors who come close. */
function MaxAtCamp({
	bus,
	reducedMotion,
	entity,
}: {
	bus: GameBus;
	reducedMotion: boolean;
	entity: LandmarkEntity;
}) {
	const motion = useRef<Motion>({ moving: false, speed: 1 });
	const body = useRef<THREE.Group>(null);
	const local = useMemo(() => new THREE.Vector3(CAMP_MAX[0], 0, CAMP_MAX[1]), []);
	const fire: [number, number] = [CAMP_FIRE[0] - CAMP_MAX[0], CAMP_FIRE[1] - CAMP_MAX[1]];
	useFrame((_, dt) => {
		const g = body.current;
		if (!g) return;
		// Face the visitor when they are close, in the camp's local frame.
		const cos = Math.cos(entity.rotation);
		const sin = Math.sin(entity.rotation);
		const wx = entity.x + local.x * cos + local.z * sin;
		const wz = entity.y - local.x * sin + local.z * cos;
		const dx = bus.player.x - wx;
		const dz = bus.player.y - wz;
		const near = Math.hypot(dx, dz) < 7;
		const want = near ? Math.atan2(dx, dz) - entity.rotation : 0.35;
		g.rotation.y = turn(g.rotation.y, want, dt * 5);
	});
	return (
		<group position={local}>
			<group ref={body}>
				<ActorModel kind="max" motion={motion} reducedMotion={reducedMotion} />
			</group>
			<BlobShadow />
			<FloatingMark position={[0, 2.75, 0]} reducedMotion={reducedMotion} />
			<Anchor bus={bus} id={MAX_ANCHOR} height={1.45} />
			<Flame position={[fire[0], 0.08, fire[1]]} reducedMotion={reducedMotion} />
			<pointLight
				position={[fire[0], 0.9, fire[1]]}
				color="#ffb060"
				intensity={6}
				distance={7}
				decay={1.6}
			/>
			<LightPool position={[fire[0], 0.06, fire[1]]} radius={2.6} />
		</group>
	);
}

function ForgeMagic({ reducedMotion }: { reducedMotion: boolean }) {
	const motes = useRef<THREE.Points>(null);
	const halo = useRef<THREE.Sprite>(null);
	const geometry = useMemo(() => {
		const g = new THREE.BufferGeometry();
		const n = 40;
		const pos = new Float32Array(n * 3);
		const seed = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2 * 3.7;
			const r = 0.5 + ((i * 37) % 10) / 10;
			pos.set([Math.cos(a) * r, ((i * 13) % 30) / 10, Math.sin(a) * r], i * 3);
			seed[i] = i / n;
		}
		g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
		return g;
	}, []);
	useEffect(() => () => geometry.dispose(), [geometry]);
	useFrame(({ clock }, dt) => {
		const t = clock.elapsedTime;
		if (halo.current) {
			const s = 3.2 + (reducedMotion ? 0 : Math.sin(t * 1.7) * 0.35);
			halo.current.scale.set(s, s * 1.4, s);
		}
		const p = motes.current;
		if (!p || reducedMotion) return;
		const pos = p.geometry.getAttribute('position') as THREE.BufferAttribute;
		for (let i = 0; i < pos.count; i++) {
			let y = pos.getY(i) + dt * (0.35 + (i % 5) * 0.08);
			if (y > 3.2) y = 0.2;
			const a = t * 0.4 + i * 0.9;
			const r = 0.55 + (i % 7) * 0.13;
			pos.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r);
		}
		pos.needsUpdate = true;
	});
	return (
		<>
			<sprite
				ref={halo}
				position={[0, 1.5, 0]}
				material={materials().rune}
				renderOrder={3}
			/>
			<points ref={motes} geometry={geometry} renderOrder={4}>
				<pointsMaterial
					color="#aaf6ff"
					size={0.12}
					transparent
					opacity={0.95}
					depthWrite={false}
					blending={THREE.AdditiveBlending}
				/>
			</points>
			<pointLight
				position={[0, 1.6, 0]}
				color="#6fe6ff"
				intensity={4}
				distance={6}
				decay={1.6}
			/>
		</>
	);
}

// ---------------------------------------------------------------------------
// Props

function Prop({ entity, world, spawns, reducedMotion }: Common & { entity: PropEntity }) {
	const pal = BIOMES[world.meta.biome];
	const geo = propGeometry(entity.kind, entity.variant, pal.snow, pal.flowers);
	const y = sampleHeight(world, entity.x, entity.y);
	return (
		<Spawned
			id={entity.id}
			position={[entity.x, y, entity.y]}
			rotation={entity.rotation}
			spawns={spawns}
		>
			<group scale={entity.scale}>
				<Prefab
					geo={geo}
					shadows={entity.kind !== 'flowers' && entity.kind !== 'mushrooms'}
				/>
				{entity.kind === 'lamp' ? (
					<>
						<Halo position={[0.3, 1.38, 0]} scale={1.2} />
						<LightPool position={[0.3, 0.05, 0]} radius={1.7} />
					</>
				) : null}
				{entity.kind === 'campfire' ? (
					<>
						<Flame position={[0, 0.06, 0]} scale={0.8} reducedMotion={reducedMotion} />
						<LightPool position={[0, 0.05, 0]} radius={2} />
					</>
				) : null}
				{entity.kind === 'crystal' ? (
					<Halo position={[0, 0.45, 0]} scale={1.3} kind="rune" />
				) : null}
			</group>
		</Spawned>
	);
}

// ---------------------------------------------------------------------------
// Instanced trees and rocks

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

let swayMaterial: THREE.MeshLambertMaterial | null = null;
const swayTime = { value: 0 };
function treeMaterial() {
	if (swayMaterial) return swayMaterial;
	const m = new THREE.MeshLambertMaterial({ vertexColors: true });
	m.onBeforeCompile = (shader) => {
		shader.uniforms.uTime = swayTime;
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nuniform float uTime;')
			.replace(
				'#include <begin_vertex>',
				`#include <begin_vertex>
				#ifdef USE_INSTANCING
				float swayPhase = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.45;
				float sway = max(0.0, transformed.y - 0.8);
				transformed.x += sin(uTime * 1.2 + swayPhase) * 0.04 * sway;
				transformed.z += cos(uTime * 0.9 + swayPhase) * 0.025 * sway;
				#endif`,
			);
	};
	swayMaterial = m;
	return m;
}

function InstancedGroup<T extends TreeEntity | RockEntity>({
	items,
	geometry,
	world,
	spawns,
	material,
}: {
	items: T[];
	geometry: THREE.BufferGeometry;
	world: CompiledWorld;
	spawns: Spawns;
	material: THREE.Material;
}) {
	const ref = useRef<THREE.InstancedMesh>(null);
	const capacity = Math.max(16, Math.ceil(items.length / 32) * 32);
	const settled = useRef(false);
	const tint = useMemo(
		() =>
			items.map((it) => 0.88 + ((it.variant * 37 + Math.floor(it.x * 13)) % 25) / 100),
		[items],
	);
	useEffect(() => {
		settled.current = false;
		const m = ref.current;
		if (!m) return;
		const c = new THREE.Color();
		items.forEach((_, i) => m.setColorAt(i, c.setScalar(tint[i])));
		if (m.instanceColor) m.instanceColor.needsUpdate = true;
		m.count = items.length;
	}, [items, tint]);
	useFrame(() => {
		const m = ref.current;
		if (!m || settled.current) return;
		const t = now();
		let animating = false;
		items.forEach((it, i) => {
			const p = spawns.progress(it.id, t);
			if (p < 1) animating = true;
			const s = it.scale * popScale(p);
			tmpP.set(it.x, sampleHeight(world, it.x, it.y) - 0.05 + dropOffset(p) * 0.5, it.y);
			tmpQ.setFromAxisAngle(UP, it.rotation);
			tmpS.set(s, s * (it.type === 'rock' && it.size === 'pebbles' ? 0.8 : 1), s);
			tmpM.compose(tmpP, tmpQ, tmpS);
			m.setMatrixAt(i, tmpM);
		});
		m.instanceMatrix.needsUpdate = true;
		if (!animating) settled.current = true;
	});
	return (
		<instancedMesh
			key={capacity}
			ref={ref}
			args={[geometry, material, capacity]}
			castShadow
			receiveShadow
			frustumCulled={false}
		/>
	);
}

function Flora({ world, spawns, reducedMotion }: Common) {
	const biome = world.meta.biome;
	const trees = useMemo(() => {
		const by = new Map<TreeSpecies, TreeEntity[]>();
		for (const t of world.trees) by.set(t.species, [...(by.get(t.species) ?? []), t]);
		return [...by.entries()];
	}, [world.trees]);
	const rocks = useMemo(() => {
		const by = new Map<RockSize, RockEntity[]>();
		for (const r of world.rocks) by.set(r.size, [...(by.get(r.size) ?? []), r]);
		return [...by.entries()];
	}, [world.rocks]);
	useFrame((_, dt) => {
		if (!reducedMotion) swayTime.value += dt;
	});
	const mats = materials();
	return (
		<>
			{trees.map(([species, items]) => (
				<InstancedGroup
					key={`t-${species}-${biome}`}
					items={items}
					geometry={treeGeometry(species, biome)}
					world={world}
					spawns={spawns}
					material={treeMaterial()}
				/>
			))}
			{rocks.map(([size, items]) => (
				<InstancedGroup
					key={`r-${size}-${biome}`}
					items={items}
					geometry={rockGeometry(size, biome)}
					world={world}
					spawns={spawns}
					material={mats.body}
				/>
			))}
		</>
	);
}

// ---------------------------------------------------------------------------

export function Structures({
	world,
	spawns,
	reducedMotion,
	bus,
}: Common & { bus: GameBus; lighting: Lighting }) {
	return (
		<>
			<Flora world={world} spawns={spawns} reducedMotion={reducedMotion} />
			{world.buildings.map((b) => (
				<Building
					key={b.id}
					entity={b}
					world={world}
					spawns={spawns}
					reducedMotion={reducedMotion}
				/>
			))}
			{world.landmarks.map((l) => (
				<Landmark
					key={l.id}
					entity={l}
					world={world}
					spawns={spawns}
					reducedMotion={reducedMotion}
					bus={bus}
				/>
			))}
			{world.props.map((p) => (
				<Prop
					key={p.id}
					entity={p}
					world={world}
					spawns={spawns}
					reducedMotion={reducedMotion}
				/>
			))}
		</>
	);
}
