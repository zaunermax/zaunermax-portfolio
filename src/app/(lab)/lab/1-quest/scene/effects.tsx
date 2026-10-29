'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GRID_H, GRID_W, mulberry32, type Biome, type Weather } from '../world/compile';
import type { GameBus } from './bus';
import { radialTexture } from './materials';
import { now, type Spawns } from './spawn';

const tmp = {
	mat: new THREE.Matrix4(),
	pos: new THREE.Vector3(),
	q: new THREE.Quaternion(),
	sc: new THREE.Vector3(),
	e: new THREE.Euler(),
	one: new THREE.Vector3(1, 1, 1),
};

const DUST: Record<Biome, string> = {
	meadow: '#e3d3a8',
	autumn: '#e0c08a',
	winter: '#f4f8fc',
	desert: '#f0d49a',
	swamp: '#b8b88a',
	highlands: '#d8d0c0',
};

/** Little dust clouds where a new block lands. */
export function DustPuffs({ spawns, biome }: { spawns: Spawns; biome: Biome }) {
	const ref = useRef<THREE.InstancedMesh>(null);
	const CAP = 320;
	const PER = 8;
	const geometry = useMemo(() => new THREE.IcosahedronGeometry(0.2, 0), []);
	const material = useMemo(
		() =>
			new THREE.MeshLambertMaterial({
				color: DUST[biome],
				transparent: true,
				opacity: 0.85,
				depthWrite: false,
			}),
		[biome],
	);
	useEffect(
		() => () => {
			geometry.dispose();
			material.dispose();
		},
		[geometry, material],
	);
	useFrame(() => {
		const m = ref.current;
		if (!m) return;
		const t = now();
		const puffs = spawns.prune(t);
		const { mat, pos, q, sc } = tmp;
		let n = 0;
		for (const p of puffs) {
			const age = (t - p.t0) / 1;
			if (age < 0) continue;
			for (let i = 0; i < PER && n < CAP; i++) {
				const a = (i / PER) * Math.PI * 2 + p.x;
				const spread = (1 - (1 - age) * (1 - age)) * 1.3 * p.size;
				pos.set(
					p.x + Math.cos(a) * spread,
					p.y + 0.15 + age * 0.7 + (i % 2) * 0.15,
					p.z + Math.sin(a) * spread,
				);
				const s = p.size * (0.6 + age * 1.2) * (1 - age);
				sc.set(s, s, s);
				mat.compose(pos, q, sc);
				m.setMatrixAt(n++, mat);
			}
		}
		m.count = n;
		m.instanceMatrix.needsUpdate = true;
	});
	return (
		<instancedMesh
			ref={ref}
			args={[geometry, material, CAP]}
			frustumCulled={false}
			renderOrder={6}
		/>
	);
}

// ---------------------------------------------------------------------------
// Weather: a small box of particles that follows the camera focus.

const BOX = 36;
const wrap = (v: number, c: number) =>
	c + ((((v - c + BOX / 2) % BOX) + BOX) % BOX) - BOX / 2;

function focusOf(bus: GameBus, overview: boolean) {
	return overview
		? { x: GRID_W / 2, y: GRID_H / 2 }
		: { x: bus.player.x, y: bus.player.y };
}

export function WeatherFx({
	weather,
	bus,
	overview,
	quality,
	reducedMotion,
	night,
	biome,
}: {
	weather: Weather;
	bus: GameBus;
	overview: boolean;
	quality: 'high' | 'low';
	reducedMotion: boolean;
	night: boolean;
	biome: Biome;
}) {
	if (reducedMotion && weather !== 'fog') return null;
	const scale = quality === 'high' ? 1 : 0.5;
	switch (weather) {
		case 'rain':
			return <Rain count={Math.round(1000 * scale)} bus={bus} overview={overview} />;
		case 'snow':
			return <Snow count={Math.round(900 * scale)} bus={bus} overview={overview} />;
		case 'fireflies':
			return (
				<Fireflies
					count={Math.round(110 * scale)}
					bus={bus}
					overview={overview}
					night={night}
				/>
			);
		case 'leaves':
			return (
				<Leaves
					count={Math.round(120 * scale)}
					bus={bus}
					overview={overview}
					biome={biome}
				/>
			);
		case 'fog':
			return <FogBanks bus={bus} overview={overview} night={night} />;
		default:
			return null;
	}
}

function seeded(count: number, seed: number, height: [number, number]) {
	const rnd = mulberry32(seed);
	const out = new Float32Array(count * 3);
	for (let i = 0; i < count; i++) {
		out[i * 3] = GRID_W / 2 + (rnd() - 0.5) * BOX;
		out[i * 3 + 1] = height[0] + rnd() * (height[1] - height[0]);
		out[i * 3 + 2] = GRID_H / 2 + (rnd() - 0.5) * BOX;
	}
	return out;
}

function Rain({
	count,
	bus,
	overview,
}: {
	count: number;
	bus: GameBus;
	overview: boolean;
}) {
	const state = useRef<Float32Array | null>(null);
	const geometry = useMemo(() => {
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
		return g;
	}, [count]);
	useEffect(() => () => geometry.dispose(), [geometry]);
	useFrame((_, dt) => {
		const f = focusOf(bus, overview);
		if (state.current?.length !== count * 3) state.current = seeded(count, 3, [0, 18]);
		const drops = state.current;
		const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
		const arr = pos.array as Float32Array;
		for (let i = 0; i < count; i++) {
			let y = drops[i * 3 + 1] - dt * 20;
			if (y < -1) y += 19;
			drops[i * 3 + 1] = y;
			const x = wrap(drops[i * 3], f.x);
			const z = wrap(drops[i * 3 + 2], f.y);
			arr.set([x, y, z, x + 0.06, y + 0.55, z + 0.03], i * 6);
		}
		pos.needsUpdate = true;
	});
	return (
		<lineSegments geometry={geometry} frustumCulled={false}>
			<lineBasicMaterial color="#c8d6ea" transparent opacity={0.55} depthWrite={false} />
		</lineSegments>
	);
}

function Snow({
	count,
	bus,
	overview,
}: {
	count: number;
	bus: GameBus;
	overview: boolean;
}) {
	const state = useRef<Float32Array | null>(null);
	const geometry = useMemo(() => {
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
		return g;
	}, [count]);
	useEffect(() => () => geometry.dispose(), [geometry]);
	useFrame(({ clock }, dt) => {
		const f = focusOf(bus, overview);
		const t = clock.elapsedTime;
		if (state.current?.length !== count * 3) state.current = seeded(count, 5, [0, 16]);
		const flakes = state.current;
		const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
		const arr = pos.array as Float32Array;
		for (let i = 0; i < count; i++) {
			let y = flakes[i * 3 + 1] - dt * (0.9 + (i % 5) * 0.12);
			if (y < -0.5) y += 16.5;
			flakes[i * 3 + 1] = y;
			const sway = Math.sin(t * 0.8 + i) * 0.4;
			arr.set(
				[
					wrap(flakes[i * 3] + sway, f.x),
					y,
					wrap(flakes[i * 3 + 2] + Math.cos(t * 0.6 + i) * 0.3, f.y),
				],
				i * 3,
			);
		}
		pos.needsUpdate = true;
	});
	return (
		<points geometry={geometry} frustumCulled={false}>
			<pointsMaterial
				map={radialTexture()}
				color="#ffffff"
				size={0.22}
				transparent
				depthWrite={false}
				opacity={0.95}
			/>
		</points>
	);
}

function Fireflies({
	count,
	bus,
	overview,
	night,
}: {
	count: number;
	bus: GameBus;
	overview: boolean;
	night: boolean;
}) {
	const flies = useMemo(() => seeded(count, 9, [0.3, 2.8]), [count]);
	const geometry = useMemo(() => {
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
		g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
		return g;
	}, [count]);
	useEffect(() => () => geometry.dispose(), [geometry]);
	useFrame(({ clock }) => {
		const f = focusOf(bus, overview);
		const t = clock.elapsedTime;
		const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
		const col = geometry.getAttribute('color') as THREE.BufferAttribute;
		for (let i = 0; i < count; i++) {
			const x = wrap(flies[i * 3] + Math.sin(t * 0.3 + i) * 1.2, f.x);
			const z = wrap(flies[i * 3 + 2] + Math.cos(t * 0.27 + i * 1.3) * 1.2, f.y);
			pos.setXYZ(i, x, flies[i * 3 + 1] + Math.sin(t * 0.9 + i * 2.1) * 0.4 + 0.6, z);
			const blink = Math.max(0, Math.sin(t * 1.7 + i * 2.7));
			const b = (night ? 1 : 0.7) * blink * blink;
			col.setXYZ(i, 0.85 * b, 1.0 * b, 0.35 * b);
		}
		pos.needsUpdate = true;
		col.needsUpdate = true;
	});
	return (
		<points geometry={geometry} frustumCulled={false}>
			<pointsMaterial
				map={radialTexture()}
				vertexColors
				size={0.32}
				transparent
				depthWrite={false}
				blending={THREE.AdditiveBlending}
			/>
		</points>
	);
}

function Leaves({
	count,
	bus,
	overview,
	biome,
}: {
	count: number;
	bus: GameBus;
	overview: boolean;
	biome: Biome;
}) {
	const ref = useRef<THREE.InstancedMesh>(null);
	const state = useRef<Float32Array | null>(null);
	const geometry = useMemo(() => new THREE.PlaneGeometry(0.16, 0.1), []);
	const material = useMemo(
		() => new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }),
		[],
	);
	useEffect(
		() => () => {
			geometry.dispose();
			material.dispose();
		},
		[geometry, material],
	);
	useEffect(() => {
		const m = ref.current;
		if (!m) return;
		const palette =
			biome === 'autumn'
				? ['#e8642a', '#f2a33a', '#c8401f', '#e8c23a']
				: biome === 'winter'
					? ['#ffffff', '#e8f0f8']
					: ['#f2a33a', '#e8c23a', '#7fbf3f', '#d9622b'];
		const c = new THREE.Color();
		for (let i = 0; i < count; i++) m.setColorAt(i, c.set(palette[i % palette.length]));
		if (m.instanceColor) m.instanceColor.needsUpdate = true;
	}, [biome, count]);
	useFrame(({ clock }, dt) => {
		const m = ref.current;
		if (!m) return;
		const f = focusOf(bus, overview);
		const t = clock.elapsedTime;
		if (state.current?.length !== count * 3) state.current = seeded(count, 11, [0, 12]);
		const leaves = state.current;
		const { mat, e, q, pos: p, one: s } = tmp;
		for (let i = 0; i < count; i++) {
			let y = leaves[i * 3 + 1] - dt * (0.6 + (i % 4) * 0.12);
			if (y < 0) y += 12;
			leaves[i * 3 + 1] = y;
			leaves[i * 3] += dt * 0.5;
			p.set(
				wrap(leaves[i * 3] + Math.sin(t + i) * 0.8, f.x),
				y,
				wrap(leaves[i * 3 + 2] + Math.cos(t * 0.7 + i) * 0.6, f.y),
			);
			e.set(t * 1.3 + i, t * 0.9 + i * 2, t * 0.7);
			q.setFromEuler(e);
			mat.compose(p, q, s);
			m.setMatrixAt(i, mat);
		}
		m.instanceMatrix.needsUpdate = true;
	});
	return (
		<instancedMesh ref={ref} args={[geometry, material, count]} frustumCulled={false} />
	);
}

function FogBanks({
	bus,
	overview,
	night,
}: {
	bus: GameBus;
	overview: boolean;
	night: boolean;
}) {
	const group = useRef<THREE.Group>(null);
	const material = useMemo(
		() =>
			new THREE.SpriteMaterial({
				map: radialTexture(),
				color: night ? '#5a6a90' : '#f2f4f6',
				transparent: true,
				opacity: 0.22,
				depthWrite: false,
			}),
		[night],
	);
	useEffect(() => () => material.dispose(), [material]);
	const banks = useMemo(() => seeded(26, 13, [0.4, 1.6]), []);
	useFrame(({ clock }) => {
		const g = group.current;
		if (!g) return;
		const f = focusOf(bus, overview);
		const t = clock.elapsedTime;
		g.children.forEach((child, i) => {
			child.position.set(
				wrap(banks[i * 3] + t * 0.15, f.x),
				banks[i * 3 + 1],
				wrap(banks[i * 3 + 2] + Math.sin(t * 0.1 + i) * 2, f.y),
			);
		});
	});
	return (
		<group ref={group}>
			{Array.from({ length: 26 }, (_, i) => (
				<sprite key={i} material={material} scale={[9, 3.5, 1]} />
			))}
		</group>
	);
}
