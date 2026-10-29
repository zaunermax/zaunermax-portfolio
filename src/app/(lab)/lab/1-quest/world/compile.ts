import {
	biomes,
	buildingKinds,
	facings,
	landmarkIds,
	LIMITS,
	npcKinds,
	propKinds,
	roofColors,
	timesOfDay,
	treeSpecies,
	weathers,
	WORLD_HEIGHT,
	WORLD_WIDTH,
	type LandmarkId,
	type WorldOp,
} from './schema';

/*
 * The world compiler: ops in, a fully resolved world out.
 *
 * Pure and deterministic. Scatter (trees, rocks, prop copies) uses an RNG seeded from each op's own
 * content, so a streamed world grows without reshuffling what is already on screen and the same ops
 * always give the same world. Ops are applied in passes by kind rather than in list order, so the
 * generator may emit them in any order.
 *
 * Coordinates: cell (x, y) covers [x, x+1] × [y, y+1]; y grows southwards. Entity positions are
 * floats in the same space (a cell centre is x + 0.5). The renderer maps x → X and y → Z.
 */

export const GRID_W = WORLD_WIDTH;
export const GRID_H = WORLD_HEIGHT;
/** World units per hill height step. */
export const HEIGHT_UNIT = 0.7;
export const WATER_LEVEL = -0.35;
export const DECK_HEIGHT = WATER_LEVEL + 0.45;
/** Max height difference to a land neighbour that is still walkable. */
const STEEP = 0.95;
/** Landmarks keep at least this many cells between their centres. */
export const LANDMARK_SPACING = 5;

export type Biome = (typeof biomes)[number];
export type TimeOfDay = (typeof timesOfDay)[number];
export type Weather = (typeof weathers)[number];
export type Facing = (typeof facings)[number];
export type BuildingKind = (typeof buildingKinds)[number];
export type RoofColor = (typeof roofColors)[number];
export type TreeSpecies = (typeof treeSpecies)[number];
export type PropKind = (typeof propKinds)[number];
export type NpcKind = (typeof npcKinds)[number];
export type RockSize = 'pebbles' | 'boulders' | 'cliff';
export type GroundKind =
	'grass' | 'lush' | 'dry' | 'dirt' | 'cobble' | 'plaza' | 'sand' | 'water' | 'rock';

export type Cell = { x: number; y: number };

export type WorldMeta = {
	name: string;
	tagline: string;
	biome: Biome;
	timeOfDay: TimeOfDay;
	weather: Weather;
};

type EntityBase = {
	/** Stable across recompiles of a growing op list: derived from op index and op content. */
	id: string;
	opIndex: number;
	/** Centre in cell space (floats). */
	x: number;
	y: number;
	/** Radians around the vertical axis; 0 faces south (+y). */
	rotation: number;
};

export type LandmarkEntity = EntityBase & {
	type: 'landmark';
	landmark: LandmarkId;
	name: string;
	facing: Facing;
	cell: Cell;
	/** Where the visitor stands to interact. Always walkable and reachable from the spawn. */
	interact: Cell;
	/** True when the compiler supplied a landmark the ops did not contain. */
	supplied: boolean;
};

export type BuildingEntity = EntityBase & {
	type: 'building';
	kind: BuildingKind;
	roof: RoofColor;
	facing: Facing;
	cell: Cell;
	/** Docks: number of plank cells reaching over the water. */
	length: number;
};

export type PropEntity = EntityBase & {
	type: 'prop';
	kind: PropKind;
	scale: number;
	variant: number;
};

export type NpcEntity = EntityBase & {
	type: 'npc';
	kind: NpcKind;
	name: string;
	line: string;
	wanders: boolean;
	cell: Cell;
	/** Cells an NPC may stroll from its home cell. */
	radius: number;
	variant: number;
};

export type TreeEntity = EntityBase & {
	type: 'tree';
	species: TreeSpecies;
	scale: number;
	variant: number;
};

export type RockEntity = EntityBase & {
	type: 'rock';
	size: RockSize;
	scale: number;
	variant: number;
};

/** A walkable plank cell over water: a bridge (paths) or a dock. */
export type DeckCell = {
	id: string;
	x: number;
	y: number;
	axis: 'x' | 'y';
	height: number;
	kind: 'bridge' | 'dock';
};

export type CompiledWorld = {
	width: number;
	height: number;
	/** Seed of the base terrain (from the meta op). */
	seed: number;
	meta: WorldMeta;
	hasMeta: boolean;
	partial: boolean;
	opCount: number;
	/** Per cell, index y * width + x. */
	ground: GroundKind[];
	/** Terrain height at each cell centre. */
	heights: Float32Array;
	/** 1 when click-to-move and NPCs may use the cell (trees block). */
	walkable: Uint8Array;
	/** 1 when free movement may enter the cell (trees only collide by trunk). */
	passable: Uint8Array;
	/** Deck height over water, NaN where there is none. */
	deck: Float32Array;
	landmarks: LandmarkEntity[];
	landmark: Partial<Record<LandmarkId, LandmarkEntity>>;
	buildings: BuildingEntity[];
	props: PropEntity[];
	npcs: NpcEntity[];
	trees: TreeEntity[];
	rocks: RockEntity[];
	decks: DeckCell[];
	spawn: Cell & { facing: Facing };
};

export type CompileOptions = {
	/** Streaming: render what exists, never invent missing landmarks. */
	partial?: boolean;
};

// ---------------------------------------------------------------------------
// Small pure helpers

export const FACING_VECTORS: Record<Facing, Cell> = {
	north: { x: 0, y: -1 },
	east: { x: 1, y: 0 },
	south: { x: 0, y: 1 },
	west: { x: -1, y: 0 },
};

export const FACING_ROTATION: Record<Facing, number> = {
	south: 0,
	east: Math.PI / 2,
	north: Math.PI,
	west: -Math.PI / 2,
};

const OPPOSITE: Record<Facing, Facing> = {
	north: 'south',
	south: 'north',
	east: 'west',
	west: 'east',
};

export const DEFAULT_LANDMARK_NAMES: Record<LandmarkId, string> = {
	max: "Max's Camp",
	library: 'The Quill and Lantern',
	stage: 'The Speaking Stones',
	questboard: 'The Quest Board',
	worldforge: 'The World Forge',
};

const DEFAULT_LANDMARK_SPOTS: Record<LandmarkId, Cell & { facing: Facing }> = {
	max: { x: 20, y: 14, facing: 'south' },
	library: { x: 10, y: 7, facing: 'south' },
	stage: { x: 30, y: 7, facing: 'south' },
	questboard: { x: 29, y: 20, facing: 'west' },
	worldforge: { x: 11, y: 20, facing: 'east' },
};

const DEFAULT_META: WorldMeta = {
	name: 'The Nameless Vale',
	tagline: 'A quiet valley, waiting for its story.',
	biome: 'meadow',
	timeOfDay: 'day',
	weather: 'clear',
};

export function hashString(input: string, seed = 2166136261) {
	let h = seed >>> 0;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	h ^= h >>> 15;
	h = Math.imul(h, 2246822507);
	h ^= h >>> 13;
	return h >>> 0;
}

export function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
const idx = (x: number, y: number) => y * GRID_W + x;

function latticeNoise(seed: number, x: number, y: number) {
	return hashString(`${x},${y}`, seed) / 4294967296;
}

/** Smooth value noise in [0, 1]. */
export function valueNoise(seed: number, x: number, y: number) {
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const tx = smooth(x - x0);
	const ty = smooth(y - y0);
	const a = latticeNoise(seed, x0, y0);
	const b = latticeNoise(seed, x0 + 1, y0);
	const c = latticeNoise(seed, x0, y0 + 1);
	const d = latticeNoise(seed, x0 + 1, y0 + 1);
	return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function fbm(seed: number, x: number, y: number) {
	return valueNoise(seed, x, y) * 0.65 + valueNoise(seed + 17, x * 2.1, y * 2.1) * 0.35;
}

/** Offsets sorted by distance (then angle), for "nearest valid cell" searches. */
const SPIRAL: Cell[] = (() => {
	const out: (Cell & { d: number; a: number })[] = [];
	const r = Math.max(GRID_W, GRID_H);
	for (let dy = -r; dy <= r; dy++)
		for (let dx = -r; dx <= r; dx++)
			out.push({ x: dx, y: dy, d: dx * dx + dy * dy, a: Math.atan2(dy, dx) });
	out.sort((p, q) => p.d - q.d || p.a - q.a);
	return out.map(({ x, y }) => ({ x, y }));
})();

function spiralWithin(radius: number) {
	const max = radius * radius;
	let end = SPIRAL.length;
	for (let i = 0; i < SPIRAL.length; i++) {
		const { x, y } = SPIRAL[i];
		if (x * x + y * y > max) {
			end = i;
			break;
		}
	}
	return SPIRAL.slice(0, end);
}
const SPIRAL_10 = spiralWithin(10);
const SPIRAL_4 = spiralWithin(4);

// ---------------------------------------------------------------------------
// Defensive normalization: the server sanitizes, but the compiler never trusts its input.

type Point = Cell;

type N<T extends WorldOp['type']> = Extract<WorldOp, { type: T }> & {
	index: number;
	seed: number;
	key: string;
};
type NormOp = { [K in WorldOp['type']]: N<K> }[WorldOp['type']];

const isObj = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

function int(v: unknown, lo: number, hi: number, fallback: number) {
	const n =
		typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
	if (!Number.isFinite(n)) return fallback;
	return clamp(Math.round(n), lo, hi);
}

function oneOf<T extends string>(v: unknown, list: readonly T[], fallback: T): T {
	return typeof v === 'string' && (list as readonly string[]).includes(v)
		? (v as T)
		: fallback;
}

function text(v: unknown, max: number, fallback = '') {
	if (typeof v !== 'string') return fallback;
	const t = v.replace(/\s+/g, ' ').trim();
	if (!t) return fallback;
	return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function points(v: unknown): Point[] {
	if (!Array.isArray(v)) return [];
	const out: Point[] = [];
	for (const p of v) {
		if (!isObj(p)) continue;
		const x = int(p.x, 0, GRID_W - 1, NaN);
		const y = int(p.y, 0, GRID_H - 1, NaN);
		if (Number.isNaN(x) || Number.isNaN(y)) continue;
		out.push({ x, y });
		if (out.length >= LIMITS.pointsPerLine) break;
	}
	return out;
}

function opKey(raw: unknown, index: number) {
	try {
		return JSON.stringify(raw) ?? String(index);
	} catch {
		return String(index);
	}
}

function normalize(input: unknown): NormOp[] {
	if (!Array.isArray(input)) return [];
	const out: NormOp[] = [];
	const counts = { npc: 0, building: 0, forest: 0, props: 0 };
	const seenLandmarks = new Set<string>();
	let seenMeta = false;
	const X = (v: unknown) => int(v, 0, GRID_W - 1, Math.floor(GRID_W / 2));
	const Y = (v: unknown) => int(v, 0, GRID_H - 1, Math.floor(GRID_H / 2));

	for (let index = 0; index < input.length && index < LIMITS.ops; index++) {
		const raw = input[index];
		if (!isObj(raw)) continue;
		const key = opKey(raw, index);
		const seed = hashString(key, 2166136261 ^ index);
		const story = text(raw.story, 90);
		const base = { index, seed, key, story };
		switch (raw.type) {
			case 'meta':
				if (seenMeta) break;
				seenMeta = true;
				out.push({
					...base,
					type: 'meta',
					name: text(raw.name, 32, DEFAULT_META.name),
					tagline: text(raw.tagline, 110, ''),
					biome: oneOf(raw.biome, biomes, 'meadow'),
					timeOfDay: oneOf(raw.timeOfDay, timesOfDay, 'day'),
					weather: oneOf(raw.weather, weathers, 'clear'),
				});
				break;
			case 'hill':
				out.push({
					...base,
					type: 'hill',
					x: X(raw.x),
					y: Y(raw.y),
					radius: int(raw.radius, 2, 8, 4),
					height: int(raw.height, 1, 4, 2),
				});
				break;
			case 'lake':
				out.push({
					...base,
					type: 'lake',
					x: X(raw.x),
					y: Y(raw.y),
					radiusX: int(raw.radiusX, 2, 8, 3),
					radiusY: int(raw.radiusY, 2, 6, 3),
				});
				break;
			case 'river': {
				const pts = points(raw.points);
				if (pts.length < 2) break;
				out.push({ ...base, type: 'river', points: pts, width: int(raw.width, 1, 3, 1) });
				break;
			}
			case 'path': {
				const pts = points(raw.points);
				if (pts.length < 2) break;
				out.push({
					...base,
					type: 'path',
					points: pts,
					style: oneOf(raw.style, ['dirt', 'cobble'] as const, 'dirt'),
				});
				break;
			}
			case 'forest':
				if (counts.forest >= LIMITS.forests) break;
				counts.forest++;
				out.push({
					...base,
					type: 'forest',
					x: X(raw.x),
					y: Y(raw.y),
					radius: int(raw.radius, 2, 7, 3),
					density: oneOf(raw.density, ['sparse', 'normal', 'dense'] as const, 'normal'),
					species: oneOf(raw.species, treeSpecies, 'oak'),
				});
				break;
			case 'rocks':
				out.push({
					...base,
					type: 'rocks',
					x: X(raw.x),
					y: Y(raw.y),
					radius: int(raw.radius, 1, 4, 2),
					size: oneOf(raw.size, ['pebbles', 'boulders', 'cliff'] as const, 'boulders'),
				});
				break;
			case 'landmark': {
				const id = oneOf(raw.id, landmarkIds, 'max');
				if (typeof raw.id !== 'string' || seenLandmarks.has(id)) break;
				if (!(landmarkIds as readonly string[]).includes(raw.id)) break;
				seenLandmarks.add(id);
				out.push({
					...base,
					type: 'landmark',
					id,
					x: X(raw.x),
					y: Y(raw.y),
					facing: oneOf(raw.facing, facings, 'south'),
					name: text(raw.name, 32, DEFAULT_LANDMARK_NAMES[id]),
				});
				break;
			}
			case 'building':
				if (counts.building >= LIMITS.buildings) break;
				counts.building++;
				out.push({
					...base,
					type: 'building',
					kind: oneOf(raw.kind, buildingKinds, 'cottage'),
					x: X(raw.x),
					y: Y(raw.y),
					facing: oneOf(raw.facing, facings, 'south'),
					roof: oneOf(raw.roof, roofColors, 'red'),
				});
				break;
			case 'props':
				if (counts.props >= LIMITS.props) break;
				counts.props++;
				out.push({
					...base,
					type: 'props',
					kind: oneOf(raw.kind, propKinds, 'crate'),
					x: X(raw.x),
					y: Y(raw.y),
					count: int(raw.count, 1, 8, 1),
				});
				break;
			case 'npc':
				if (counts.npc >= LIMITS.npcs) break;
				counts.npc++;
				out.push({
					...base,
					type: 'npc',
					kind: oneOf(raw.kind, npcKinds, 'farmer'),
					x: X(raw.x),
					y: Y(raw.y),
					name: text(raw.name, 24, 'Villager'),
					line: text(raw.line, 120, 'Lovely weather, isn’t it?'),
					wanders: raw.wanders === true,
				});
				break;
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Footprints

type Footprint = {
	/** Cells that become solid (half-size; 0 means 1×1). */
	block: number;
	/** Cells kept clear of other placements around the centre. */
	reserve: number;
};

const LANDMARK_FOOTPRINT: Record<LandmarkId, Footprint> = {
	max: { block: 1, reserve: 2 },
	library: { block: 1, reserve: 2 },
	stage: { block: 1, reserve: 2 },
	questboard: { block: 0, reserve: 2 },
	worldforge: { block: 0, reserve: 2 },
};

const BUILDING_FOOTPRINT: Record<BuildingKind, Footprint> = {
	cottage: { block: 1, reserve: 1 },
	farmhouse: { block: 1, reserve: 1 },
	windmill: { block: 1, reserve: 1 },
	watchtower: { block: 1, reserve: 1 },
	barn: { block: 1, reserve: 1 },
	tent: { block: 0, reserve: 1 },
	ruin: { block: 1, reserve: 1 },
	well: { block: 0, reserve: 1 },
	smithy: { block: 1, reserve: 1 },
	tavern: { block: 1, reserve: 1 },
	chapel: { block: 1, reserve: 1 },
	dock: { block: 0, reserve: 0 },
};

const LANDMARK_GROUND: Record<LandmarkId, GroundKind> = {
	max: 'dirt',
	library: 'plaza',
	stage: 'plaza',
	questboard: 'plaza',
	worldforge: 'plaza',
};

// ---------------------------------------------------------------------------
// The compiler

type Grids = {
	heights: Float32Array;
	ground: GroundKind[];
	water: Uint8Array;
	path: Uint8Array;
	deck: Float32Array;
	deckAxis: ('x' | 'y')[];
	deckKind: ('bridge' | 'dock')[];
	deckId: string[];
	/** 1 for landmark reservations, 2 for building reservations. */
	reserved: Uint8Array;
	blocked: Uint8Array;
	interact: Uint8Array;
	rock: Uint8Array;
	tree: Uint8Array;
	steep: Uint8Array;
	forced: Uint8Array;
};

function makeGrids(): Grids {
	const n = GRID_W * GRID_H;
	return {
		heights: new Float32Array(n),
		ground: new Array<GroundKind>(n).fill('grass'),
		water: new Uint8Array(n),
		path: new Uint8Array(n),
		deck: new Float32Array(n).fill(Number.NaN),
		deckAxis: new Array<'x' | 'y'>(n).fill('x'),
		deckKind: new Array<'bridge' | 'dock'>(n).fill('bridge'),
		deckId: new Array<string>(n).fill(''),
		reserved: new Uint8Array(n),
		blocked: new Uint8Array(n),
		interact: new Uint8Array(n),
		rock: new Uint8Array(n),
		tree: new Uint8Array(n),
		steep: new Uint8Array(n),
		forced: new Uint8Array(n),
	};
}

const BASE_RELIEF: Record<Biome, { amp: number; freq: number; offset: number }> = {
	meadow: { amp: 0.45, freq: 1 / 7, offset: 0.05 },
	autumn: { amp: 0.5, freq: 1 / 6.5, offset: 0.05 },
	winter: { amp: 0.6, freq: 1 / 7, offset: 0.08 },
	desert: { amp: 0.8, freq: 1 / 5.5, offset: 0.05 },
	swamp: { amp: 0.18, freq: 1 / 6, offset: 0 },
	highlands: { amp: 1.1, freq: 1 / 8.5, offset: 0.15 },
};

function segmentDistance(px: number, py: number, a: Point, b: Point) {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len = dx * dx + dy * dy;
	const t = len ? clamp(((px - a.x) * dx + (py - a.y) * dy) / len, 0, 1) : 0;
	const qx = a.x + dx * t;
	const qy = a.y + dy * t;
	return {
		d: Math.hypot(px - qx, py - qy),
		axis: Math.abs(dx) >= Math.abs(dy) ? ('x' as const) : ('y' as const),
	};
}

function polylineDistance(px: number, py: number, pts: Point[]) {
	let best = { d: Infinity, axis: 'x' as 'x' | 'y' };
	for (let i = 0; i < pts.length - 1; i++) {
		const r = segmentDistance(px, py, pts[i], pts[i + 1]);
		if (r.d < best.d) best = r;
	}
	return best;
}

const NEIGHBOURS_4: Cell[] = [
	{ x: 1, y: 0 },
	{ x: -1, y: 0 },
	{ x: 0, y: 1 },
	{ x: 0, y: -1 },
];
const NEIGHBOURS_8: Cell[] = [
	...NEIGHBOURS_4,
	{ x: 1, y: 1 },
	{ x: 1, y: -1 },
	{ x: -1, y: 1 },
	{ x: -1, y: -1 },
];

function hasDeck(g: Grids, i: number) {
	return !Number.isNaN(g.deck[i]);
}

function computeSteep(g: Grids) {
	g.steep.fill(0);
	for (let y = 0; y < GRID_H; y++)
		for (let x = 0; x < GRID_W; x++) {
			const i = idx(x, y);
			if (g.water[i]) continue;
			let worst = 0;
			for (const n of NEIGHBOURS_4) {
				const nx = x + n.x;
				const ny = y + n.y;
				if (!inBounds(nx, ny)) continue;
				const j = idx(nx, ny);
				if (g.water[j] && !hasDeck(g, j)) continue;
				const hj = hasDeck(g, j) ? g.deck[j] : g.heights[j];
				worst = Math.max(worst, Math.abs(hj - g.heights[i]));
			}
			if (worst > STEEP) g.steep[i] = 1;
		}
}

function walkableAt(g: Grids, i: number, ignoreTrees = false) {
	if (g.water[i] && !hasDeck(g, i)) return false;
	if (g.blocked[i] || g.rock[i]) return false;
	if (g.steep[i] && !g.forced[i] && !hasDeck(g, i)) return false;
	if (!ignoreTrees && g.tree[i]) return false;
	return true;
}

/** BFS over 8 neighbours without corner cutting, the same moves findPath uses. */
function reachableFrom(walk: (i: number) => boolean, start: Cell) {
	const seen = new Uint8Array(GRID_W * GRID_H);
	if (!inBounds(start.x, start.y)) return seen;
	const queue: number[] = [idx(start.x, start.y)];
	seen[queue[0]] = 1;
	while (queue.length) {
		const i = queue.shift()!;
		const x = i % GRID_W;
		const y = (i - x) / GRID_W;
		for (const n of NEIGHBOURS_8) {
			const nx = x + n.x;
			const ny = y + n.y;
			if (!inBounds(nx, ny)) continue;
			const j = idx(nx, ny);
			if (seen[j] || !walk(j)) continue;
			if (n.x && n.y && (!walk(idx(x + n.x, y)) || !walk(idx(x, y + n.y)))) continue;
			seen[j] = 1;
			queue.push(j);
		}
	}
	return seen;
}

class MinHeap {
	private items: { i: number; f: number }[] = [];
	get size() {
		return this.items.length;
	}
	push(i: number, f: number) {
		const a = this.items;
		a.push({ i, f });
		let c = a.length - 1;
		while (c > 0) {
			const p = (c - 1) >> 1;
			if (a[p].f <= a[c].f) break;
			[a[p], a[c]] = [a[c], a[p]];
			c = p;
		}
	}
	pop() {
		const a = this.items;
		const top = a[0];
		const last = a.pop()!;
		if (a.length) {
			a[0] = last;
			let p = 0;
			for (;;) {
				const l = p * 2 + 1;
				const r = l + 1;
				let m = p;
				if (l < a.length && a[l].f < a[m].f) m = l;
				if (r < a.length && a[r].f < a[m].f) m = r;
				if (m === p) break;
				[a[p], a[m]] = [a[m], a[p]];
				p = m;
			}
		}
		return top.i;
	}
}

/**
 * A* over the grid. `cost(i)` returns the cost of entering cell i or Infinity when it is closed.
 * 4-way when `diagonal` is false; 8-way without corner cutting otherwise.
 */
function astar(
	start: Cell,
	goal: Cell,
	cost: (i: number) => number,
	diagonal: boolean,
): Cell[] | null {
	if (!inBounds(start.x, start.y) || !inBounds(goal.x, goal.y)) return null;
	const n = GRID_W * GRID_H;
	const g = new Float32Array(n).fill(Infinity);
	const from = new Int32Array(n).fill(-1);
	const closed = new Uint8Array(n);
	const s = idx(start.x, start.y);
	const t = idx(goal.x, goal.y);
	const h = (x: number, y: number) => {
		const dx = Math.abs(x - goal.x);
		const dy = Math.abs(y - goal.y);
		return diagonal ? Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy) : dx + dy;
	};
	const heap = new MinHeap();
	g[s] = 0;
	heap.push(s, h(start.x, start.y));
	const moves = diagonal ? NEIGHBOURS_8 : NEIGHBOURS_4;
	while (heap.size) {
		const i = heap.pop();
		if (i === t) break;
		if (closed[i]) continue;
		closed[i] = 1;
		const x = i % GRID_W;
		const y = (i - x) / GRID_W;
		for (const m of moves) {
			const nx = x + m.x;
			const ny = y + m.y;
			if (!inBounds(nx, ny)) continue;
			const j = idx(nx, ny);
			if (closed[j]) continue;
			const c = cost(j);
			if (!Number.isFinite(c)) continue;
			if (m.x && m.y) {
				if (
					!Number.isFinite(cost(idx(x + m.x, y))) ||
					!Number.isFinite(cost(idx(x, y + m.y)))
				)
					continue;
			}
			const step = (m.x && m.y ? Math.SQRT2 : 1) * c;
			const next = g[i] + step;
			if (next < g[j]) {
				g[j] = next;
				from[j] = i;
				heap.push(j, next + h(nx, ny));
			}
		}
	}
	if (s !== t && from[t] < 0) return null;
	const out: Cell[] = [];
	for (let i = t; i >= 0; i = i === s ? -1 : from[i]) {
		const x = i % GRID_W;
		out.push({ x, y: (i - x) / GRID_W });
	}
	return out.reverse();
}

export function compileWorld(
	ops: WorldOp[],
	options: CompileOptions = {},
): CompiledWorld {
	const partial = options.partial === true;
	const list = normalize(ops);
	const g = makeGrids();

	// --- meta and base terrain
	const metaOp = list.find((o): o is N<'meta'> => o.type === 'meta');
	const meta: WorldMeta = metaOp
		? {
				name: metaOp.name,
				tagline: metaOp.tagline,
				biome: metaOp.biome,
				timeOfDay: metaOp.timeOfDay,
				weather: metaOp.weather,
			}
		: { ...DEFAULT_META };
	const seed = hashString(`${meta.name}|${meta.biome}`);
	const relief = BASE_RELIEF[meta.biome];
	for (let y = 0; y < GRID_H; y++)
		for (let x = 0; x < GRID_W; x++) {
			const i = idx(x, y);
			const n = fbm(seed, x * relief.freq, y * relief.freq);
			g.heights[i] = relief.offset + (n - 0.5) * 2 * relief.amp;
			const v = valueNoise(seed + 101, x / 4.5, y / 4.5);
			g.ground[i] = v > 0.64 ? 'lush' : v < 0.3 ? 'dry' : 'grass';
		}

	const byType = <T extends NormOp['type']>(type: T) =>
		list.filter((o): o is Extract<NormOp, { type: T }> => o.type === type);

	// --- hills
	for (const hill of byType('hill')) {
		const r = hill.radius;
		const peak = hill.height * HEIGHT_UNIT;
		for (let y = hill.y - r; y <= hill.y + r; y++)
			for (let x = hill.x - r; x <= hill.x + r; x++) {
				if (!inBounds(x, y)) continue;
				const d = Math.hypot(x - hill.x, y - hill.y) / (r + 0.5);
				if (d >= 1) continue;
				g.heights[idx(x, y)] += peak * (0.5 + 0.5 * Math.cos(Math.PI * d));
			}
	}

	// --- lakes and rivers carve water
	for (const lake of byType('lake')) {
		const rx = lake.radiusX + 0.35;
		const ry = lake.radiusY + 0.35;
		for (let y = lake.y - lake.radiusY - 1; y <= lake.y + lake.radiusY + 1; y++)
			for (let x = lake.x - lake.radiusX - 1; x <= lake.x + lake.radiusX + 1; x++) {
				if (!inBounds(x, y)) continue;
				const wobble = (valueNoise(lake.seed, x / 2.2, y / 2.2) - 0.5) * 0.35;
				const e = Math.hypot((x - lake.x) / rx, (y - lake.y) / ry) + wobble;
				if (e >= 1) continue;
				const i = idx(x, y);
				g.water[i] = 1;
				g.ground[i] = 'water';
				g.heights[i] = Math.min(g.heights[i], WATER_LEVEL - 0.3 - 0.55 * (1 - e));
			}
	}
	for (const river of byType('river')) {
		const half = river.width / 2 + 0.3;
		for (let y = 0; y < GRID_H; y++)
			for (let x = 0; x < GRID_W; x++) {
				const { d } = polylineDistance(x, y, river.points);
				if (d > half) continue;
				const i = idx(x, y);
				g.water[i] = 1;
				g.ground[i] = 'water';
				g.heights[i] = Math.min(g.heights[i], WATER_LEVEL - 0.3 - 0.3 * (1 - d / half));
			}
	}

	// --- shores
	for (let y = 0; y < GRID_H; y++)
		for (let x = 0; x < GRID_W; x++) {
			const i = idx(x, y);
			if (g.water[i]) continue;
			let near = false;
			for (const n of NEIGHBOURS_8) {
				const nx = x + n.x;
				const ny = y + n.y;
				if (inBounds(nx, ny) && g.water[idx(nx, ny)]) near = true;
			}
			if (!near) continue;
			g.ground[i] = 'sand';
			g.heights[i] = lerp(g.heights[i], WATER_LEVEL + 0.2, 0.65);
		}

	// --- paths: paint, flatten, bridge
	const before = g.heights.slice();
	for (const path of byType('path')) {
		for (let y = 0; y < GRID_H; y++)
			for (let x = 0; x < GRID_W; x++) {
				const { d, axis } = polylineDistance(x, y, path.points);
				if (d > 0.72) continue;
				const i = idx(x, y);
				if (g.water[i]) {
					if (!hasDeck(g, i)) {
						g.deck[i] = DECK_HEIGHT;
						g.deckAxis[i] = axis;
						g.deckKind[i] = 'bridge';
						g.deckId[i] = `${path.index}-bridge-${x}-${y}`;
					}
					continue;
				}
				g.path[i] = path.style === 'cobble' ? 2 : 1;
				g.ground[i] = path.style === 'cobble' ? 'cobble' : 'dirt';
				let sum = 0;
				let count = 0;
				for (let dy = -1; dy <= 1; dy++)
					for (let dx = -1; dx <= 1; dx++) {
						const nx = x + dx;
						const ny = y + dy;
						if (!inBounds(nx, ny) || g.water[idx(nx, ny)]) continue;
						sum += before[idx(nx, ny)];
						count++;
					}
				if (count) g.heights[i] = sum / count;
			}
	}

	// --- landmarks
	const landmarks: LandmarkEntity[] = [];
	const landmarkMap: Partial<Record<LandmarkId, LandmarkEntity>> = {};

	const footprintCells = (cx: number, cy: number, r: number) => {
		const out: number[] = [];
		for (let y = cy - r; y <= cy + r; y++)
			for (let x = cx - r; x <= cx + r; x++) if (inBounds(x, y)) out.push(idx(x, y));
		return out;
	};

	const heightRange = (cells: number[]) => {
		let lo = Infinity;
		let hi = -Infinity;
		for (const i of cells) {
			lo = Math.min(lo, g.heights[i]);
			hi = Math.max(hi, g.heights[i]);
		}
		return hi - lo;
	};

	type SiteRules = {
		block: number;
		reserve: number;
		/** Interaction cell offset distance; 0 for none. */
		interactAt: number;
		facing: Facing;
		allowPath: boolean;
		terraform: boolean;
		spacing: boolean;
	};

	const siteOk = (cx: number, cy: number, rules: SiteRules) => {
		const { block, reserve } = rules;
		if (
			cx - block < 1 ||
			cy - block < 1 ||
			cx + block > GRID_W - 2 ||
			cy + block > GRID_H - 2
		)
			return false;
		if (rules.spacing)
			for (const l of landmarks)
				if (Math.hypot(l.cell.x - cx, l.cell.y - cy) < LANDMARK_SPACING) return false;
		const blockCells = footprintCells(cx, cy, block);
		for (const i of blockCells) {
			if (g.reserved[i] || g.interact[i]) return false;
			if (!rules.terraform && (g.water[i] || hasDeck(g, i))) return false;
			if (!rules.allowPath && g.path[i]) return false;
		}
		for (const i of footprintCells(cx, cy, reserve)) {
			if (g.reserved[i] === 1 || g.blocked[i] || g.interact[i]) return false;
		}
		if (!rules.terraform && heightRange(blockCells) > 1.1) return false;
		if (rules.interactAt) {
			const v = FACING_VECTORS[rules.facing];
			const ix = cx + v.x * rules.interactAt;
			const iy = cy + v.y * rules.interactAt;
			if (ix < 0 || iy < 0 || ix >= GRID_W || iy >= GRID_H) return false;
			const ii = idx(ix, iy);
			if (g.blocked[ii] || g.reserved[ii] === 2) return false;
			if (!rules.terraform && g.water[ii] && !hasDeck(g, ii)) return false;
		}
		return true;
	};

	const findSite = (
		cx: number,
		cy: number,
		facing: Facing,
		base: Omit<SiteRules, 'facing' | 'terraform' | 'allowPath'>,
		levels: { allowPath: boolean; terraform: boolean; radius: number }[],
	) => {
		const facingsToTry = [facing, ...facings.filter((f) => f !== facing)];
		for (const level of levels) {
			const offsets = level.radius <= 10 ? SPIRAL_10 : SPIRAL;
			for (const o of offsets) {
				if (o.x * o.x + o.y * o.y > level.radius * level.radius) break;
				const x = cx + o.x;
				const y = cy + o.y;
				for (const f of base.interactAt ? facingsToTry : [facing]) {
					const rules = { ...base, ...level, facing: f };
					if (siteOk(x, y, rules)) return { x, y, facing: f, terraform: level.terraform };
				}
			}
		}
		return null;
	};

	const flattenPad = (
		cx: number,
		cy: number,
		block: number,
		reserve: number,
		drain: boolean,
	) => {
		const blockCells = footprintCells(cx, cy, block);
		if (drain)
			for (const i of footprintCells(cx, cy, reserve)) {
				if (g.water[i]) {
					g.water[i] = 0;
					g.deck[i] = Number.NaN;
					g.path[i] = 0;
					g.heights[i] = WATER_LEVEL + 0.25;
					g.ground[i] = 'sand';
				}
			}
		let sum = 0;
		let count = 0;
		for (const i of blockCells) {
			if (g.water[i]) continue;
			sum += g.heights[i];
			count++;
		}
		const pad = count ? sum / count : 0;
		for (const i of footprintCells(cx, cy, reserve)) {
			if (g.water[i]) continue;
			const x = i % GRID_W;
			const y = (i - x) / GRID_W;
			const ring = Math.max(Math.abs(x - cx), Math.abs(y - cy));
			g.heights[i] =
				ring <= block ? pad : lerp(g.heights[i], pad, ring === block + 1 ? 0.75 : 0.45);
		}
		return pad;
	};

	const placeLandmark = (
		id: LandmarkId,
		want: Cell,
		facing: Facing,
		name: string,
		meta: { index: number; seed: number; supplied: boolean },
	) => {
		const fp = LANDMARK_FOOTPRINT[id];
		const site = findSite(
			want.x,
			want.y,
			facing,
			{ block: fp.block, reserve: fp.reserve, interactAt: 2, spacing: true },
			[
				{ allowPath: true, terraform: false, radius: 10 },
				{ allowPath: true, terraform: true, radius: 48 },
			],
		);
		if (!site) return;
		flattenPad(site.x, site.y, fp.block, fp.reserve, site.terraform);
		for (const i of footprintCells(site.x, site.y, fp.reserve)) g.reserved[i] = 1;
		for (const i of footprintCells(site.x, site.y, fp.block)) {
			g.blocked[i] = 1;
			g.ground[i] = LANDMARK_GROUND[id];
		}
		const v = FACING_VECTORS[site.facing];
		const interact = { x: site.x + v.x * 2, y: site.y + v.y * 2 };
		const ii = idx(interact.x, interact.y);
		g.interact[ii] = 1;
		if (!g.path[ii] && !g.water[ii])
			g.ground[ii] = LANDMARK_GROUND[id] === 'plaza' ? 'plaza' : 'dirt';
		const entity: LandmarkEntity = {
			type: 'landmark',
			id: meta.supplied
				? `supplied-${id}`
				: `${meta.index}-landmark-${id}-${meta.seed.toString(36)}`,
			opIndex: meta.supplied ? -1 : meta.index,
			landmark: id,
			name,
			facing: site.facing,
			x: site.x + 0.5,
			y: site.y + 0.5,
			rotation: FACING_ROTATION[site.facing],
			cell: { x: site.x, y: site.y },
			interact,
			supplied: meta.supplied,
		};
		landmarks.push(entity);
		landmarkMap[id] = entity;
	};

	for (const op of byType('landmark'))
		placeLandmark(op.id, { x: op.x, y: op.y }, op.facing, op.name, {
			index: op.index,
			seed: op.seed,
			supplied: false,
		});
	if (!partial)
		for (const id of landmarkIds) {
			if (landmarkMap[id]) continue;
			const spot = DEFAULT_LANDMARK_SPOTS[id];
			placeLandmark(id, spot, spot.facing, DEFAULT_LANDMARK_NAMES[id], {
				index: -1,
				seed: 0,
				supplied: true,
			});
		}

	// --- buildings (docks hug the shore and reach over water)
	const buildings: BuildingEntity[] = [];
	for (const op of byType('building')) {
		const id = `${op.index}-building-${op.kind}-${op.seed.toString(36)}`;
		if (op.kind === 'dock') {
			const dirs = [op.facing, ...facings.filter((f) => f !== op.facing)];
			let placed = false;
			for (const o of SPIRAL_10) {
				if (placed) break;
				const x = op.x + o.x;
				const y = op.y + o.y;
				if (!inBounds(x, y)) continue;
				const i = idx(x, y);
				if (g.water[i] || g.reserved[i] || g.blocked[i] || g.interact[i] || g.path[i])
					continue;
				for (const f of dirs) {
					const v = FACING_VECTORS[f];
					let length = 0;
					while (length < 3) {
						const nx = x + v.x * (length + 1);
						const ny = y + v.y * (length + 1);
						if (!inBounds(nx, ny)) break;
						const j = idx(nx, ny);
						if (!g.water[j] || hasDeck(g, j)) break;
						length++;
					}
					if (length < 2) continue;
					g.reserved[i] = 2;
					for (let k = 1; k <= length; k++) {
						const j = idx(x + v.x * k, y + v.y * k);
						g.deck[j] = DECK_HEIGHT;
						g.deckAxis[j] = v.x ? 'x' : 'y';
						g.deckKind[j] = 'dock';
						g.deckId[j] = `${id}-${k}`;
					}
					buildings.push({
						type: 'building',
						id,
						opIndex: op.index,
						kind: 'dock',
						roof: op.roof,
						facing: f,
						cell: { x, y },
						x: x + 0.5,
						y: y + 0.5,
						rotation: FACING_ROTATION[f],
						length,
					});
					placed = true;
					break;
				}
			}
			continue;
		}
		const fp = BUILDING_FOOTPRINT[op.kind];
		const site = findSite(
			op.x,
			op.y,
			op.facing,
			{ block: fp.block, reserve: fp.reserve, interactAt: 0, spacing: false },
			[
				{ allowPath: false, terraform: false, radius: 6 },
				{ allowPath: true, terraform: false, radius: 9 },
			],
		);
		if (!site) continue;
		flattenPad(site.x, site.y, fp.block, fp.reserve, false);
		for (const i of footprintCells(site.x, site.y, fp.reserve))
			if (!g.reserved[i]) g.reserved[i] = 2;
		for (const i of footprintCells(site.x, site.y, fp.block)) {
			g.blocked[i] = 1;
			if (!g.path[i]) g.ground[i] = 'dirt';
		}
		// Keep the doorstep open: the cell in front of the door is never blocked by scatter.
		const v = FACING_VECTORS[site.facing];
		const door = { x: site.x + v.x * (fp.block + 1), y: site.y + v.y * (fp.block + 1) };
		if (inBounds(door.x, door.y)) g.reserved[idx(door.x, door.y)] ||= 2;
		buildings.push({
			type: 'building',
			id,
			opIndex: op.index,
			kind: op.kind,
			roof: op.roof,
			facing: site.facing,
			cell: { x: site.x, y: site.y },
			x: site.x + 0.5,
			y: site.y + 0.5,
			rotation: FACING_ROTATION[site.facing],
			length: 0,
		});
	}

	computeSteep(g);

	// --- rocks
	const rocks: RockEntity[] = [];
	const scatterFree = (i: number) =>
		!g.water[i] &&
		!g.path[i] &&
		!g.reserved[i] &&
		!g.blocked[i] &&
		!g.interact[i] &&
		!hasDeck(g, i);
	for (const op of byType('rocks')) {
		const rng = mulberry32(op.seed);
		const r = op.radius;
		const area = Math.PI * (r + 0.5) * (r + 0.5);
		const count =
			op.size === 'pebbles'
				? Math.round(area * 1.4)
				: op.size === 'boulders'
					? Math.max(2, Math.round(area * 0.45))
					: Math.max(3, Math.round(area * 0.6));
		for (let k = 0; k < count; k++) {
			const a = rng() * Math.PI * 2;
			const d = Math.sqrt(rng()) * (r + 0.4);
			const fx = op.x + 0.5 + Math.cos(a) * d;
			const fy = op.y + 0.5 + Math.sin(a) * d;
			const scale = rng();
			const variant = Math.floor(rng() * 4);
			const rotation = rng() * Math.PI * 2;
			const cx = Math.floor(fx);
			const cy = Math.floor(fy);
			if (!inBounds(cx, cy)) continue;
			const i = idx(cx, cy);
			if (!scatterFree(i) || g.tree[i]) continue;
			if (op.size !== 'pebbles') g.rock[i] = 1;
			rocks.push({
				type: 'rock',
				id: `${op.index}-rock-${k}-${op.seed.toString(36)}`,
				opIndex: op.index,
				size: op.size,
				x: clamp(fx, 0.2, GRID_W - 0.2),
				y: clamp(fy, 0.2, GRID_H - 0.2),
				rotation,
				scale:
					op.size === 'pebbles'
						? 0.25 + scale * 0.25
						: op.size === 'boulders'
							? 0.55 + scale * 0.45
							: 1.1 + scale * 0.9,
				variant,
			});
		}
	}

	// --- forests
	const trees: TreeEntity[] = [];
	const DENSITY = { sparse: 0.22, normal: 0.42, dense: 0.66 } as const;
	for (const op of byType('forest')) {
		const rng = mulberry32(op.seed);
		const r = op.radius;
		let k = 0;
		for (let y = op.y - r; y <= op.y + r; y++)
			for (let x = op.x - r; x <= op.x + r; x++) {
				const roll = rng();
				const jx = rng();
				const jy = rng();
				const scale = rng();
				const rot = rng();
				const variant = Math.floor(rng() * 4);
				const n = k++;
				if (!inBounds(x, y)) continue;
				const d = Math.hypot(x - op.x, y - op.y) / (r + 0.5);
				if (d >= 1) continue;
				const p = DENSITY[op.density] * (1 - d * d * 0.55);
				if (roll > p) continue;
				const i = idx(x, y);
				if (!scatterFree(i) || g.rock[i] || g.tree[i]) continue;
				if (g.ground[i] === 'sand' && op.species !== 'palm') continue;
				g.tree[i] = 1;
				trees.push({
					type: 'tree',
					id: `${op.index}-tree-${n}-${op.seed.toString(36)}`,
					opIndex: op.index,
					species: op.species,
					x: x + 0.5 + (jx - 0.5) * 0.5,
					y: y + 0.5 + (jy - 0.5) * 0.5,
					rotation: rot * Math.PI * 2,
					scale: 0.8 + scale * 0.45,
					variant,
				});
			}
	}

	// --- spawn next to Max, then make sure every landmark can be reached from it
	const walk = (i: number) => walkableAt(g, i);
	const nearestWalkable = (from: Cell, avoid?: (i: number) => boolean) => {
		for (const o of SPIRAL) {
			const x = from.x + o.x;
			const y = from.y + o.y;
			if (!inBounds(x, y)) continue;
			const i = idx(x, y);
			if (walk(i) && !avoid?.(i)) return { x, y };
		}
		return null;
	};

	const maxCamp = landmarkMap.max;
	let spawn: Cell & { facing: Facing };
	if (maxCamp) {
		const v = FACING_VECTORS[maxCamp.facing];
		const front = { x: maxCamp.interact.x + v.x, y: maxCamp.interact.y + v.y };
		const lookAtMax = OPPOSITE[maxCamp.facing];
		const side = { x: v.y, y: v.x };
		const candidates = [
			front,
			{ x: front.x + side.x, y: front.y + side.y },
			{ x: front.x - side.x, y: front.y - side.y },
			{ x: front.x + v.x, y: front.y + v.y },
			maxCamp.interact,
		];
		// The camera sits behind the visitor, away from Max: prefer a spot with open ground there.
		const room = (c: Cell) => {
			let n = 0;
			for (let k = 1; k <= 3; k++) {
				const x = c.x + v.x * k;
				const y = c.y + v.y * k;
				if (!inBounds(x, y) || g.blocked[idx(x, y)]) break;
				n++;
			}
			return n;
		};
		const found = candidates
			.filter((c) => inBounds(c.x, c.y) && walk(idx(c.x, c.y)))
			.sort((a, b) => room(b) - room(a))[0];
		const cell = found ?? nearestWalkable(maxCamp.interact) ?? maxCamp.interact;
		spawn = { ...cell, facing: lookAtMax };
		g.forced[idx(cell.x, cell.y)] = 1;
		if (!walk(idx(cell.x, cell.y))) {
			// Last resort: clear the spot so the visitor never spawns inside something.
			const i = idx(cell.x, cell.y);
			g.tree[i] = 0;
			g.rock[i] = 0;
			if (g.water[i] && !hasDeck(g, i)) {
				g.deck[i] = DECK_HEIGHT;
				g.deckKind[i] = 'bridge';
				g.deckId[i] = `spawn-bridge-${cell.x}-${cell.y}`;
			}
		}
	} else {
		const centre = { x: Math.floor(GRID_W / 2), y: Math.floor(GRID_H / 2) };
		const cell = nearestWalkable(centre) ?? centre;
		spawn = { ...cell, facing: 'south' };
	}

	if (maxCamp) {
		const ordered = [...landmarks].sort(
			(a, b) =>
				Math.hypot(a.interact.x - spawn.x, a.interact.y - spawn.y) -
				Math.hypot(b.interact.x - spawn.x, b.interact.y - spawn.y),
		);
		for (const target of ordered) {
			const seen = reachableFrom(walk, spawn);
			const ti = idx(target.interact.x, target.interact.y);
			if (seen[ti] && walk(ti)) continue;
			const route = astar(
				spawn,
				target.interact,
				(i) => {
					if (i === ti) return 1;
					if (g.blocked[i]) return Infinity;
					if (walk(i)) return g.path[i] ? 0.6 : g.reserved[i] === 1 ? 2 : 1;
					// Landmark yards may be repaired too, but only when nothing else works.
					let c = g.reserved[i] === 1 ? 8 : 1;
					if (g.water[i] && !hasDeck(g, i)) c += 5;
					if (g.tree[i]) c += 2;
					if (g.rock[i]) c += 3;
					if (g.steep[i]) c += 6;
					return c;
				},
				false,
			);
			if (!route) continue;
			for (const cell of route) {
				const i = idx(cell.x, cell.y);
				if (walk(i)) continue;
				g.tree[i] = 0;
				g.rock[i] = 0;
				g.forced[i] = 1;
				if (g.water[i] && !hasDeck(g, i)) {
					g.deck[i] = DECK_HEIGHT;
					g.deckKind[i] = 'bridge';
					g.deckId[i] = `repair-bridge-${cell.x}-${cell.y}`;
					const prev = route[Math.max(0, route.indexOf(cell) - 1)];
					g.deckAxis[i] = prev.x !== cell.x ? 'x' : 'y';
				} else if (!g.path[i] && !g.reserved[i]) {
					g.path[i] = 1;
					g.ground[i] = 'dirt';
				}
			}
		}
	}

	// Paint what is too steep to walk as rock, so cliffs read as cliffs.
	for (let i = 0; i < g.steep.length; i++)
		if (
			g.steep[i] &&
			!g.forced[i] &&
			!g.water[i] &&
			!g.path[i] &&
			!g.blocked[i] &&
			!g.reserved[i]
		)
			g.ground[i] = 'rock';

	// Drop scatter that a repair path cleared.
	const keptTrees = trees.filter((t) => g.tree[idx(Math.floor(t.x), Math.floor(t.y))]);
	const keptRocks = rocks.filter(
		(r) => r.size === 'pebbles' || g.rock[idx(Math.floor(r.x), Math.floor(r.y))],
	);

	const walkable = new Uint8Array(GRID_W * GRID_H);
	const passable = new Uint8Array(GRID_W * GRID_H);
	for (let i = 0; i < walkable.length; i++) {
		walkable[i] = walkableAt(g, i) ? 1 : 0;
		passable[i] = walkableAt(g, i, true) ? 1 : 0;
	}

	// --- props
	const props: PropEntity[] = [];
	const spawnIndex = idx(spawn.x, spawn.y);
	const propFree = (i: number) =>
		!g.water[i] &&
		!g.blocked[i] &&
		!g.interact[i] &&
		!hasDeck(g, i) &&
		!g.tree[i] &&
		!g.rock[i] &&
		i !== spawnIndex &&
		g.reserved[i] !== 1;
	for (const op of byType('props')) {
		const rng = mulberry32(op.seed);
		const fenceAxis = rng() < 0.5 ? 'x' : 'y';
		let anchor: Cell | null = null;
		for (const o of SPIRAL_4) {
			const x = op.x + o.x;
			const y = op.y + o.y;
			if (inBounds(x, y) && propFree(idx(x, y))) {
				anchor = { x, y };
				break;
			}
		}
		if (!anchor) continue;
		for (let k = 0; k < op.count; k++) {
			const ox = rng();
			const oy = rng();
			const jx = rng();
			const jy = rng();
			const rot = rng();
			const sc = rng();
			let cx: number;
			let cy: number;
			if (op.kind === 'fence') {
				const step = k === 0 ? 0 : Math.ceil(k / 2) * (k % 2 ? 1 : -1);
				cx = anchor.x + (fenceAxis === 'x' ? step : 0);
				cy = anchor.y + (fenceAxis === 'y' ? step : 0);
			} else if (k === 0) {
				cx = anchor.x;
				cy = anchor.y;
			} else {
				cx = anchor.x + Math.round((ox - 0.5) * 4.4);
				cy = anchor.y + Math.round((oy - 0.5) * 4.4);
			}
			if (!inBounds(cx, cy) || !propFree(idx(cx, cy))) continue;
			const isFence = op.kind === 'fence';
			props.push({
				type: 'prop',
				id: `${op.index}-prop-${op.kind}-${k}-${op.seed.toString(36)}`,
				opIndex: op.index,
				kind: op.kind,
				x: cx + 0.5 + (isFence ? 0 : (jx - 0.5) * 0.4),
				y: cy + 0.5 + (isFence ? 0 : (jy - 0.5) * 0.4),
				rotation: isFence ? (fenceAxis === 'x' ? 0 : Math.PI / 2) : rot * Math.PI * 2,
				scale: 0.9 + sc * 0.25,
				variant: Math.floor(sc * 4),
			});
		}
	}

	// --- NPCs stand on walkable ground, never on interaction spots or the spawn
	const npcs: NpcEntity[] = [];
	const taken = new Set<number>();
	for (const op of byType('npc')) {
		const cell = nearestWalkable(
			{ x: op.x, y: op.y },
			(i) => g.interact[i] === 1 || i === spawnIndex || taken.has(i),
		);
		if (!cell) continue;
		taken.add(idx(cell.x, cell.y));
		const rng = mulberry32(op.seed);
		npcs.push({
			type: 'npc',
			id: `${op.index}-npc-${op.kind}-${op.seed.toString(36)}`,
			opIndex: op.index,
			kind: op.kind,
			name: op.name,
			line: op.line,
			wanders: op.wanders,
			cell,
			radius: op.wanders ? 3 : 0,
			x: cell.x + 0.5,
			y: cell.y + 0.5,
			rotation: Math.floor(rng() * 4) * (Math.PI / 2),
			variant: Math.floor(rng() * 4),
		});
	}

	const decks: DeckCell[] = [];
	for (let i = 0; i < g.deck.length; i++) {
		if (Number.isNaN(g.deck[i])) continue;
		const x = i % GRID_W;
		const y = (i - x) / GRID_W;
		decks.push({
			id: g.deckId[i] || `deck-${x}-${y}`,
			x,
			y,
			axis: g.deckAxis[i],
			height: g.deck[i],
			kind: g.deckKind[i],
		});
	}

	return {
		width: GRID_W,
		height: GRID_H,
		seed,
		meta,
		hasMeta: Boolean(metaOp),
		partial,
		opCount: list.length,
		ground: g.ground,
		heights: g.heights,
		walkable,
		passable,
		deck: g.deck,
		landmarks,
		landmark: landmarkMap,
		buildings,
		props,
		npcs,
		trees: keptTrees,
		rocks: keptRocks,
		decks,
		spawn,
	};
}

// ---------------------------------------------------------------------------
// Queries for the renderer and the player controller

export function cellAt(fx: number, fy: number): Cell {
	return {
		x: clamp(Math.floor(fx), 0, GRID_W - 1),
		y: clamp(Math.floor(fy), 0, GRID_H - 1),
	};
}

export function isWalkable(world: CompiledWorld, x: number, y: number) {
	return inBounds(x, y) && world.walkable[idx(x, y)] === 1;
}

export function isPassable(world: CompiledWorld, x: number, y: number) {
	return inBounds(x, y) && world.passable[idx(x, y)] === 1;
}

/** Terrain height at any point, bilinear between cell centres. */
export function sampleHeight(
	world: Pick<CompiledWorld, 'heights'>,
	fx: number,
	fy: number,
) {
	const u = clamp(fx - 0.5, 0, GRID_W - 1);
	const v = clamp(fy - 0.5, 0, GRID_H - 1);
	const x0 = Math.min(GRID_W - 2, Math.floor(u));
	const y0 = Math.min(GRID_H - 2, Math.floor(v));
	const tx = u - x0;
	const ty = v - y0;
	const h = world.heights;
	const a = h[idx(x0, y0)];
	const b = h[idx(x0 + 1, y0)];
	const c = h[idx(x0, y0 + 1)];
	const d = h[idx(x0 + 1, y0 + 1)];
	return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

/** Where feet stand: the terrain, or a deck over water. Never below the water surface. */
export function surfaceHeight(world: CompiledWorld, fx: number, fy: number) {
	const { x, y } = cellAt(fx, fy);
	const deck = world.deck[idx(x, y)];
	const ground = sampleHeight(world, fx, fy);
	if (!Number.isNaN(deck)) return Math.max(deck, ground);
	return Math.max(ground, WATER_LEVEL - 0.25);
}

export function nearestWalkableCell(world: CompiledWorld, from: Cell): Cell | null {
	for (const o of SPIRAL) {
		const x = from.x + o.x;
		const y = from.y + o.y;
		if (isWalkable(world, x, y)) return { x, y };
	}
	return null;
}

/**
 * Click-to-move: 8-way A* without corner cutting. The start cell is always allowed (the visitor
 * may stand among trees); an unwalkable goal is swapped for the nearest walkable cell.
 * Returns cells from start to goal, or null when there is no way.
 */
export function findPath(world: CompiledWorld, from: Cell, to: Cell): Cell[] | null {
	const start = cellAt(from.x, from.y);
	let goal = cellAt(to.x, to.y);
	if (!isWalkable(world, goal.x, goal.y)) {
		const near = nearestWalkableCell(world, goal);
		if (!near) return null;
		goal = near;
	}
	const s = idx(start.x, start.y);
	return astar(start, goal, (i) => (i === s || world.walkable[i] ? 1 : Infinity), true);
}

/** Cells reachable from `from` with the same moves as findPath. */
export function reachableCells(world: CompiledWorld, from: Cell) {
	return reachableFrom((i) => world.walkable[i] === 1, from);
}
