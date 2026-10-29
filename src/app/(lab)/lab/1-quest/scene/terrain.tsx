'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
	GRID_H,
	GRID_W,
	hashString,
	sampleHeight,
	valueNoise,
	WATER_LEVEL,
	type CompiledWorld,
} from '../world/compile';
import { blossomGeometry, tuftGeometry } from './flora';
import { materials } from './materials';
import { BIOMES, type Lighting } from './palette';
import { deckGeometry } from './prefabs';

/** How far the painted mountain rim reaches beyond the playable valley. */
export const RIM = 18;
const STEP = 0.5;

const smoothstep = (a: number, b: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

/** Terrain height anywhere, including the mountain rim outside the grid. */
export function terrainHeightAt(heights: Float32Array, px: number, pz: number) {
	const cx = Math.min(GRID_W, Math.max(0, px));
	const cz = Math.min(GRID_H, Math.max(0, pz));
	const base = sampleHeight({ heights }, cx, cz);
	const d = Math.hypot(px - cx, pz - cz);
	if (d <= 0) return base;
	const n = valueNoise(911, px * 0.11, pz * 0.11);
	return base + smoothstep(0, 13, d) * (6.5 + 7 * n) + d * 0.12;
}

type Props = {
	world: CompiledWorld;
	lighting: Lighting;
	quality: 'high' | 'low';
	reducedMotion: boolean;
};

type VertexInfo = {
	count: number;
	/** Four cell indices and bilinear weights per vertex (for the clamped point on the grid). */
	cells: Int32Array;
	weights: Float32Array;
	/** Distance outside the grid; 0 inside. */
	outside: Float32Array;
	/** Static height of the mountain rim on top of the edge height. */
	rise: Float32Array;
	mottle: Float32Array;
	cols: number;
};

function vertexInfo(geometry: THREE.BufferGeometry): VertexInfo {
	const pos = geometry.getAttribute('position');
	const count = pos.count;
	const info: VertexInfo = {
		count,
		cells: new Int32Array(count * 4),
		weights: new Float32Array(count * 4),
		outside: new Float32Array(count),
		rise: new Float32Array(count),
		mottle: new Float32Array(count),
		cols: (GRID_W + RIM * 2) / STEP + 1,
	};
	for (let i = 0; i < count; i++) {
		const px = pos.getX(i);
		const pz = pos.getZ(i);
		const cx = Math.min(GRID_W, Math.max(0, px));
		const cz = Math.min(GRID_H, Math.max(0, pz));
		const u = Math.min(GRID_W - 1, Math.max(0, cx - 0.5));
		const v = Math.min(GRID_H - 1, Math.max(0, cz - 0.5));
		const x0 = Math.min(GRID_W - 2, Math.floor(u));
		const y0 = Math.min(GRID_H - 2, Math.floor(v));
		const tx = u - x0;
		const ty = v - y0;
		info.cells.set(
			[
				y0 * GRID_W + x0,
				y0 * GRID_W + x0 + 1,
				(y0 + 1) * GRID_W + x0,
				(y0 + 1) * GRID_W + x0 + 1,
			],
			i * 4,
		);
		info.weights.set([(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty], i * 4);
		const d = Math.hypot(px - cx, pz - cz);
		info.outside[i] = d;
		if (d > 0) {
			const n = valueNoise(911, px * 0.11, pz * 0.11);
			info.rise[i] = smoothstep(0, 13, d) * (6.5 + 7 * n) + d * 0.12;
		}
		info.mottle[i] =
			0.9 +
			0.16 * valueNoise(13, px * 0.35, pz * 0.35) +
			0.06 * valueNoise(29, px * 2.1, pz * 2.1);
	}
	return info;
}

function vertexHeights(info: VertexInfo, heights: Float32Array, out: Float32Array) {
	const { cells, weights, outside, rise } = info;
	for (let i = 0; i < info.count; i++) {
		const j = i * 4;
		let h =
			heights[cells[j]] * weights[j] +
			heights[cells[j + 1]] * weights[j + 1] +
			heights[cells[j + 2]] * weights[j + 2] +
			heights[cells[j + 3]] * weights[j + 3];
		if (outside[i] > 0) h += rise[i];
		out[i] = h;
	}
	return out;
}

export function Terrain({ world, lighting, quality, reducedMotion }: Props) {
	const pal = BIOMES[world.meta.biome];
	const state = useRef<{ current: Float32Array; dirty: boolean } | null>(null);

	const { geometry, info, scratch } = useMemo(() => {
		const w = GRID_W + RIM * 2;
		const h = GRID_H + RIM * 2;
		const g = new THREE.PlaneGeometry(w, h, w / STEP, h / STEP);
		g.rotateX(-Math.PI / 2);
		g.translate(GRID_W / 2, 0, GRID_H / 2);
		g.setAttribute(
			'color',
			new THREE.Float32BufferAttribute(
				new Float32Array(g.getAttribute('position').count * 3),
				3,
			),
		);
		const info = vertexInfo(g);
		return { geometry: g, info, scratch: new Float32Array(info.count) };
	}, []);
	useEffect(() => () => geometry.dispose(), [geometry]);

	const writeHeights = (heights: Float32Array) => {
		vertexHeights(info, heights, scratch);
		const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
		for (let i = 0; i < info.count; i++) pos.setY(i, scratch[i]);
		pos.needsUpdate = true;
		geometry.computeVertexNormals();
		geometry.computeBoundingSphere();
	};

	// Vertex colours: painted once per world from the final heights.
	useEffect(() => {
		const cellColors = new Float32Array(GRID_W * GRID_H * 3);
		const c = new THREE.Color();
		for (let i = 0; i < GRID_W * GRID_H; i++) {
			const kind = world.ground[i];
			const x = i % GRID_W;
			const y = (i - x) / GRID_W;
			c.set(
				kind === 'water'
					? pal.lakebed
					: pal.ground[kind][hashString(`${x},${y}`, 77) % 2],
			);
			cellColors[i * 3] = c.r;
			cellColors[i * 3 + 1] = c.g;
			cellColors[i * 3 + 2] = c.b;
		}
		const heights = vertexHeights(info, world.heights, new Float32Array(info.count));
		const rim = pal.rim.map((h) => new THREE.Color(h));
		const rock = new THREE.Color(pal.ground.rock[0]);
		const col = geometry.getAttribute('color') as THREE.BufferAttribute;
		const tmp = new THREE.Color();
		const { cells, weights, outside, mottle, cols } = info;
		for (let i = 0; i < info.count; i++) {
			const j = i * 4;
			let r = 0;
			let g = 0;
			let b = 0;
			for (let k = 0; k < 4; k++) {
				const ci = cells[j + k] * 3;
				r += cellColors[ci] * weights[j + k];
				g += cellColors[ci + 1] * weights[j + k];
				b += cellColors[ci + 2] * weights[j + k];
			}
			tmp.setRGB(r, g, b);
			const d = outside[i];
			if (d > 0) {
				tmp.lerp(rim[0], smoothstep(0, 4, d));
				tmp.lerp(rim[1], smoothstep(3, 10, d) * 0.85);
				tmp.lerp(rim[2], smoothstep(10.5, 15, heights[i]) * 0.9);
			} else {
				const hx = heights[Math.min(info.count - 1, i + 1)] - heights[Math.max(0, i - 1)];
				const hz =
					heights[Math.min(info.count - 1, i + cols)] - heights[Math.max(0, i - cols)];
				const slope = Math.hypot(hx, hz);
				if (slope > 0.75) tmp.lerp(rock, smoothstep(0.75, 1.4, slope) * 0.8);
			}
			const m = mottle[i];
			col.setXYZ(i, tmp.r * m, tmp.g * m, tmp.b * m);
		}
		col.needsUpdate = true;
	}, [world, pal, geometry, info]);

	useEffect(() => {
		if (!state.current) state.current = { current: world.heights.slice(), dirty: true };
		if (reducedMotion) state.current.current = world.heights.slice();
		state.current.dirty = true;
	}, [world, reducedMotion]);

	useFrame((_, dt) => {
		const s = state.current;
		if (!s || !s.dirty) return;
		const target = world.heights;
		const k = 1 - Math.exp(-Math.min(dt, 0.1) * 5);
		let moving = false;
		for (let i = 0; i < target.length; i++) {
			const d = target[i] - s.current[i];
			if (Math.abs(d) > 0.004) {
				s.current[i] += d * k;
				moving = true;
			} else s.current[i] = target[i];
		}
		writeHeights(s.current);
		waterHeights.update(s.current);
		if (!moving) s.dirty = false;
	});

	const decks = useMemo(() => deckGeometry(world.decks), [world.decks]);
	useEffect(() => () => decks?.dispose(), [decks]);
	const mats = materials();

	return (
		<group>
			<mesh geometry={geometry} receiveShadow>
				<meshLambertMaterial vertexColors />
			</mesh>
			<Water world={world} lighting={lighting} reducedMotion={reducedMotion} />
			{decks ? (
				<mesh geometry={decks} material={mats.body} castShadow receiveShadow />
			) : null}
			<Tufts world={world} quality={quality} />
		</group>
	);
}

// ---------------------------------------------------------------------------
// Water: one plane at the water level; colour and foam come from the depth below it.

const waterHeights = (() => {
	let tex: THREE.DataTexture | null = null;
	return {
		texture() {
			if (!tex) {
				tex = new THREE.DataTexture(
					new Uint8Array(GRID_W * GRID_H),
					GRID_W,
					GRID_H,
					THREE.RedFormat,
					THREE.UnsignedByteType,
				);
				tex.magFilter = THREE.LinearFilter;
				tex.minFilter = THREE.LinearFilter;
				tex.needsUpdate = true;
			}
			return tex;
		},
		update(heights: Float32Array) {
			const t = this.texture();
			const data = t.image.data as Uint8Array;
			for (let i = 0; i < heights.length; i++)
				data[i] = Math.max(0, Math.min(255, Math.round(((heights[i] + 3) / 10) * 255)));
			t.needsUpdate = true;
		},
	};
})();

const waterTime = { value: 0 };

const waterVertex = /* glsl */ `
	uniform float uTime;
	varying vec3 vWorld;
	#include <fog_pars_vertex>
	void main() {
		vec3 p = position;
		vec4 world = modelMatrix * vec4(p, 1.0);
		world.y += sin(world.x * 1.3 + uTime * 1.1) * 0.025 + cos(world.z * 1.1 + uTime * 0.9) * 0.025;
		vWorld = world.xyz;
		vec4 mvPosition = viewMatrix * world;
		gl_Position = projectionMatrix * mvPosition;
		#include <fog_vertex>
	}
`;

const waterFragment = /* glsl */ `
	uniform float uTime;
	uniform sampler2D uHeights;
	uniform vec2 uSize;
	uniform vec3 uShallow;
	uniform vec3 uDeep;
	uniform vec3 uFoam;
	uniform vec3 uSky;
	uniform float uLight;
	uniform float uLevel;
	varying vec3 vWorld;
	#include <fog_pars_fragment>
	void main() {
		vec2 uv = vWorld.xz / uSize;
		float h = texture2D(uHeights, clamp(uv, 0.0, 1.0)).r * 10.0 - 3.0;
		float depth = uLevel - h;
		if (depth < -0.05) discard;
		float d = clamp(depth / 0.8, 0.0, 1.0);
		vec3 col = mix(uShallow, uDeep, smoothstep(0.05, 1.0, d));
		// Painted ripples: soft bands drifting across the surface.
		float band = sin(vWorld.x * 1.7 + sin(vWorld.z * 1.3 + uTime * 0.7) * 1.6 + uTime * 0.9);
		float band2 = sin(vWorld.z * 2.3 - sin(vWorld.x * 0.9 - uTime * 0.5) * 1.4 - uTime * 0.6);
		col += uSky * 0.18 * smoothstep(0.82, 1.0, band) + uSky * 0.12 * smoothstep(0.86, 1.0, band2);
		// Foam where the water meets the shore.
		float foam = 1.0 - smoothstep(0.02, 0.2 + 0.05 * sin(uTime * 1.6 + vWorld.x * 3.0), depth);
		col = mix(col, uFoam, foam * 0.85);
		col *= uLight;
		float alpha = mix(0.62, 0.9, d);
		gl_FragColor = vec4(col, max(alpha, foam));
		#include <fog_fragment>
	}
`;

function Water({
	world,
	lighting,
	reducedMotion,
}: {
	world: CompiledWorld;
	lighting: Lighting;
	reducedMotion: boolean;
}) {
	const pal = BIOMES[world.meta.biome];
	const geometry = useMemo(() => {
		const g = new THREE.PlaneGeometry(GRID_W + RIM * 2, GRID_H + RIM * 2, 60, 46);
		g.rotateX(-Math.PI / 2);
		g.translate(GRID_W / 2, WATER_LEVEL, GRID_H / 2);
		return g;
	}, []);
	const material = useMemo(() => {
		const m = new THREE.ShaderMaterial({
			vertexShader: waterVertex,
			fragmentShader: waterFragment,
			transparent: true,
			depthWrite: false,
			fog: true,
			uniforms: THREE.UniformsUtils.merge([
				THREE.UniformsLib.fog,
				{
					uTime: { value: 0 },
					uHeights: { value: null },
					uSize: { value: new THREE.Vector2(GRID_W, GRID_H) },
					uShallow: { value: new THREE.Color() },
					uDeep: { value: new THREE.Color() },
					uFoam: { value: new THREE.Color() },
					uSky: { value: new THREE.Color() },
					uLight: { value: 1 },
					uLevel: { value: WATER_LEVEL },
				},
			]),
		});
		m.uniforms.uTime = waterTime;
		return m;
	}, []);
	useEffect(
		() => () => {
			geometry.dispose();
			material.dispose();
		},
		[geometry, material],
	);
	const mesh = useRef<THREE.Mesh>(null);
	useEffect(() => {
		const m = mesh.current?.material as THREE.ShaderMaterial | undefined;
		if (!m) return;
		const u = m.uniforms;
		u.uHeights.value = waterHeights.texture();
		(u.uShallow.value as THREE.Color).set(pal.water.shallow);
		(u.uDeep.value as THREE.Color).set(pal.water.deep);
		(u.uFoam.value as THREE.Color).set(pal.water.foam);
		(u.uSky.value as THREE.Color).set(lighting.skyHorizon);
		u.uLight.value = lighting.glow >= 1 ? 0.45 : lighting.glow > 0.5 ? 0.8 : 1;
	}, [material, pal, lighting]);
	useFrame(({ clock }) => {
		if (!reducedMotion) waterTime.value = clock.elapsedTime;
	});
	return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={1} />;
}

// ---------------------------------------------------------------------------
// Grass tufts and wild blossoms, instanced.

function Tufts({ world, quality }: { world: CompiledWorld; quality: 'high' | 'low' }) {
	const pal = BIOMES[world.meta.biome];
	const tuftRef = useRef<THREE.InstancedMesh>(null);
	const bloomRef = useRef<THREE.InstancedMesh>(null);
	const MAX_TUFTS = 3200;
	const MAX_BLOOMS = 600;

	const layout = useMemo(() => {
		const tufts: number[] = [];
		const blooms: number[] = [];
		const per = quality === 'high' ? 1 : 0.5;
		const treeCells = new Set(
			world.trees.map((t) => Math.floor(t.y) * GRID_W + Math.floor(t.x)),
		);
		for (let y = 0; y < GRID_H; y++)
			for (let x = 0; x < GRID_W; x++) {
				const i = y * GRID_W + x;
				const kind = world.ground[i];
				if (kind !== 'grass' && kind !== 'lush' && kind !== 'dry') continue;
				if (!world.passable[i] && !treeCells.has(i)) continue;
				const h = hashString(`t${x},${y}`, world.seed);
				const n = Math.round((kind === 'lush' ? 5 : kind === 'grass' ? 3 : 2) * per);
				for (let k = 0; k < n; k++) {
					const hk = hashString(`${k}`, h);
					tufts.push(
						x + ((hk & 255) / 255) * 0.9 + 0.05,
						y + (((hk >> 8) & 255) / 255) * 0.9 + 0.05,
						((hk >> 16) & 255) / 255,
					);
				}
				if (kind !== 'dry' && (h & 1023) < 170 * per) {
					const hb = hashString('b', h);
					blooms.push(
						x + ((hb & 255) / 255) * 0.8 + 0.1,
						y + (((hb >> 8) & 255) / 255) * 0.8 + 0.1,
						((hb >> 16) & 255) / 255,
					);
				}
			}
		return {
			tufts: tufts.slice(0, MAX_TUFTS * 3),
			blooms: blooms.slice(0, MAX_BLOOMS * 3),
		};
	}, [world, quality]);

	useEffect(() => {
		const m = new THREE.Matrix4();
		const q = new THREE.Quaternion();
		const s = new THREE.Vector3();
		const p = new THREE.Vector3();
		const c = new THREE.Color();
		const a = new THREE.Color(pal.tuft[0]);
		const b = new THREE.Color(pal.tuft[1]);
		const tm = tuftRef.current;
		if (tm) {
			const n = layout.tufts.length / 3;
			for (let i = 0; i < n; i++) {
				const x = layout.tufts[i * 3];
				const z = layout.tufts[i * 3 + 1];
				const r = layout.tufts[i * 3 + 2];
				p.set(x, sampleHeight(world, x, z) - 0.02, z);
				q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r * Math.PI * 2);
				const sc = 0.7 + r * 0.7;
				s.set(sc, sc * (0.8 + r * 0.6), sc);
				m.compose(p, q, s);
				tm.setMatrixAt(i, m);
				c.copy(a).lerp(b, r);
				tm.setColorAt(i, c);
			}
			tm.count = n;
			tm.instanceMatrix.needsUpdate = true;
			if (tm.instanceColor) tm.instanceColor.needsUpdate = true;
		}
		const bm = bloomRef.current;
		if (bm) {
			const n = layout.blooms.length / 3;
			for (let i = 0; i < n; i++) {
				const x = layout.blooms[i * 3];
				const z = layout.blooms[i * 3 + 1];
				const r = layout.blooms[i * 3 + 2];
				p.set(x, sampleHeight(world, x, z), z);
				q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r * 6.28);
				s.setScalar(0.8 + r * 0.5);
				m.compose(p, q, s);
				bm.setMatrixAt(i, m);
				c.set(pal.flowers[Math.floor(r * pal.flowers.length) % pal.flowers.length]);
				bm.setColorAt(i, c);
			}
			bm.count = n;
			bm.instanceMatrix.needsUpdate = true;
			if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
		}
	}, [layout, world, pal]);

	const mats = materials();
	return (
		<>
			<instancedMesh
				ref={tuftRef}
				args={[tuftGeometry(), mats.body, MAX_TUFTS]}
				frustumCulled={false}
			/>
			<instancedMesh
				ref={bloomRef}
				args={[blossomGeometry(), mats.body, MAX_BLOOMS]}
				frustumCulled={false}
			/>
		</>
	);
}
