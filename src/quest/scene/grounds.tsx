'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { fbm, lattice, rngFor, type Rng } from '../world/random';
import type { Outside } from '../world/schema';
import type { CompiledWorld } from '../world/types';
import { materials, radialTexture } from './materials';
import type { Lighting } from './palette';
import { PX } from './textures';

/*
 * The grounds around the office, in the same pixel-voxel style as the inside: a pixel lawn
 * that runs to the horizon, a paved apron that follows the building's outline (notches and
 * all), a path from the front door to a street along the south side, and voxel trees, bushes,
 * benches and street lamps that light up after dark. Everything comes from the seed and is
 * dressed for the weather: wet paving and puddles in the rain, snow on the lawn and the trees.
 *
 * Trees keep three tiles clear of the building, so at the camera's 50° pitch even the tallest
 * never hides a room; only knee-high bushes come closer.
 */

/** Tiles of yard painted around the grid; a multiple of the lawn's period, so the two line up. */
const YARD = 8;
/** The lawn texture repeats every this many tiles. */
const PERIOD = 8;
/** Rows between the building's south edge and the street: the apron and a verge. */
const STREET_GAP = 2;
/** Sidewalk, three rows of road, sidewalk. */
const STREET_ROWS = 5;
/** How far trees spread from the grid. */
const WOODS = 13;
const TREE_CLEARANCE = 3;

const LAWN_Y = -0.34;
const YARD_Y = -0.33;
const STREET_Y = -0.32;

type Rgb = [number, number, number];
type Rect = CompiledWorld['footprint'][number];
/** What the grounds depend on: fixed per seed, so streamed worlds keep the same grounds. */
type Site = Pick<CompiledWorld, 'seed' | 'width' | 'height' | 'footprint' | 'entrance'>;

const rgb = (hex: string): Rgb => {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mod = (v: number, n: number) => ((v % n) + n) % n;
const snap = (v: number) => Math.round(v * 16) / 16;

function put(data: ImageData, x: number, y: number, c: Rgb, f = 1) {
	const o = (y * data.width + x) * 4;
	data.data[o] = Math.max(0, Math.min(255, c[0] * f));
	data.data[o + 1] = Math.max(0, Math.min(255, c[1] * f));
	data.data[o + 2] = Math.max(0, Math.min(255, c[2] * f));
	data.data[o + 3] = 255;
}

function pixelTexture(canvas: HTMLCanvasElement, repeat: boolean) {
	const texture = new THREE.CanvasTexture(canvas);
	texture.magFilter = THREE.NearestFilter;
	texture.minFilter = THREE.NearestMipmapLinearFilter;
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	return texture;
}

/** Value noise that wraps every `n` lattice cells, so a tiling texture has no seams. */
function wrapNoise(seed: number, x: number, y: number, n: number) {
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const sx = x - x0;
	const sy = y - y0;
	const tx = sx * sx * (3 - 2 * sx);
	const ty = sy * sy * (3 - 2 * sy);
	const at = (i: number, j: number) => lattice(seed, mod(i, n), mod(j, n));
	const a = at(x0, y0);
	const b = at(x0 + 1, y0);
	const c = at(x0, y0 + 1);
	const d = at(x0 + 1, y0 + 1);
	return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

// ---------------------------------------------------------------------------------------------
// Surfaces

type Dress = { seed: number; ground: Rgb; outside: Outside };

const FLOWERS = ['#e8836b', '#f2c14b', '#f4efe6', '#b4a2d2'].map(rgb);
const SNOW = rgb('#eef2f6');
const PUDDLE = rgb('#7f8fa8');

/** One lawn pixel at world pixel (wx, wy); periodic, so the yard and the lawn line up. */
function grass(d: Dress, wx: number, wy: number): Rgb {
	const P = PERIOD * PX;
	const x = mod(wx, P);
	const y = mod(wy, P);
	let f = 0.93 + wrapNoise(d.seed, x / 32, y / 32, P / 32) * 0.12;
	f *= 0.96 + lattice(d.seed + 1, x >> 1, y >> 1) * 0.08;
	// Blades: a dark pixel with a sunlit one above it.
	if (lattice(d.seed + 3, x, y) < 0.05) f *= 0.84;
	else if (lattice(d.seed + 3, x, y + 1) < 0.05) f *= 1.08;
	if (d.outside !== 'snow' && lattice(d.seed + 9, x, y) < 0.0025)
		return FLOWERS[Math.floor(lattice(d.seed + 10, x, y) * FLOWERS.length)];
	return [d.ground[0] * f, d.ground[1] * f, d.ground[2] * f];
}

/** Wet, puddled or snowed-over paving. */
function weathered(d: Dress, c: Rgb, wx: number, wy: number): Rgb {
	if (d.outside === 'snow') {
		const drift = fbm(d.seed + 21, wx / 20, wy / 20);
		return mixRgb(c, SNOW, 0.45 + drift * 0.35);
	}
	if (d.outside === 'rain') {
		const wet: Rgb = [c[0] * 0.82, c[1] * 0.84, c[2] * 0.9];
		const puddle = fbm(d.seed + 23, wx / 22, wy / 22);
		if (puddle > 0.66) return mixRgb(wet, PUDDLE, lattice(d.seed + 24, wx >> 1, wy) < 0.04 ? 0.2 : 0.55);
		return wet;
	}
	return c;
}

const PAVERS = ['#d3c9b6', '#cbc1ad', '#d9d0be'].map(rgb);

/** Paving stones, 8 voxels square in running bond. */
function paver(d: Dress, wx: number, wy: number): Rgb {
	const row = Math.floor(wy / 8);
	const sx = wx + (row % 2 ? 4 : 0);
	const col = Math.floor(sx / 8);
	let f = 0.96 + lattice(d.seed + 5, wx, wy) * 0.06;
	if (mod(sx, 8) === 0 || mod(wy, 8) === 0) f *= 0.84;
	const c = PAVERS[Math.floor(lattice(d.seed + 4, col, row) * PAVERS.length)];
	return weathered(d, [c[0] * f, c[1] * f, c[2] * f], wx, wy);
}

/** Which yard cells are paved: 1 the apron around the walls, 2 the front path. */
function paving(world: Site, inBuilding: (x: number, y: number) => boolean, street: number) {
	const w = world.width + 2 * YARD;
	const h = world.height + 2 * YARD;
	const out = new Uint8Array(w * h);
	for (let y = -YARD; y < world.height + YARD; y++)
		for (let x = -YARD; x < world.width + YARD; x++) {
			if (inBuilding(x, y)) continue;
			let near = false;
			for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = inBuilding(x + dx, y + dy);
			if (near) out[(y + YARD) * w + x + YARD] = 1;
		}
	const e = world.entrance;
	for (let y = e.y; y < street; y++)
		for (let x = e.x; x < e.x + e.w; x++) if (!inBuilding(x, y)) out[(y + YARD) * w + x + YARD] = 2;
	return out;
}

function paintYard(world: Site, d: Dress, paved: Uint8Array) {
	const tilesW = world.width + 2 * YARD;
	const tilesH = world.height + 2 * YARD;
	const canvas = document.createElement('canvas');
	canvas.width = tilesW * PX;
	canvas.height = tilesH * PX;
	const ctx = canvas.getContext('2d')!;
	const data = ctx.createImageData(canvas.width, canvas.height);
	for (let py = 0; py < canvas.height; py++)
		for (let px = 0; px < canvas.width; px++) {
			const wx = px - YARD * PX;
			const wy = py - YARD * PX;
			const kind = paved[Math.floor(py / PX) * tilesW + Math.floor(px / PX)];
			if (!kind) {
				// Grass right at the paving's edge sits in its shadow.
				const edge = (dx: number, dy: number) => {
					const cx = Math.floor((px + dx) / PX);
					const cy = Math.floor((py + dy) / PX);
					return cx >= 0 && cy >= 0 && cx < tilesW && cy < tilesH && paved[cy * tilesW + cx] > 0;
				};
				put(data, px, py, grass(d, wx, wy), edge(-1, 0) || edge(1, 0) || edge(0, -1) || edge(0, 1) ? 0.86 : 1);
			} else put(data, px, py, paver(d, wx, wy));
		}
	ctx.putImageData(data, 0, 0);
	return canvas;
}

function paintLawn(d: Dress) {
	const size = PERIOD * PX;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	const data = ctx.createImageData(size, size);
	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(data, x, y, grass(d, x, y));
	ctx.putImageData(data, 0, 0);
	return canvas;
}

const ASPHALT = ['#6c6878', '#676373', '#716d7c'].map(rgb);
const KERB = rgb('#e2dbcc');
const LINE = rgb('#f2e6c8');

/** A stretch of street, PERIOD tiles long: sidewalk, kerb, road with a dashed line, kerb, sidewalk. */
function paintStreet(d: Dress) {
	const canvas = document.createElement('canvas');
	canvas.width = PERIOD * PX;
	canvas.height = STREET_ROWS * PX;
	const ctx = canvas.getContext('2d')!;
	const data = ctx.createImageData(canvas.width, canvas.height);
	const roadTop = PX;
	const roadBottom = (STREET_ROWS - 1) * PX;
	const middle = (roadTop + roadBottom) / 2;
	for (let y = 0; y < canvas.height; y++)
		for (let x = 0; x < canvas.width; x++) {
			if (y < roadTop || y >= roadBottom) {
				put(data, x, y, paver(d, x, y));
				continue;
			}
			if (y === roadTop || y === roadBottom - 1) {
				put(data, x, y, weathered(d, KERB, x, y), y === roadTop ? 1 : 0.9);
				continue;
			}
			if (y === roadTop + 1) {
				// The kerb's shadow on the road.
				put(data, x, y, weathered(d, ASPHALT[0], x, y), 0.8);
				continue;
			}
			const lane = (y === middle - 1 || y === middle) && mod(x, 32) < 16;
			let c = lane ? LINE : ASPHALT[Math.floor(lattice(d.seed + 7, x >> 1, y >> 1) * ASPHALT.length)];
			if (!lane && lattice(d.seed + 8, x, y) < 0.04) c = [c[0] * 0.88, c[1] * 0.88, c[2] * 0.88];
			// Snow piles up along the kerbs and leaves the wheel tracks dark.
			if (d.outside === 'snow') {
				const fromKerb = Math.min(y - roadTop, roadBottom - 1 - y);
				put(data, x, y, mixRgb(c, SNOW, fromKerb < 6 ? 0.75 : 0.2 + fbm(d.seed + 22, x / 12, y / 12) * 0.3));
			} else put(data, x, y, weathered(d, c, x, y));
		}
	ctx.putImageData(data, 0, 0);
	return canvas;
}

/** A flat plane on the ground with UVs in world tiles over `scale` (for repeating textures). */
function groundPlane(x0: number, z0: number, w: number, h: number, scale: [number, number], offset: [number, number] = [0, 0]) {
	const g = new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2);
	const pos = g.getAttribute('position');
	const uv = g.getAttribute('uv');
	for (let i = 0; i < uv.count; i++) {
		const x = pos.getX(i) + x0 + w / 2;
		const z = pos.getZ(i) + z0 + h / 2;
		uv.setXY(i, (x - offset[0]) / scale[0], 1 - (z - offset[1]) / scale[1]);
	}
	g.translate(x0 + w / 2, 0, z0 + h / 2);
	return g;
}

// ---------------------------------------------------------------------------------------------
// Voxel props

type Box = { x: number; y: number; z: number; w: number; h: number; d: number; color: string };

const LEAVES = ['#6aa35a', '#5e9a55', '#79b062', '#71a85c'];
const NEEDLES = ['#3f7d5c', '#468763', '#386f54'];
const BARK = ['#7a5236', '#6b4630'];
const IRON = '#3a3f55';
const WOOD = '#c98f4e';

type Props = { boxes: Box[]; lamps: { x: number; z: number }[] };

function outdoorProps(world: Site, inBuilding: (x: number, y: number) => boolean, paved: Uint8Array, street: number, snow: boolean): Props {
	const rng = rngFor(world.seed, 'grounds');
	const boxes: Box[] = [];
	const lamps: { x: number; z: number }[] = [];
	const tilesW = world.width + 2 * YARD;
	const isPaved = (x: number, y: number) => {
		const cx = Math.floor(x) + YARD;
		const cy = Math.floor(y) + YARD;
		return cx >= 0 && cy >= 0 && cx < tilesW && cy < world.height + 2 * YARD && paved[cy * tilesW + cx] > 0;
	};
	const clearance = (x: number, z: number) => {
		let best = Infinity;
		for (const r of world.footprint) {
			const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
			const dz = Math.max(r.y - z, 0, z - (r.y + r.h));
			best = Math.min(best, Math.hypot(dx, dz));
		}
		return best;
	};
	const add = (b: Box, capped = false) => {
		const box = { ...b, x: snap(b.x), y: snap(b.y), z: snap(b.z), w: snap(b.w), h: snap(b.h), d: snap(b.d) };
		boxes.push(box);
		if (capped && snow) boxes.push({ ...box, y: box.y + box.h - 0.0625, h: 0.125, w: box.w + 0.0625, d: box.d + 0.0625, color: '#f4f7fb' });
	};

	// Trees on a jittered grid, never near the walls, the paving or each other.
	const trees: { x: number; z: number }[] = [];
	const CELL = 3.2;
	for (let gz = -WOODS; gz < street - 1; gz += CELL)
		for (let gx = -WOODS; gx < world.width + WOODS; gx += CELL) {
			const x = gx + rng() * CELL;
			const z = gz + rng() * CELL;
			if (rng() < 0.4 || z > street - 1.5) continue;
			if (clearance(x, z) < TREE_CLEARANCE || isPaved(x, z)) continue;
			if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.4)) continue;
			trees.push({ x, z });
			tree(add, x, z, rng);
		}

	// Bushes hugging the apron and lining the verge.
	for (let y = -2; y < street; y++)
		for (let x = -2; x < world.width + 2; x++) {
			if (inBuilding(x, y) || isPaved(x, y)) continue;
			const verge = y === street - 1;
			const nearApron = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => isPaved(x + dx, y + dy)));
			const chance = verge ? 0.28 : nearApron ? 0.16 : 0;
			if (lattice(world.seed + 31, x, y) >= chance) continue;
			bush(add, x + 0.5, y + 0.5, rng);
		}

	// Street lamps along the near sidewalk, benches along the far one.
	const e = world.entrance;
	for (let x = -YARD - 6; x < world.width + YARD + 6; x += 7) {
		const lx = x + 0.5;
		if (lx > e.x - 1 && lx < e.x + e.w + 1) continue;
		lamp(add, lx, street + 0.25);
		lamps.push({ x: lx, z: street + 0.75 });
	}
	for (let x = -YARD + 2; x < world.width + YARD; x += 11) bench(add, x + 1 + Math.floor(rng() * 4), street + STREET_ROWS - 0.5);
	return { boxes, lamps };
}

type Add = (b: Box, capped?: boolean) => void;

function tree(add: Add, x: number, z: number, rng: Rng) {
	const s = 0.85 + rng() * 0.35;
	const bark = BARK[Math.floor(rng() * BARK.length)];
	if (rng() < 0.35) {
		// A pine: stacked tiers shrinking to a point.
		const green = NEEDLES[Math.floor(rng() * NEEDLES.length)];
		add({ x, y: 0, z, w: 0.25, h: 0.7 * s, d: 0.25, color: bark });
		let y = 0.5 * s;
		for (const [size, h] of [
			[1.5, 0.6],
			[1.1, 0.55],
			[0.7, 0.5],
			[0.3, 0.45],
		]) {
			add({ x, y, z, w: size * s, h: h * s, d: size * s, color: green }, true);
			y += h * s * 0.85;
		}
		return;
	}
	const green = LEAVES[Math.floor(rng() * LEAVES.length)];
	const lighter = LEAVES[(LEAVES.indexOf(green) + 2) % LEAVES.length];
	add({ x, y: 0, z, w: 0.3, h: 1.1 * s, d: 0.3, color: bark });
	add({ x, y: 0.9 * s, z, w: 1.6 * s, h: 1.0 * s, d: 1.6 * s, color: green }, true);
	add({ x: x + (rng() - 0.5) * 0.3, y: 1.9 * s, z: z + (rng() - 0.5) * 0.3, w: 1.0 * s, h: 0.5 * s, d: 1.0 * s, color: lighter }, true);
	const side = rng() < 0.5 ? -1 : 1;
	add({ x: x + side * 0.7 * s, y: 1.1 * s, z: z + (rng() - 0.5) * 0.6, w: 0.7 * s, h: 0.6 * s, d: 0.7 * s, color: lighter }, true);
}

function bush(add: Add, x: number, z: number, rng: Rng) {
	const s = 0.75 + rng() * 0.35;
	const green = LEAVES[Math.floor(rng() * LEAVES.length)];
	add({ x, y: 0, z, w: 0.75 * s, h: 0.45 * s, d: 0.75 * s, color: green }, true);
	add({ x: x + (rng() - 0.5) * 0.2, y: 0.4 * s, z: z + (rng() - 0.5) * 0.2, w: 0.45 * s, h: 0.2 * s, d: 0.45 * s, color: green }, true);
	if (rng() < 0.4) {
		// In flower.
		const bloom = ['#e8836b', '#f2c14b', '#b4a2d2', '#f4efe6'][Math.floor(rng() * 4)];
		for (const [dx, dz] of [
			[0.22, 0.1],
			[-0.18, 0.2],
			[0.05, -0.22],
		])
			add({ x: x + dx * s, y: 0.4 * s, z: z + dz * s, w: 0.125, h: 0.125, d: 0.125, color: bloom });
	}
}

function lamp(add: Add, x: number, z: number) {
	add({ x, y: 0, z, w: 0.25, h: 0.125, d: 0.25, color: IRON });
	add({ x, y: 0, z, w: 0.125, h: 2.3, d: 0.125, color: IRON });
	add({ x, y: 2.25, z: z + 0.25, w: 0.125, h: 0.0625, d: 0.5, color: IRON });
	add({ x, y: 2.3, z: z + 0.5, w: 0.375, h: 0.0625, d: 0.375, color: IRON });
}

function bench(add: Add, x: number, z: number) {
	for (const dx of [-0.5, 0.5]) add({ x: x + dx, y: 0, z, w: 0.0625 * 2, h: 0.35, d: 0.375, color: IRON });
	add({ x, y: 0.35, z, w: 1.4, h: 0.0625 * 1.5, d: 0.4375, color: WOOD }, true);
	add({ x, y: 0.45, z: z + 0.2, w: 1.4, h: 0.375, d: 0.0625 * 1.5, color: WOOD });
}

// ---------------------------------------------------------------------------------------------

const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const p = new THREE.Vector3();
const s = new THREE.Vector3();
const noRaycast = () => null;

function footprintTest(footprint: Rect[]) {
	return (x: number, y: number) => footprint.some((r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h);
}

export function Grounds({ world, lighting }: { world: CompiledWorld; lighting: Lighting }) {
	const outside = world.meta.outside;
	// Streamed worlds bring new arrays for the same outline; only a new outline rebuilds.
	const key = JSON.stringify([world.seed, world.width, world.height, world.footprint, world.entrance]);
	const layout = useMemo(() => {
		const [seed, width, height, footprint, entrance] = JSON.parse(key) as [number, number, number, Rect[], Site['entrance']];
		const site: Site = { seed, width, height, footprint, entrance };
		const inBuilding = footprintTest(footprint);
		const street = height + STREET_GAP;
		return { site, inBuilding, street, paved: paving(site, inBuilding, street) };
	}, [key]);

	const surfaces = useMemo(() => {
		const dress: Dress = { seed: layout.site.seed, ground: rgb(lighting.ground), outside };
		const yard = pixelTexture(paintYard(layout.site, dress, layout.paved), false);
		const lawn = pixelTexture(paintLawn(dress), true);
		const street = pixelTexture(paintStreet(dress), true);
		street.wrapT = THREE.ClampToEdgeWrapping;
		return {
			yard: new THREE.MeshLambertMaterial({ map: yard }),
			lawn: new THREE.MeshLambertMaterial({ map: lawn }),
			street: new THREE.MeshLambertMaterial({ map: street }),
		};
	}, [layout, lighting.ground, outside]);
	useEffect(
		() => () => {
			for (const m of Object.values(surfaces)) {
				m.map?.dispose();
				m.dispose();
			}
		},
		[surfaces],
	);

	const geometry = useMemo(() => {
		const { width: W, height: H } = layout.site;
		return {
			lawn: groundPlane(W / 2 - 200, H / 2 - 200, 400, 400, [PERIOD, PERIOD]),
			yard: groundPlane(-YARD, -YARD, W + 2 * YARD, H + 2 * YARD, [W + 2 * YARD, H + 2 * YARD], [-YARD, -YARD]),
			street: groundPlane(W / 2 - 200, layout.street, 400, STREET_ROWS, [PERIOD, STREET_ROWS], [0, layout.street]),
		};
	}, [layout]);
	useEffect(() => () => Object.values(geometry).forEach((g) => g.dispose()), [geometry]);

	const props = useMemo(
		() => outdoorProps(layout.site, layout.inBuilding, layout.paved, layout.street, outside === 'snow'),
		[layout, outside],
	);
	// After dark the lamps glow and pool warm light on the pavement.
	const lit = lighting.indoor >= 0.5;
	const glow = useMemo(
		() =>
			lit
				? new THREE.MeshBasicMaterial({ color: '#ffe2a0', toneMapped: false })
				: new THREE.MeshLambertMaterial({ color: '#f4efe6' }),
		[lit],
	);
	const pool = useMemo(
		() =>
			new THREE.MeshBasicMaterial({
				map: radialTexture(),
				color: '#ffbe6e',
				transparent: true,
				opacity: lighting.indoor >= 1 ? 0.45 : 0.28,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
			}),
		[lighting.indoor],
	);
	const voxels = useRef<THREE.InstancedMesh>(null);
	const heads = useRef<THREE.InstancedMesh>(null);
	useLayoutEffect(() => {
		const mesh = voxels.current;
		if (mesh) {
			const color = new THREE.Color();
			props.boxes.forEach((b, i) => {
				m4.compose(p.set(b.x, b.y, b.z), q.identity(), s.set(b.w, b.h, b.d));
				mesh.setMatrixAt(i, m4);
				mesh.setColorAt(i, color.set(b.color));
			});
			mesh.instanceMatrix.needsUpdate = true;
			if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
		}
		const lamps = heads.current;
		if (lamps) {
			props.lamps.forEach((l, i) => {
				m4.compose(p.set(l.x, 2.22, l.z), q.identity(), s.set(0.25, 0.09, 0.25));
				lamps.setMatrixAt(i, m4);
			});
			lamps.instanceMatrix.needsUpdate = true;
		}
	}, [props, glow]);

	useEffect(() => () => glow.dispose(), [glow]);
	useEffect(() => () => pool.dispose(), [pool]);

	return (
		<group>
			<mesh geometry={geometry.lawn} material={surfaces.lawn} position-y={LAWN_Y} receiveShadow raycast={noRaycast} />
			<mesh geometry={geometry.yard} material={surfaces.yard} position-y={YARD_Y} receiveShadow raycast={noRaycast} />
			<mesh geometry={geometry.street} material={surfaces.street} position-y={STREET_Y} receiveShadow raycast={noRaycast} />
			<group position-y={STREET_Y}>
				{props.boxes.length ? (
					<instancedMesh
						key={props.boxes.length}
						ref={voxels}
						args={[unitBox, materials().solid, props.boxes.length]}
						castShadow
						receiveShadow
						raycast={noRaycast}
					/>
				) : null}
				{props.lamps.length ? (
					<instancedMesh key={`lamps-${props.lamps.length}`} ref={heads} args={[unitBox, glow, props.lamps.length]} raycast={noRaycast} />
				) : null}
				{lit
					? props.lamps.map((l, i) => (
							<mesh key={i} position={[l.x, 0.01, l.z]} rotation-x={-Math.PI / 2} material={pool} renderOrder={2} raycast={noRaycast}>
								<planeGeometry args={[2.8, 2.8]} />
							</mesh>
						))
					: null}
			</group>
		</group>
	);
}
