import {
	ASSETS,
	COFFEE_TABLE_TOP,
	COUNTER_TOP,
	DESK_TOP,
	footprint,
	SEAT_FORWARD,
	SEAT_TOP,
	STAGE_TOP,
	TABLE_TOP,
	type AssetId,
} from './catalog';
import { fbm, lattice, pick, randInt, rngFor, shuffle, type Rng } from './random';
import type { LandmarkId, ZoneKind } from './schema';
import {
	EDGE,
	PASSABLE_EDGES,
	type Cell,
	type Decor,
	type Furniture,
	type Rot,
	type Spot,
	type SpotKind,
} from './types';
import { H, W, type Rect } from './floorplan';

/*
 * Furnishing: one placer per zone kind fills a room with furniture, desk-top clutter, seats
 * and stand spots for people, and its landmark if it has one.
 *
 * Every group of pieces is placed atomically through RoomCtx.place, which refuses overlaps,
 * reserved cells (doorways, aisles, landmark spots) and anything that would cut a reserved cell
 * off from the others. A room is therefore always walkable between its doors, landmark and
 * seats, whatever a placer tries. Placers only look at their own room, the seed and the door
 * positions, so revealing a neighbouring room never rearranges this one.
 *
 * Connecting families are autotiled in a run's local frame: pieces go from the run's local
 * left to its local right (west to east for a south-facing run), `*_end_l` first and `*_end_r`
 * last; meeting and dining tables and planters close with their end piece turned around,
 * counters with their own right-hand cap. Long rows alternate variants of their middle piece.
 */

export const FACE: readonly Cell[] = [
	{ x: 0, y: 1 },
	{ x: 1, y: 0 },
	{ x: 0, y: -1 },
	{ x: -1, y: 0 },
];
/** Local +X (the run direction) for each rotation. */
export const RIGHT: readonly Cell[] = [
	{ x: 1, y: 0 },
	{ x: 0, y: -1 },
	{ x: -1, y: 0 },
	{ x: 0, y: 1 },
];
export const heading = (rot: number) => (((rot % 4) + 4) % 4) * (Math.PI / 2);
const turn = (rot: Rot, by: number) => (((rot + by) % 4) + 4) % 4 as Rot;

/** Local (x, z) offset, +z towards the piece's front, to cell space. */
export function rotate(lx: number, lz: number, rot: Rot): [number, number] {
	switch (rot) {
		case 0:
			return [lx, lz];
		case 1:
			return [lz, -lx];
		case 2:
			return [-lx, -lz];
		case 3:
			return [-lz, lx];
	}
}

export type Family =
	| 'desk'
	| 'sofa'
	| 'meeting'
	| 'dining'
	| 'planter'
	| 'counter'
	| 'shelf'
	| 'rack'
	| 'stage';

/** Pieces of a run of `n` tiles, local left to right. */
export function runAssets(
	family: Family,
	n: number,
): { asset: AssetId; turn: 0 | 2; mirror: boolean }[] {
	const piece = (asset: AssetId, t: 0 | 2 = 0, mirror = false) => ({ asset, turn: t, mirror });
	/** Middle pieces, alternating between variants so long rows do not repeat. */
	const middle = (asset: AssetId, count: number, alt: AssetId = asset) =>
		Array.from({ length: Math.max(0, count) }, (_, i) => piece(i % 2 ? alt : asset));
	switch (family) {
		case 'desk':
			return n === 1
				? [piece('desk_single')]
				: [piece('desk_end_l'), ...middle('desk_mid', n - 2), piece('desk_end_r')];
		case 'sofa':
			return n === 1
				? [piece('armchair')]
				: [piece('sofa_end_l'), ...middle('sofa_mid', n - 2), piece('sofa_end_r')];
		case 'meeting':
			return [piece('meeting_end'), ...middle('meeting_mid', n - 2), piece('meeting_end', 2)];
		case 'dining':
			return [piece('dining_end'), ...middle('dining_mid', n - 2), piece('dining_end', 2)];
		case 'planter':
			return n === 1
				? [piece('plant_snake')]
				: [piece('planter_end'), ...middle('planter_mid', n - 2, 'planter_mid_b'), piece('planter_end', 2)];
		case 'counter':
			// SPEC: mirrored caps keep the cabinet doors facing front; never turn an end round.
			return n === 1
				? [piece('counter_mid')]
				: [piece('counter_end_l'), ...middle('counter_mid', n - 2), piece('counter_end_r')];
		case 'shelf':
			return middle('bookshelf', n, 'bookshelf_b');
		case 'rack':
			return middle('server_rack', n);
		case 'stage':
			return middle('stage_block', n);
	}
}


const NON_BLOCKING = new Set<AssetId>(['rug_round', 'rug_rect']);


// ---------------------------------------------------------------------------------------------
// Room context

export type Grid = {
	roomAt: Int16Array;
	blocked: Uint8Array;
	reserved: Uint8Array;
	hEdge: Uint8Array;
	vEdge: Uint8Array;
};

type PieceDraft = {
	asset: AssetId;
	x: number;
	y: number;
	rot: Rot;
	mirror?: boolean;
	elev?: number;
};
type SpotDraft = { kind: SpotKind; x: number; y: number; rot: Rot; sit?: boolean; elev?: number };
type DecorDraft = Omit<Decor, 'id' | 'room'>;
type EdgeDraft = { axis: 'h' | 'v'; x: number; y: number; kind: number };
export type Group = {
	pieces?: PieceDraft[];
	reserve?: Cell[];
	spots?: SpotDraft[];
	decor?: DecorDraft[];
	edges?: EdgeDraft[];
};

export type Furnished = {
	furniture: Furniture[];
	decor: Decor[];
	spots: Spot[];
	landmarks: { landmark: LandmarkId; x: number; y: number; interact: Cell; height: number }[];
	/** Max's chair. */
	max: Spot | null;
};

export const cellIndex = (x: number, y: number) => y * W + x;
export const hIndex = (x: number, y: number) => y * W + x;
export const vIndex = (x: number, y: number) => y * (W + 1) + x;

/** Whether one 4-neighbour step crosses no wall. */
export function stepOpen(hEdge: Uint8Array, vEdge: Uint8Array, x: number, y: number, dx: number, dy: number) {
	if (dx === 1) return PASSABLE_EDGES.has(vEdge[vIndex(x + 1, y)]);
	if (dx === -1) return PASSABLE_EDGES.has(vEdge[vIndex(x, y)]);
	if (dy === 1) return PASSABLE_EDGES.has(hEdge[hIndex(x, y + 1)]);
	return PASSABLE_EDGES.has(hEdge[hIndex(x, y)]);
}

export class RoomCtx {
	readonly x0: number;
	readonly y0: number;
	readonly x1: number;
	readonly y1: number;
	readonly rng: Rng;
	private anchors: number[] = [];
	private count = 0;
	/** Floor kept free of filler (an event's audience area), though placers may still use it. */
	readonly keepClear = new Set<number>();

	constructor(
		readonly grid: Grid,
		readonly rect: Rect & { index: number },
		readonly seed: number,
		readonly kind: ZoneKind | 'hall',
		readonly out: Furnished,
		salt = 'room',
	) {
		this.x0 = rect.x;
		this.y0 = rect.y;
		this.x1 = rect.x + rect.w - 1;
		this.y1 = rect.y + rect.h - 1;
		this.rng = rngFor(seed, salt, rect.index, kind);
		for (let y = this.y0; y <= this.y1; y++)
			for (let x = this.x0; x <= this.x1; x++)
				if (grid.reserved[cellIndex(x, y)]) this.anchors.push(cellIndex(x, y));
	}

	get w() {
		return this.rect.w;
	}
	get h() {
		return this.rect.h;
	}
	get cx() {
		return this.x0 + Math.floor((this.rect.w - 1) / 2);
	}
	get cy() {
		return this.y0 + Math.floor((this.rect.h - 1) / 2);
	}

	inRoom(x: number, y: number) {
		return x >= this.x0 && x <= this.x1 && y >= this.y0 && y <= this.y1;
	}
	isFree(x: number, y: number) {
		if (!this.inRoom(x, y)) return false;
		const i = cellIndex(x, y);
		return !this.grid.blocked[i] && !this.grid.reserved[i];
	}
	nextId(prefix: string) {
		return `${prefix}${this.rect.index}-${this.count++}`;
	}

	/** Places a group atomically; false (and no change) if it does not fit. */
	place(group: Group): boolean {
		const { blocked, reserved } = this.grid;
		const cells = new Set<number>();
		for (const p of group.pieces ?? []) {
			const [fw, fd] = footprint(p.asset);
			const [w, d] = p.rot % 2 ? [fd, fw] : [fw, fd];
			for (let y = p.y; y < p.y + d; y++)
				for (let x = p.x; x < p.x + w; x++) {
					if (!this.inRoom(x, y)) return false;
					if (NON_BLOCKING.has(p.asset)) continue;
					const i = cellIndex(x, y);
					if (blocked[i] || reserved[i] || cells.has(i)) return false;
					cells.add(i);
				}
		}
		const fresh: number[] = [];
		for (const c of group.reserve ?? []) {
			if (!this.inRoom(c.x, c.y)) return false;
			const i = cellIndex(c.x, c.y);
			if (blocked[i] || cells.has(i)) return false;
			if (!reserved[i] && !fresh.includes(i)) fresh.push(i);
		}
		// Floor spots (stand here, present there) stay free and connected for good.
		for (const spot of group.spots ?? []) {
			if (spot.sit || !this.inRoom(spot.x, spot.y)) continue;
			const i = cellIndex(spot.x, spot.y);
			if (!blocked[i] && !cells.has(i) && !reserved[i] && !fresh.includes(i)) fresh.push(i);
		}
		// Every seat keeps a free cell next to it, so whoever sits there can be walked up to.
		for (const spot of group.spots ?? []) {
			if (!spot.sit) continue;
			const around = FACE.map((f) => ({ x: spot.x + f.x, y: spot.y + f.y })).filter((c) => this.inRoom(c.x, c.y));
			const index = (c: Cell) => cellIndex(c.x, c.y);
			if (around.some((c) => reserved[index(c)] || fresh.includes(index(c)))) continue;
			const open = around.find((c) => !blocked[index(c)] && !cells.has(index(c)));
			if (!open) return false;
			fresh.push(index(open));
		}
		const edges = (group.edges ?? []).map((e) => {
			const array = e.axis === 'h' ? this.grid.hEdge : this.grid.vEdge;
			const i = e.axis === 'h' ? hIndex(e.x, e.y) : vIndex(e.x, e.y);
			return { array, i, before: array[i], kind: e.kind };
		});

		for (const i of cells) blocked[i] = 1;
		for (const i of fresh) reserved[i] = 1;
		for (const e of edges) e.array[e.i] = e.kind;
		this.anchors.push(...fresh);
		if (!this.connected()) {
			for (const i of cells) blocked[i] = 0;
			for (const i of fresh) reserved[i] = 0;
			for (const e of edges) e.array[e.i] = e.before;
			this.anchors.length -= fresh.length;
			return false;
		}

		for (const p of group.pieces ?? []) {
			const [fw, fd] = footprint(p.asset);
			const [w, d] = p.rot % 2 ? [fd, fw] : [fw, fd];
			this.out.furniture.push({
				id: this.nextId('f'),
				asset: p.asset,
				x: p.x,
				y: p.y,
				w,
				d,
				rot: p.rot,
				mirror: p.mirror ?? false,
				elev: p.elev ?? 0,
				blocks: !NON_BLOCKING.has(p.asset),
				room: this.rect.index,
			});
		}
		for (const s of group.spots ?? []) {
			// Seats are snapped onto their seat's surface once the room is done (snapSeats).
			this.out.spots.push({
				kind: s.kind,
				x: s.x + 0.5,
				y: s.y + 0.5,
				heading: heading(s.rot),
				sit: s.sit ?? false,
				elev: s.elev ?? 0,
				room: this.rect.index,
			});
		}
		for (const d of group.decor ?? [])
			this.out.decor.push({ ...d, id: this.nextId('d'), room: this.rect.index });
		return true;
	}

	/** Every reserved cell of the room can still reach every other one. */
	private connected() {
		const { blocked, hEdge, vEdge } = this.grid;
		if (this.anchors.length < 2) return true;
		const seen = new Set<number>([this.anchors[0]]);
		const queue = [this.anchors[0]];
		while (queue.length) {
			const i = queue.pop()!;
			const x = i % W;
			const y = (i - x) / W;
			for (const f of FACE) {
				const nx = x + f.x;
				const ny = y + f.y;
				if (!this.inRoom(nx, ny)) continue;
				const j = cellIndex(nx, ny);
				if (seen.has(j) || blocked[j]) continue;
				if (!stepOpen(hEdge, vEdge, x, y, f.x, f.y)) continue;
				seen.add(j);
				queue.push(j);
			}
		}
		return this.anchors.every((i) => seen.has(i));
	}

	reserve(cells: Cell[]) {
		return this.place({ reserve: cells });
	}

	/** Adds props that block nothing (on desks, shelves and walls). */
	decorate(drafts: DecorDraft[]) {
		for (const d of drafts)
			this.out.decor.push({ ...d, id: this.nextId('d'), room: this.rect.index });
	}

	landmark(landmark: LandmarkId, x: number, y: number, interact: Cell, height: number) {
		this.out.landmarks.push({ landmark, x, y, interact, height });
	}

	/** The run's cells from local left to local right. */
	runCells(start: Cell, n: number, rot: Rot): Cell[] {
		const r = RIGHT[rot];
		return Array.from({ length: n }, (_, i) => ({ x: start.x + r.x * i, y: start.y + r.y * i }));
	}

	run(family: Family, start: Cell, n: number, rot: Rot, elev = 0): PieceDraft[] {
		const cells = this.runCells(start, n, rot);
		return runAssets(family, n).map((p, i) => ({
			asset: p.asset,
			x: cells[i].x,
			y: cells[i].y,
			rot: turn(rot, p.turn),
			mirror: p.mirror,
			elev,
		}));
	}

	/** Which way a cell on the room boundary faces into the room, or null inside. */
	inward(x: number, y: number): Rot | null {
		if (y === this.y0) return 0;
		if (y === this.y1) return 2;
		if (x === this.x0) return 1;
		if (x === this.x1) return 3;
		return null;
	}

	/** Boundary cells in a stable, seeded, noise-clustered order. */
	edgeCells(corners = false): Cell[] {
		const out: Cell[] = [];
		for (let y = this.y0; y <= this.y1; y++)
			for (let x = this.x0; x <= this.x1; x++) {
				const onX = x === this.x0 || x === this.x1;
				const onY = y === this.y0 || y === this.y1;
				if (corners ? onX && onY : onX || onY) out.push({ x, y });
			}
		const salt = this.rect.index * 7919;
		return out.sort((a, b) => lattice(this.seed + salt, a.x, a.y) - lattice(this.seed + salt, b.x, b.y));
	}

	/** Puts up to `count` single-tile pieces against the room's boundary, facing in. */
	scatter(assets: readonly AssetId[], count: number, corners = false) {
		let placed = 0;
		for (const c of this.edgeCells(corners)) {
			if (placed >= count) break;
			if (!this.isFree(c.x, c.y) || this.keepClear.has(cellIndex(c.x, c.y))) continue;
			const rot = this.inward(c.x, c.y) ?? 0;
			const asset = pick(this.rng, assets);
			if (this.place({ pieces: [{ asset, x: c.x, y: c.y, rot }] })) placed++;
		}
		return placed;
	}

	/** Puts single-tile pieces in free cells anywhere, keeping one tile of air around them. */
	sprinkle(assets: readonly AssetId[], count: number) {
		let placed = 0;
		const cells: Cell[] = [];
		for (let y = this.y0 + 1; y < this.y1; y++)
			for (let x = this.x0 + 1; x < this.x1; x++) cells.push({ x, y });
		for (const c of shuffle(this.rng, cells)) {
			if (placed >= count) break;
			let clear = true;
			for (let dy = -1; dy <= 1 && clear; dy++)
				for (let dx = -1; dx <= 1; dx++)
					if (!this.isFree(c.x + dx, c.y + dy) || this.keepClear.has(cellIndex(c.x + dx, c.y + dy))) clear = false;
			if (!clear) continue;
			const asset = pick(this.rng, assets);
			if (this.place({ pieces: [{ asset, x: c.x, y: c.y, rot: randInt(this.rng, 0, 3) as Rot }] }))
				placed++;
		}
		return placed;
	}

	/** Desk-top or counter-top props on a tile, in the tile's local frame. */
	topItems(cell: Cell, rot: Rot, items: { asset: AssetId; lx: number; lz: number; turn?: number }[], top = DESK_TOP) {
		return items.map((item) => {
			const [ox, oz] = rotate(item.lx, item.lz, rot);
			return {
				asset: item.asset,
				x: cell.x + 0.5 + ox,
				z: cell.y + 0.5 + oz,
				y: top,
				heading: heading(rot) + (item.turn ?? 0),
			};
		});
	}
}

/**
 * Puts every sitter onto their seat: the seat's surface height, its centre (back against the
 * backrest) and facing the way the seat faces, so people sit square at their desk or table
 * whatever a placer wrote into the spot.
 */
export function snapSeats(out: Furnished) {
	const seats = new Map<number, Furniture>();
	for (const f of out.furniture) if (SEAT_TOP[f.asset] !== undefined) seats.set(cellIndex(f.x, f.y), f);
	for (const spot of out.max ? [...out.spots, out.max] : out.spots) {
		if (!spot.sit) continue;
		const seat = seats.get(cellIndex(Math.floor(spot.x), Math.floor(spot.y)));
		if (!seat) continue;
		const face = FACE[seat.rot];
		spot.elev = SEAT_TOP[seat.asset]! + seat.elev;
		spot.heading = heading(seat.rot);
		spot.x = seat.x + 0.5 + face.x * SEAT_FORWARD;
		spot.y = seat.y + 0.5 + face.y * SEAT_FORWARD;
	}
}

// ---------------------------------------------------------------------------------------------
// Shared bits

const FLOOR_PLANTS: AssetId[] = ['plant_monstera', 'plant_fiddle', 'plant_snake', 'plant_ficus'];
/** Little things on desks, besides the computer: at most a couple per workstation. */
const CLUTTER: AssetId[] = [
	'mug',
	'plant_desk',
	'paper_stack',
	'coffee_cup_togo',
	'rubber_duck',
	'headphones',
	'red_stapler',
	'mug',
	'plant_desk',
	'desk_lamp',
];

/**
 * Half extents (local x, z) of desk-top props, measured from the kit with a voxel of slack, so
 * clutter can be packed without anything overlapping or hanging off the tabletop.
 */
export const TOP_HALF: Partial<Record<AssetId, readonly [number, number]>> = {
	monitor: [0.4, 0.15],
	monitor_dual: [0.49, 0.15],
	laptop: [0.34, 0.27],
	keyboard_mouse: [0.45, 0.14],
	mug: [0.2, 0.14],
	mug_boss: [0.2, 0.14],
	coffee_cup_togo: [0.14, 0.14],
	plant_desk: [0.14, 0.14],
	paper_stack: [0.2, 0.2],
	rubber_duck: [0.16, 0.14],
	headphones: [0.26, 0.12],
	desk_lamp: [0.32, 0.26],
	red_stapler: [0.1, 0.17],
	the_internet: [0.26, 0.2],
	pizza_box: [0.39, 0.39],
};

/** Axis-aligned half extents of a top prop turned by `turn` radians in its tile's frame. */
export function topHalf(asset: AssetId, turn: number): [number, number] {
	const [hx, hz] = TOP_HALF[asset] ?? [0.25, 0.25];
	const c = Math.abs(Math.cos(turn));
	const sn = Math.abs(Math.sin(turn));
	return [hx * c + hz * sn, hx * sn + hz * c];
}

/** Front-to-back extent of a desk's usable top in its local frame (the kit's desks are full tiles). */
export const DESK_TOP_Z: readonly [number, number] = [-0.47, 0.47];

type TopItem = { asset: AssetId; lx: number; lz: number; turn?: number };

/**
 * A run of desks along local +X (tile i centred at lx = i): a computer per workstation with
 * its keyboard, then at most two small things each, only where they fit without touching the
 * screen, the keyboard, each other or the edge of the tabletop. Props may sit across the joint
 * between two neighbouring desks, which is where real desks keep their plants.
 */
function runClutter(ctx: RoomCtx, cells: Cell[], rot: Rot, extra: AssetId[] = []) {
	const n = cells.length;
	const items: TopItem[] = [];
	const boxes: [number, number, number, number][] = [];
	const fits = (asset: AssetId, lx: number, lz: number, turn: number) => {
		const [hx, hz] = topHalf(asset, turn);
		const box: [number, number, number, number] = [lx - hx, lx + hx, lz - hz, lz + hz];
		if (box[0] < -0.5 + 0.005 || box[1] > n - 0.5 - 0.005) return false;
		if (box[2] < DESK_TOP_Z[0] || box[3] > DESK_TOP_Z[1]) return false;
		const pad = 0.02;
		if (boxes.some((b) => box[0] < b[1] + pad && box[1] > b[0] - pad && box[2] < b[3] + pad && box[3] > b[2] - pad))
			return false;
		boxes.push(box);
		items.push({ asset, lx, lz, turn });
		return true;
	};
	const machines: AssetId[] = [];
	cells.forEach((cell, i) => {
		const rng = rngFor(ctx.seed, 'desk', cell.x, cell.y);
		const roll = rng();
		const machine: AssetId = roll < 0.58 ? 'monitor' : roll < 0.76 ? 'monitor_dual' : 'laptop';
		machines.push(machine);
		if (machine === 'laptop') fits(machine, i, -0.12, 0);
		else {
			fits(machine, i, -0.26, 0);
			fits('keyboard_mouse', i, 0.17, 0);
		}
	});
	cells.forEach((cell, i) => {
		const rng = rngFor(ctx.seed, 'clutter', cell.x, cell.y);
		const mess = Math.min(2, Math.floor(fbm(ctx.seed, cell.x * 0.35, cell.y * 0.35) * 2.6 + rng() * 0.6));
		const props = [...(i === 0 ? extra : []), ...Array.from({ length: mess }, () => pick(rng, CLUTTER))].slice(0, 2);
		// Beside a laptop there is room on the tile; otherwise in the gaps between screens.
		const slots =
			machines[i] === 'laptop'
				? [
						{ lx: i + 0.34, lz: -0.28 },
						{ lx: i - 0.34, lz: -0.28 },
						{ lx: i + 0.34, lz: 0.26 },
						{ lx: i - 0.34, lz: 0.26 },
					]
				: [
						{ lx: i + 0.5, lz: -0.3 },
						{ lx: i - 0.5, lz: -0.3 },
						{ lx: i + 0.5, lz: 0.34 },
						{ lx: i - 0.5, lz: 0.34 },
					];
		for (const asset of props) {
			const turn = (rng() - 0.5) * 0.5;
			for (const slot of shuffle(rng, slots)) if (fits(asset, slot.lx, slot.lz, turn)) break;
		}
	});
	return ctx.topItems(cells[0], rot, items);
}

// ---------------------------------------------------------------------------------------------
// Placers

type Placer = (ctx: RoomCtx, opts: PlacerOptions) => void;
export type PlacerOptions = {
	entrance: { x: number; w: number } | null;
	/** Corridor dressing, picked per office. */
	hall?: HallStyle;
};

/** Tries `attempt` on each candidate until one succeeds. */
function first<T>(candidates: T[], attempt: (c: T) => boolean) {
	for (const c of candidates) if (attempt(c)) return c;
	return null;
}

function range(from: number, to: number) {
	const out: number[] = [];
	for (let i = from; i <= to; i++) out.push(i);
	return out;
}

/** Centre-first order: the middle of [from, to] first, then alternating outwards. */
function centred(from: number, to: number) {
	const mid = (from + to) / 2;
	return range(from, to).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
}

/** A 2×1 wall piece with its interaction cells in front, on the north wall or a side wall. */
function wallPiece(
	ctx: RoomCtx,
	asset: AssetId,
	onPlaced: (centre: { x: number; y: number }, front: Cell[]) => void,
	order: 'centre' | 'edge' = 'centre',
) {
	const xs = order === 'centre' ? centred(ctx.x0, ctx.x1 - 1) : shuffle(ctx.rng, range(ctx.x0, ctx.x1 - 1));
	const ys = centred(ctx.y0, ctx.y1 - 1);
	const options: { x: number; y: number; rot: Rot; front: Cell[] }[] = [
		...xs.map((x) => ({
			x,
			y: ctx.y0,
			rot: 0 as Rot,
			front: [
				{ x, y: ctx.y0 + 1 },
				{ x: x + 1, y: ctx.y0 + 1 },
			],
		})),
		...ys.map((y) => ({
			x: ctx.x0,
			y,
			rot: 1 as Rot,
			front: [
				{ x: ctx.x0 + 1, y },
				{ x: ctx.x0 + 1, y: y + 1 },
			],
		})),
		...ys.map((y) => ({
			x: ctx.x1,
			y,
			rot: 3 as Rot,
			front: [
				{ x: ctx.x1 - 1, y },
				{ x: ctx.x1 - 1, y: y + 1 },
			],
		})),
	];
	return first(options, (o) => {
		if (!ctx.place({ pieces: [{ asset, x: o.x, y: o.y, rot: o.rot }], reserve: o.front })) return false;
		const [fw, fd] = footprint(asset);
		const [w, d] = o.rot % 2 ? [fd, fw] : [fw, fd];
		onPlaced({ x: o.x + w / 2, y: o.y + d / 2 }, o.front);
		return true;
	});
}

export type PodKind = 'pod' | 'row' | 'standing' | 'huddle';

/**
 * The open space's desk groups in placement order: pods first and in between, the rest a
 * seeded mix, so two offices never get the same grid of identical pods.
 */
export function podPlan(seed: number, room: number, len: number): { kind: PodKind; n: number }[] {
	const rng = rngFor(seed, 'pods', room);
	const pod = () => ({ kind: 'pod' as PodKind, n: rng() < 0.35 ? Math.max(2, len - 1) : len });
	const mix = shuffle(rng, [
		{ kind: 'row' as PodKind, n: len },
		{ kind: 'row' as PodKind, n: Math.max(2, len - 1) },
		{ kind: 'standing' as PodKind, n: 2 },
		{ kind: 'huddle' as PodKind, n: 2 },
	]).slice(0, 2 + Math.floor(rng() * 2));
	const plan = [pod()];
	for (const m of mix) plan.push(m, pod());
	// Pods fill whatever floor is left.
	while (plan.length < 9) plan.push(pod());
	return plan;
}

/**
 * One desk group in the four rows from `py` (aisles above and below, a free column to its right):
 * - pod: two back-to-back desk rows, chairs on both sides;
 * - row: a single row of desks with its chairs on the north side, so people face the camera;
 * - standing: two desks without chairs, people standing at them;
 * - huddle: a low table with stools round it, for pairing and quick syncs.
 */
function deskGroup(ctx: RoomCtx, kind: PodKind, px: number, py: number, n: number): Group {
	const pieces: PieceDraft[] = [];
	const spots: SpotDraft[] = [];
	const decor: DecorDraft[] = [];
	const reserve: Cell[] = [];
	for (let r = 0; r < 4; r++) if (px + n <= ctx.x1) reserve.push({ x: px + n, y: py + r });
	const aisle = (y: number) => {
		if (y >= ctx.y0 && y <= ctx.y1) for (let i = 0; i < n; i++) reserve.push({ x: px + i, y });
	};
	const chair = (x: number, y: number, rot: Rot) => {
		pieces.push({ asset: 'office_chair', x, y, rot });
		spots.push({ kind: 'desk', x, y, rot, sit: true, elev: 7 / 16 });
	};
	switch (kind) {
		case 'pod':
			pieces.push(...ctx.run('desk', { x: px + n - 1, y: py + 1 }, n, 2), ...ctx.run('desk', { x: px, y: py + 2 }, n, 0));
			for (let i = 0; i < n; i++) {
				chair(px + i, py, 0);
				chair(px + i, py + 3, 2);
			}
			decor.push(
				...runClutter(ctx, ctx.runCells({ x: px + n - 1, y: py + 1 }, n, 2), 2),
				...runClutter(ctx, ctx.runCells({ x: px, y: py + 2 }, n, 0), 0),
			);
			aisle(py - 1);
			aisle(py + 4);
			break;
		case 'row':
		case 'standing':
			pieces.push(...ctx.run('desk', { x: px + n - 1, y: py + 2 }, n, 2));
			for (let i = 0; i < n; i++)
				if (kind === 'row') chair(px + i, py + 1, 0);
				else spots.push({ kind: 'desk', x: px + i, y: py + 1, rot: 0 });
			decor.push(...runClutter(ctx, ctx.runCells({ x: px + n - 1, y: py + 2 }, n, 2), 2));
			aisle(py);
			aisle(py + 3);
			break;
		case 'huddle':
			pieces.push(
				{ asset: 'coffee_table', x: px, y: py + 2, rot: 0 },
				{ asset: 'stool', x: px, y: py + 1, rot: 0 },
				{ asset: 'stool', x: px + 1, y: py + 1, rot: 0 },
				{ asset: 'stool', x: px, y: py + 3, rot: 2 },
				{ asset: 'stool', x: px + 1, y: py + 3, rot: 2 },
			);
			for (const [x, y, rot] of [[px, py + 1, 0], [px + 1, py + 1, 0], [px, py + 3, 2], [px + 1, py + 3, 2]] as const)
				spots.push({ kind: 'meeting', x, y, rot, sit: true, elev: 7 / 16 });
			decor.push(
				...ctx.topItems({ x: px, y: py + 2 }, 0, [
					{ asset: 'laptop', lx: 0.1, lz: 0 },
					{ asset: 'paper_stack', lx: 0.85, lz: 0.05, turn: 0.3 },
					{ asset: 'coffee_cup_togo', lx: 1.3, lz: -0.1 },
				], COFFEE_TABLE_TOP),
			);
			aisle(py);
			aisle(py + 4);
			break;
	}
	return { pieces, spots, decor, reserve };
}

const desks: Placer = (ctx) => {
	// Max's desk on the north wall if possible, his chair in front, the visitor's spot behind it.
	const maxRows = range(ctx.y0, Math.max(ctx.y0, ctx.y1 - 3));
	first(
		maxRows.flatMap((y) => centred(ctx.x0, ctx.x1 - 1).map((x) => ({ x, y }))),
		({ x, y }) => {
			const ok = ctx.place({
				pieces: [
					{ asset: 'big_desk_max', x, y, rot: 0 },
					{ asset: 'gaming_chair', x, y: y + 1, rot: 2 },
				],
				reserve: [
					{ x: x + 1, y: y + 1 },
					{ x, y: y + 2 },
					{ x: x + 1, y: y + 2 },
				],
				decor: ctx.topItems({ x: x + 1, y }, 0, [{ asset: 'mug_boss', lx: 0.3, lz: 0.2 }]),
			});
			if (!ok) return false;
			ctx.landmark('max', x + 1, y + 0.5, { x, y: y + 2 }, 1.5);
			ctx.out.max = {
				kind: 'desk',
				x: x + 0.5,
				y: y + 1.5,
				heading: heading(2),
				sit: true,
				elev: 7 / 16,
				room: ctx.rect.index,
			};
			return true;
		},
	);

	wallPiece(
		ctx,
		'kanban_board',
		(c, front) => ctx.landmark('questboard', c.x, c.y, front[0], 2.1),
		'edge',
	);

	// Desk groups, an aisle all around each: mostly back-to-back pods, with a seeded mix of
	// shorter pods, single rows facing the camera, standing desks and a huddle table.
	const len = ctx.w >= 12 ? 4 : ctx.w >= 8 ? 3 : 2;
	const plan = podPlan(ctx.seed, ctx.rect.index, len);
	let pods = 0;
	for (let py = ctx.y0 + 1; py <= ctx.y1 - 4 && pods < plan.length; py++)
		for (let px = ctx.x0 + 1; px <= ctx.x1 - 2 && pods < plan.length; px++) {
			const { kind, n: want } = plan[pods];
			const n = Math.min(want, ctx.x1 - px);
			if (n < (kind === 'huddle' ? 2 : Math.min(2, want))) continue;
			if (ctx.place(deskGroup(ctx, kind, px, py, n))) {
				pods++;
				px += n;
			}
		}

	// Small rooms: single rows facing the camera.
	if (pods === 0)
		for (let y = ctx.y0 + 1; y <= ctx.y1 - 2; y += 3) {
			const n = Math.min(4, ctx.w - 2);
			if (n < 1) break;
			const row = ctx.run('desk', { x: ctx.x0 + 1, y }, n, 0);
			const cells = ctx.runCells({ x: ctx.x0 + 1, y }, n, 0);
			ctx.place({
				pieces: [...row, ...cells.map((c) => ({ asset: 'office_chair' as AssetId, x: c.x, y: y + 1, rot: 2 as Rot }))],
				reserve: cells.map((c) => ({ x: c.x, y: y + 2 })),
				spots: cells.map((c) => ({ kind: 'desk' as SpotKind, x: c.x, y: y + 1, rot: 2 as Rot, sit: true, elev: 7 / 16 })),
				decor: runClutter(ctx, cells, 0),
			});
		}

	ctx.scatter(FLOOR_PLANTS, 3, true);
	// The open space always gets its printer (and its jams), then a few of the usual things.
	ctx.scatter(['printer'], 1);
	ctx.scatter(['whiteboard', 'filing_cabinet', 'water_cooler', 'trash_bin', 'plant_monstera', 'recycle_bins', 'coat_rack'], 4);
	if (ctx.w * ctx.h >= 60) phoneBooths(ctx, 1);
};

const meetup: Placer = (ctx) => {
	const sw = Math.max(2, Math.min(5, ctx.w - 4));
	const stage = first(centred(ctx.x0 + 1, ctx.x1 - sw).flatMap((x) => [{ x, y: ctx.y0 }, { x, y: ctx.y0 + 1 }]), (s) => {
		const mid = s.x + Math.floor(sw / 2);
		const blocks: PieceDraft[] = [];
		for (let dy = 0; dy < 2; dy++) blocks.push(...ctx.run('stage', { x: s.x, y: s.y + dy }, sw, 0));
		const front = range(s.x, s.x + sw - 1).map((x) => ({ x, y: s.y + 2 }));
		const ok = ctx.place({
			pieces: blocks,
			reserve: front,
			spots: [{ kind: 'speaker', x: mid - (sw > 2 ? 1 : 0), y: s.y + 1, rot: 0, elev: STAGE_TOP }],
			decor: [
				{ asset: 'podium', x: mid + 0.5, z: s.y + 1.5, y: STAGE_TOP, heading: 0 },
				{ asset: 'projector_screen', x: mid + 0.5, z: s.y + 0.5, y: STAGE_TOP, heading: 0 },
			],
		});
		if (ok) ctx.landmark('stage', mid + 0.5, s.y + 1, { x: mid, y: s.y + 2 }, 2.8);
		return ok;
	});

	// A small block of audience chairs; an event fills more of the room (see seatAudience), so
	// filler furniture stays out of the area its chairs will need.
	const aisle = stage ? stage.x + Math.floor(sw / 2) : ctx.cx;
	const top = stage ? stage.y + 3 : ctx.y0 + 2;
	for (let y = top; y <= Math.min(ctx.y1 - 1, top + 4); y++)
		for (let x = Math.max(ctx.x0 + 1, aisle - 6); x <= Math.min(ctx.x1 - 1, aisle + 6); x++)
			ctx.keepClear.add(cellIndex(x, y));
	if (stage && ctx.h - (stage.y + 3 - ctx.y0) >= 3)
		ctx.place({ pieces: [{ asset: 'rug_rect', x: stage.x + Math.floor(sw / 2) - 1, y: stage.y + 3, rot: 0 }] });
	seatAudience(ctx, BASE_AUDIENCE);
	wallPiece(ctx, 'snack_table', () => {}, 'edge');
	ctx.scatter(['floor_lamp', 'plant_fiddle', 'plant_monstera'], 3, true);
	ctx.scatter(['beanbag_coral', 'beanbag_teal', 'coat_rack'], 2);
};

/** Audience chairs in a meetup room without an event, and with one. */
export const BASE_AUDIENCE = 10;
export const EVENT_AUDIENCE = 24;

/**
 * Folding chairs facing the stage, front rows first and centre out, in pairs between little
 * aisles so everyone can be walked up to, until the room has `total` audience seats. Only ever
 * adds chairs, so a streaming brief can grow the crowd without moving anyone.
 */
export function seatAudience(ctx: RoomCtx, total: number) {
	const room = ctx.rect.index;
	const stage = ctx.out.landmarks.find(
		(l) => l.landmark === 'stage' && ctx.inRoom(Math.floor(l.x), Math.floor(l.y)),
	);
	const aisle = stage ? Math.floor(stage.x) : ctx.cx;
	const top = stage ? Math.floor(stage.y) + 2 : ctx.y0 + 2;
	let seats = ctx.out.spots.filter((s) => s.kind === 'audience' && s.room === room).length;
	// A walkway between rows keeps the crowd readable from above and everyone reachable.
	for (let y = top; y <= ctx.y1 - 1 && seats < total; y += 2) {
		const xs = range(ctx.x0 + 1, ctx.x1 - 1)
			.filter((x) => Math.abs(x - aisle) % 3 !== 0)
			.sort((a, b) => Math.abs(a - aisle) - Math.abs(b - aisle) || a - b);
		for (const x of xs) {
			if (seats >= total) break;
			if (!ctx.isFree(x, y)) continue;
			const gap = x + (Math.abs(x + 1 - aisle) % 3 === 0 ? 1 : -1);
			if (
				ctx.place({
					pieces: [{ asset: 'folding_chair', x, y, rot: 2 }],
					spots: [{ kind: 'audience', x, y, rot: 2, sit: true, elev: 7 / 16 }],
					reserve: ctx.inRoom(gap, y) ? [{ x: aisle, y }, { x: gap, y }] : [{ x: aisle, y }],
				})
			)
				seats++;
		}
	}
	return seats;
}

const library: Placer = (ctx) => {
	// Shelves along the north wall, one long unit broken only by doorways.
	let shelves: Cell[] = [];
	for (const x of range(ctx.x0, ctx.x1))
		if (ctx.place({ pieces: [{ asset: x % 2 ? 'bookshelf_b' : 'bookshelf', x, y: ctx.y0, rot: 0 }], reserve: ctx.h > 2 ? [{ x, y: ctx.y0 + 1 }] : [] }))
			shelves.push({ x, y: ctx.y0 });
	if (shelves.length < 3)
		for (const y of range(ctx.y0 + 1, ctx.y1 - 1))
			if (ctx.place({ pieces: [{ asset: y % 2 ? 'bookshelf_b' : 'bookshelf', x: ctx.x0, y, rot: 1 }], reserve: [{ x: ctx.x0 + 1, y }] }))
				shelves.push({ x: ctx.x0, y });
	shelves = shelves.sort((a, b) => Math.abs(a.x - ctx.cx) - Math.abs(b.x - ctx.cx) || a.x - b.x);
	const main = shelves[0];
	if (main) {
		const front = main.y === ctx.y0 ? { x: main.x, y: main.y + 1 } : { x: main.x + 1, y: main.y };
		ctx.landmark('library', main.x + 0.5, main.y + 0.5, front, 2.4);
		ctx.place({ spots: [{ kind: 'shelf', ...front, rot: main.y === ctx.y0 ? 2 : 3 }] });
	}
	for (const s of shelves.slice(1))
		if (ctx.rng() < 0.35)
			ctx.decorate([
				{ asset: 'plant_pothos_shelf', x: s.x + 0.5, z: s.y + 0.5, y: ASSETS.bookshelf.h, heading: 0 },
			]);

	// A reading corner: two armchairs around a chess table on a round rug.
	first(
		centred(ctx.y0 + 2, ctx.y1 - 1).flatMap((y) => centred(ctx.x0 + 1, ctx.x1 - 2).map((x) => ({ x, y }))),
		({ x, y }) =>
			ctx.place({
				pieces: [
					{ asset: 'rug_round', x, y: y - 1, rot: 0 },
					{ asset: 'armchair', x: x - 1, y, rot: 1 },
					{ asset: 'chess_table', x, y, rot: 0 },
					{ asset: 'armchair', x: x + 1, y, rot: 3 },
				],
				reserve: [{ x, y: y + 1 }],
				spots: [
					{ kind: 'reading', x: x - 1, y, rot: 1, sit: true, elev: 6 / 16 },
					{ kind: 'reading', x: x + 1, y, rot: 3, sit: true, elev: 6 / 16 },
				],
			}),
	);
	ctx.scatter(['floor_lamp', 'plant_ficus', 'armchair'], 3, true);
	ctx.scatter(['bookshelf', 'plant_snake', 'filing_cabinet'], 2);
};

const server: Placer = (ctx) => {
	// One row of racks on the north wall, more down the side walls facing in; nothing tall
	// stands between the camera and the aisle in front of the main rack.
	const racks: Cell[] = [];
	for (const x of range(ctx.x0 + 1, ctx.x1 - 1))
		if (ctx.place({ pieces: [{ asset: 'server_rack', x, y: ctx.y0, rot: 0 }], reserve: [{ x, y: ctx.y0 + 1 }] })) {
			racks.push({ x, y: ctx.y0 });
			ctx.place({ spots: [{ kind: 'rack', x, y: ctx.y0 + 1, rot: 2 }] });
		}
	if (ctx.w >= 5)
		for (const y of range(ctx.y0 + 2, ctx.y1 - 2))
			for (const [x, rot, inX] of [
				[ctx.x0, 1, ctx.x0 + 1],
				[ctx.x1, 3, ctx.x1 - 1],
			] as const)
				if (ctx.place({ pieces: [{ asset: 'server_rack', x, y, rot }], reserve: [{ x: inX, y }] }))
					ctx.place({ spots: [{ kind: 'rack', x: inX, y, rot: rot === 1 ? 3 : 1 }] });
	const main = [...racks].sort((a, b) => Math.abs(a.x - ctx.cx) - Math.abs(b.x - ctx.cx))[0];
	if (main) ctx.landmark('worldforge', main.x + 0.5, main.y + 0.5, { x: main.x, y: main.y + 1 }, 2.4);

	// The admin desk, with a certain small black box on it.
	first(
		centred(ctx.x0, ctx.x1).flatMap((x) => [ctx.y1 - 1, ctx.y1].map((y) => ({ x, y }))),
		({ x, y }) =>
			ctx.place({
				pieces: [
					{ asset: 'desk_single', x, y: y - 1, rot: 0 },
					{ asset: 'office_chair', x, y, rot: 2 },
				],
				spots: [{ kind: 'desk', x, y, rot: 2, sit: true, elev: 7 / 16 }],
				decor: ctx.topItems({ x, y: y - 1 }, 0, [
					{ asset: 'the_internet', lx: -0.22, lz: -0.27 },
					{ asset: 'laptop', lx: 0.13, lz: 0.2 },
				]),
			}),
	);
	ctx.scatter(['filing_cabinet', 'trash_bin', 'recycle_bins'], 2);
};

const reception: Placer = (ctx, { entrance }) => {
	const door = entrance ?? { x: ctx.cx, w: 1 };
	const lobby = range(door.x, door.x + door.w - 1).flatMap((x) => [
		{ x, y: ctx.y1 },
		{ x, y: ctx.y1 - 1 },
	]);
	ctx.reserve(lobby);
	const deskY = Math.max(ctx.y0 + 1, ctx.y1 - 3);
	first(
		[door.x + door.w + 1, door.x - 4, door.x + door.w, door.x - 3, ctx.x0 + 1, ctx.x1 - 3].flatMap((x) => [
			{ x, y: deskY },
			{ x, y: deskY - 1 },
		]),
		({ x, y }) =>
			ctx.place({
				pieces: [{ asset: 'reception_desk', x, y, rot: 0 }],
				reserve: [
					{ x: x + 1, y: y - 1 },
					{ x, y: y - 1 },
					{ x: x + 1, y: y + 1 },
				],
				spots: [{ kind: 'reception', x: x + 1, y: y - 1, rot: 0 }],
				decor: [
					...ctx.topItems({ x: x + 1, y }, 0, [{ asset: 'monitor', lx: 0, lz: -0.25, turn: Math.PI }], 1.05),
					...ctx.topItems({ x: x + 2, y }, 0, [{ asset: 'plant_desk', lx: 0.2, lz: 0 }], 1.05),
				],
			}),
	);
	// Waiting sofa on the north wall with a coffee table in front.
	first(centred(ctx.x0 + 1, ctx.x1 - 3), (x) =>
		ctx.place({
			pieces: [...ctx.run('sofa', { x, y: ctx.y0 }, 3, 0), { asset: 'coffee_table', x, y: ctx.y0 + 2, rot: 0 }],
			reserve: [0, 1, 2].map((i) => ({ x: x + i, y: ctx.y0 + 1 })),
			spots: [0, 2].map((i) => ({ kind: 'sofa' as SpotKind, x: x + i, y: ctx.y0, rot: 0 as Rot, sit: true, elev: 6 / 16 })),
			decor: ctx.topItems({ x, y: ctx.y0 + 2 }, 0, [{ asset: 'paper_stack', lx: 0.5, lz: 0 }], COFFEE_TABLE_TOP),
		}),
	);
	wallPiece(ctx, 'fish_tank', () => {}, 'edge');
	ctx.scatter(['umbrella_stand', 'coat_rack', 'bike', 'plant_monstera', 'plant_fiddle'], 4);
};

const coffee: Placer = (ctx) => {
	const n = Math.max(2, Math.min(5, ctx.w - 3));
	const placed = first(centred(ctx.x0 + 1, ctx.x1 - n).flatMap((x) => [x]), (x) => {
		const y = ctx.y0 + 1;
		const cells = ctx.runCells({ x, y }, n, 0);
		const behind = cells.map((c) => ({ x: c.x, y: ctx.y0 }));
		const stools = cells.filter((_, i) => i !== 1);
		return ctx.place({
			pieces: [
				...ctx.run('counter', { x, y }, n, 0),
				...stools.map((c) => ({ asset: 'bar_stool' as AssetId, x: c.x, y: y + 1, rot: 2 as Rot })),
			],
			reserve: [...behind, { x: x - 1, y: ctx.y0 }, { x: x - 1, y }],
			spots: [
				{ kind: 'barista', x: x + 1, y: ctx.y0, rot: 0 },
				...stools.map((c) => ({ kind: 'bar' as SpotKind, x: c.x, y: y + 1, rot: 2 as Rot, sit: true, elev: 11 / 16 })),
				// The barista bot works the far end of the bar.
				{ kind: 'perch', x: cells[n - 1].x, y, rot: 0, elev: COUNTER_TOP },
			],
			decor: [
				...ctx.topItems(cells[1], 0, [{ asset: 'espresso_machine', lx: 0, lz: -0.15, turn: Math.PI }], COUNTER_TOP),
				...cells.flatMap((c, i) =>
					i === 1 || i === n - 1
						? []
						: ctx.topItems(c, 0, [{ asset: i % 2 ? 'coffee_cup_togo' : 'mug', lx: (i % 3) * 0.2 - 0.2, lz: 0.15 }], COUNTER_TOP),
				),
			],
		});
	});
	if (!placed) ctx.scatter(['vending_machine', 'water_cooler'], 2);
	cafeTables(ctx, 2);
	ctx.scatter(['plant_monstera', 'recycle_bins', 'plant_snake', 'floor_lamp'], 3);
};

/** Little tables with stools on both long sides. */
export function cafeTables(ctx: RoomCtx, count: number, birthday = false) {
	let placed = 0;
	for (const y of centred(ctx.y0 + 2, ctx.y1 - 1))
		for (const x of centred(ctx.x0 + 1, ctx.x1 - 2)) {
			if (placed >= count) return placed;
			const table: AssetId = 'coffee_table';
			const top = COFFEE_TABLE_TOP;
			const ok = ctx.place({
				pieces: [
					{ asset: table, x, y, rot: 0 },
					{ asset: 'stool', x, y: y - 1, rot: 0 },
					{ asset: 'stool', x: x + 1, y: y + 1, rot: 2 },
				],
				reserve: [
					{ x: x + 1, y: y - 1 },
					{ x, y: y + 1 },
					{ x: x - 1, y },
					{ x: x + 2, y },
				],
				spots: [
					{ kind: 'table', x, y: y - 1, rot: 0, sit: true, elev: 7 / 16 },
					{ kind: 'table', x: x + 1, y: y + 1, rot: 2, sit: true, elev: 7 / 16 },
				],
				decor: ctx.topItems({ x, y }, 0, [
					birthday && placed === 0
						? { asset: 'birthday_cake' as AssetId, lx: 0.5, lz: 0 }
						: { asset: 'mug', lx: 0.2, lz: 0.1 },
				], top),
			});
			if (ok) placed++;
		}
	return placed;
}

const kitchen: Placer = (ctx) => {
	const n = Math.max(2, Math.min(6, ctx.w - 3));
	first(centred(ctx.x0 + 1, ctx.x1 - n), (x) => {
		const cells = ctx.runCells({ x, y: ctx.y0 }, n, 0);
		const pieces = ctx.run('counter', { x, y: ctx.y0 }, n, 0);
		if (n >= 3) pieces[Math.floor(n / 2)].asset = 'counter_sink';
		return ctx.place({
			pieces: [...pieces, { asset: 'fridge', x: x - 1, y: ctx.y0, rot: 0 }],
			reserve: [{ x: x - 1, y: ctx.y0 + 1 }, ...cells.map((c) => ({ x: c.x, y: ctx.y0 + 1 }))],
			spots: [
				{ kind: 'counter', x: x + 1, y: ctx.y0 + 1, rot: 2 },
				{ kind: 'perch', x: cells[n - 1].x, y: ctx.y0, rot: 0, elev: COUNTER_TOP },
			],
			decor: ctx.topItems(cells[0], 0, [{ asset: 'espresso_machine', lx: 0, lz: -0.15 }, { asset: 'mug', lx: 0.32, lz: 0.2 }], COUNTER_TOP),
		});
	});
	// The canteen table, or café tables where it does not fit.
	if (!diningTable(ctx, Math.min(5, ctx.w - 4))) cafeTables(ctx, ctx.w * ctx.h > 40 ? 2 : 1);
	ctx.scatter(['vending_machine', 'water_cooler', 'recycle_bins', 'trash_bin', 'plant_snake'], 4);
};

const lounge: Placer = (ctx) => {
	// An L-shaped sectional around a coffee table on a rug.
	first(
		centred(ctx.y0, ctx.y1 - 3).flatMap((y) => centred(ctx.x0, ctx.x1 - 3).map((x) => ({ x, y }))),
		({ x, y }) =>
			ctx.place({
				pieces: [
					{ asset: 'rug_rect', x, y: y + 1, rot: 0 },
					{ asset: 'sofa_end_l', x, y, rot: 0 },
					{ asset: 'sofa_mid', x: x + 1, y, rot: 0 },
					{ asset: 'sofa_mid', x: x + 2, y, rot: 0 },
					// The corner's backrests are on its local north and west; turned to face west they
					// close the L's north and east sides.
					{ asset: 'sofa_corner', x: x + 3, y, rot: 3 },
					{ asset: 'sofa_mid', x: x + 3, y: y + 1, rot: 3 },
					{ asset: 'sofa_end_r', x: x + 3, y: y + 2, rot: 3 },
					{ asset: 'coffee_table', x: x + 1, y: y + 2, rot: 0 },
				],
				reserve: [
					{ x, y: y + 1 },
					{ x: x + 1, y: y + 1 },
					{ x: x + 2, y: y + 1 },
					{ x, y: y + 2 },
					{ x: x + 1, y: y + 3 },
				],
				spots: [
					{ kind: 'sofa', x, y, rot: 0, sit: true, elev: 6 / 16 },
					{ kind: 'sofa', x: x + 2, y, rot: 0, sit: true, elev: 6 / 16 },
					{ kind: 'sofa', x: x + 3, y: y + 2, rot: 3, sit: true, elev: 6 / 16 },
				],
				decor: ctx.topItems({ x: x + 1, y: y + 2 }, 0, [
					{ asset: 'mug', lx: 0.1, lz: 0.05 },
					{ asset: 'headphones', lx: 0.8, lz: -0.05 },
				], COFFEE_TABLE_TOP),
			}),
	);
	let bags = 0;
	for (const c of shuffle(ctx.rng, ctx.edgeCells())) {
		if (bags >= 2) break;
		const rot = ctx.inward(c.x, c.y) ?? 0;
		const asset: AssetId = bags % 2 ? 'beanbag_teal' : 'beanbag_coral';
		if (ctx.place({ pieces: [{ asset, x: c.x, y: c.y, rot }], spots: [{ kind: 'beanbag', ...c, rot, sit: true, elev: 4 / 16 }] }))
			bags++;
	}
	ctx.scatter(['floor_lamp', 'plant_monstera', 'plant_ficus', 'bookshelf'], 3, true);
	ctx.scatter(['plant_hanging', 'armchair', 'dog_bed'], 2);
};

const games: Placer = (ctx) => {
	// Ping-pong runs along Z; players stand at the short ends.
	first(
		centred(ctx.y0 + 1, ctx.y1 - 3).flatMap((y) => centred(ctx.x0 + 1, ctx.x1 - 2).map((x) => ({ x, y }))),
		({ x, y }) =>
			ctx.place({
				pieces: [{ asset: 'ping_pong_table', x, y, rot: 0 }],
				reserve: [
					{ x, y: y - 1 },
					{ x: x + 1, y: y - 1 },
					{ x, y: y + 3 },
					{ x: x + 1, y: y + 3 },
					{ x: x - 1, y: y + 1 },
					{ x: x + 2, y: y + 1 },
				],
				spots: [
					{ kind: 'game', x, y: y - 1, rot: 0 },
					{ kind: 'game', x: x + 1, y: y + 3, rot: 2 },
					{ kind: 'stand', x: x - 1, y: y + 1, rot: 1 },
					{ kind: 'stand', x: x + 2, y: y + 1, rot: 3 },
				],
				decor:
					ctx.rng() < 0.3
						? [{ asset: 'trophy', x: x + 0.15, z: y + 1.5, y: 0.8, heading: 0 }]
						: [],
			}),
	);
	// The console corner: a TV on the north wall with beanbags in front.
	first(centred(ctx.x0, ctx.x1 - 1), (x) =>
		ctx.place({
			pieces: [
				{ asset: 'tv_console', x, y: ctx.y0, rot: 0 },
				{ asset: 'beanbag_teal', x, y: ctx.y0 + 2, rot: 2 },
				{ asset: 'beanbag_coral', x: x + 1, y: ctx.y0 + 2, rot: 2 },
			],
			reserve: [
				{ x, y: ctx.y0 + 1 },
				{ x: x + 1, y: ctx.y0 + 1 },
			],
			spots: [
				{ kind: 'game', x, y: ctx.y0 + 2, rot: 2, sit: true, elev: 4 / 16 },
				{ kind: 'game', x: x + 1, y: ctx.y0 + 2, rot: 2, sit: true, elev: 4 / 16 },
			],
		}),
	);
	// Arcade cabinets in a row on whatever wall is left.
	let arcades = 0;
	for (const c of ctx.edgeCells()) {
		if (arcades >= 2) break;
		const rot = ctx.inward(c.x, c.y) ?? 0;
		const f = FACE[rot];
		const front = { x: c.x + f.x, y: c.y + f.y };
		if (
			ctx.place({
				pieces: [{ asset: 'arcade_cabinet', x: c.x, y: c.y, rot }],
				reserve: [front],
				spots: [{ kind: 'arcade', ...front, rot: turn(rot, 2) }],
			})
		)
			arcades++;
	}
	first(
		centred(ctx.y0 + 1, ctx.y1 - 1).flatMap((y) => centred(ctx.x0 + 1, ctx.x1 - 2).map((x) => ({ x, y }))),
		({ x, y }) =>
			ctx.place({
				pieces: [{ asset: 'foosball_table', x, y, rot: 0 }],
				reserve: [
					{ x, y: y - 1 },
					{ x: x + 1, y: y + 1 },
				],
				spots: [
					{ kind: 'game', x, y: y - 1, rot: 0 },
					{ kind: 'game', x: x + 1, y: y + 1, rot: 2 },
				],
			}),
	);
	first(
		centred(ctx.y0 + 1, ctx.y1 - 1).flatMap((y) => centred(ctx.x0 + 1, ctx.x1 - 1).map((x) => ({ x, y }))),
		({ x, y }) =>
			ctx.place({
				pieces: [
					{ asset: 'stool', x: x - 1, y, rot: 1 },
					{ asset: 'chess_table', x, y, rot: 0 },
					{ asset: 'stool', x: x + 1, y, rot: 3 },
				],
				reserve: [{ x, y: y + 1 }],
				spots: [
					{ kind: 'seat', x: x - 1, y, rot: 1, sit: true, elev: 7 / 16 },
					{ kind: 'seat', x: x + 1, y, rot: 3, sit: true, elev: 7 / 16 },
				],
			}),
	);
	ctx.scatter(['plant_snake', 'trash_bin', 'gaming_chair'], 2);
};

/** One meeting table of `n` tiles starting `start` tiles into the room along its long axis. */
function meetingTable(ctx: RoomCtx, alongX: boolean, start: number, n: number, bare = true) {
	const cells: Cell[] = [];
	const pieces: PieceDraft[] = [];
	const spots: SpotDraft[] = [];
	if (alongX) {
		const y = ctx.cy;
		pieces.push(...ctx.run('meeting', { x: ctx.x0 + start, y }, n, 0));
		for (const c of ctx.runCells({ x: ctx.x0 + start, y }, n, 0)) {
			cells.push(c);
			pieces.push({ asset: 'office_chair', x: c.x, y: y - 1, rot: 0 }, { asset: 'office_chair', x: c.x, y: y + 1, rot: 2 });
			spots.push(
				{ kind: 'meeting', x: c.x, y: y - 1, rot: 0, sit: true, elev: 7 / 16 },
				{ kind: 'meeting', x: c.x, y: y + 1, rot: 2, sit: true, elev: 7 / 16 },
			);
		}
	} else {
		const x = ctx.cx;
		// Turned to run north-south: the rounded end at the north is local left.
		pieces.push(...ctx.run('meeting', { x, y: ctx.y0 + start + n - 1 }, n, 1));
		for (let i = 0; i < n; i++) {
			const y = ctx.y0 + start + i;
			cells.push({ x, y });
			pieces.push({ asset: 'office_chair', x: x - 1, y, rot: 1 }, { asset: 'office_chair', x: x + 1, y, rot: 3 });
			spots.push(
				{ kind: 'meeting', x: x - 1, y, rot: 1, sit: true, elev: 7 / 16 },
				{ kind: 'meeting', x: x + 1, y, rot: 3, sit: true, elev: 7 / 16 },
			);
		}
	}
	const decor = cells.flatMap((c, i) =>
		ctx.topItems(c, 0, [{ asset: i % 2 ? 'laptop' : 'paper_stack', lx: 0, lz: 0, turn: i * 1.3 }]),
	);
	// Someone presenting stands at the head of the table, facing along it.
	const head = alongX
		? { x: ctx.x0 + start + n, y: ctx.cy, rot: 3 as Rot }
		: { x: ctx.cx, y: ctx.y0 + start - 1, rot: 0 as Rot };
	if (
		ctx.inRoom(head.x, head.y) &&
		ctx.place({ pieces, spots: [...spots, { kind: 'stand', ...head }], reserve: [{ x: head.x, y: head.y }], decor })
	)
		return true;
	if (ctx.place({ pieces, spots, decor })) return true;
	// Too tight for chairs on both sides: just the table.
	return bare && ctx.place({ pieces: pieces.filter((p) => p.asset !== 'office_chair'), decor });
}

/**
 * The longest meeting table that still gets its chairs, starting between `from` and `to - n`
 * along the room; a bare table only as a last resort.
 */
function meetingTableIn(ctx: RoomCtx, alongX: boolean, from: number, to: number, longest: number) {
	for (let n = longest; n >= 2; n--)
		for (const start of centred(from, to - n)) if (meetingTable(ctx, alongX, start, n, false)) return true;
	return meetingTable(ctx, alongX, Math.max(from, Math.floor((from + to - longest) / 2)), longest);
}

const meeting: Placer = (ctx) => {
	const alongX = ctx.w >= ctx.h;
	const span = alongX ? ctx.w : ctx.h;
	if (span >= 12) {
		// A long room gets two tables, a huddle and a boardroom, with a walkway between.
		const n = Math.min(5, Math.floor((span - 4) / 2));
		const half = Math.floor(span / 2);
		meetingTableIn(ctx, alongX, 1, half, n);
		meetingTableIn(ctx, alongX, half + 1, span - 1, n);
	} else meetingTableIn(ctx, alongX, 1, span - 1, Math.max(2, Math.min(6, span - 3)));
	ctx.scatter(['whiteboard'], span >= 12 ? 2 : 1);
	ctx.scatter(['plant_snake', 'plant_fiddle'], 2, true);
};

/** Single phone booths against the room's walls, door facing in, with a caller's spot inside. */
export function phoneBooths(ctx: RoomCtx, count: number, cells: Cell[] = ctx.edgeCells()) {
	let placed = 0;
	for (const c of cells) {
		if (placed >= count) break;
		const rot = ctx.inward(c.x, c.y);
		if (rot === null || !ctx.isFree(c.x, c.y)) continue;
		const f = FACE[rot];
		if (
			ctx.place({
				pieces: [{ asset: 'phone_booth', x: c.x, y: c.y, rot }],
				reserve: [{ x: c.x + f.x, y: c.y + f.y }],
				spots: [{ kind: 'booth', x: c.x, y: c.y, rot }],
			})
		)
			placed++;
	}
	return placed;
}

const phone: Placer = (ctx) => {
	// A row of booths along the north wall, another along the south wall in deep rooms, with a
	// corridor in front of each row.
	const north = centred(ctx.x0, ctx.x1).map((x) => ({ x, y: ctx.y0 }));
	const south = ctx.h >= 5 ? centred(ctx.x0, ctx.x1).map((x) => ({ x, y: ctx.y1 })) : [];
	const perRow = Math.min(5, Math.max(2, ctx.w - 1));
	phoneBooths(ctx, perRow, north);
	phoneBooths(ctx, perRow - 1, south);
	ctx.scatter(['water_cooler', 'plant_monstera', 'floor_lamp'], 2);
};

/** A long canteen table with folding chairs down both sides. */
export function diningTable(ctx: RoomCtx, longest: number) {
	for (let n = longest; n >= 2; n--)
		for (const y of centred(ctx.y0 + 3, ctx.y1 - 2))
			for (const x of centred(ctx.x0 + 2, ctx.x1 - n - 1)) {
				const cells = ctx.runCells({ x, y }, n, 0);
				const ok = ctx.place({
					pieces: [
						...ctx.run('dining', { x, y }, n, 0),
						...cells.flatMap((c) => [
							{ asset: 'folding_chair' as AssetId, x: c.x, y: y - 1, rot: 0 as Rot },
							{ asset: 'folding_chair' as AssetId, x: c.x, y: y + 1, rot: 2 as Rot },
						]),
					],
					reserve: [
						{ x: x - 1, y },
						{ x: x + n, y },
					],
					spots: cells.flatMap((c) => [
						{ kind: 'table' as SpotKind, x: c.x, y: y - 1, rot: 0 as Rot, sit: true, elev: 7 / 16 },
						{ kind: 'table' as SpotKind, x: c.x, y: y + 1, rot: 2 as Rot, sit: true, elev: 7 / 16 },
					]),
					// The middle tile stays clear for a birthday cake; pizza boxes lie flat on a tile of
					// their own, square to the table, the other tiles get a drink each side.
					decor: cells.flatMap((c, i) =>
						i === Math.floor(n / 2)
							? []
							: i % 3 === 1
								? ctx.topItems(c, 0, [{ asset: 'pizza_box', lx: 0, lz: 0, turn: (i % 2) * 0.08 }], TABLE_TOP)
								: ctx.topItems(c, 0, [
										{ asset: i % 2 ? 'coffee_cup_togo' : 'mug', lx: -0.22, lz: -0.24, turn: i },
										{ asset: 'mug', lx: 0.22, lz: 0.24, turn: Math.PI - i },
									], TABLE_TOP),
					),
				});
				if (ok) return cells;
			}
	return null;
}

const print: Placer = (ctx) => {
	first(centred(ctx.x0, ctx.x1), (x) =>
		ctx.place({
			pieces: [{ asset: 'printer', x, y: ctx.y0, rot: 0 }],
			reserve: [{ x, y: ctx.y0 + 1 }],
			spots: [{ kind: 'printer', x, y: ctx.y0 + 1, rot: 2 }],
		}),
	);
	// A row of filing cabinets down a side wall.
	const side = ctx.rng() < 0.5 ? ctx.x0 : ctx.x1;
	const rot: Rot = side === ctx.x0 ? 1 : 3;
	for (const y of range(ctx.y0 + 1, ctx.y1 - 1))
		ctx.place({ pieces: [{ asset: 'filing_cabinet', x: side, y, rot }] });
	first(
		centred(ctx.y0 + 2, ctx.y1).flatMap((y) => centred(ctx.x0 + 1, ctx.x1 - 1).map((x) => ({ x, y }))),
		({ x, y }) =>
			ctx.place({
				pieces: [
					{ asset: 'desk_single', x, y: y - 1, rot: 0 },
					{ asset: 'office_chair', x, y, rot: 2 },
				],
				spots: [{ kind: 'desk', x, y, rot: 2, sit: true, elev: 7 / 16 }],
				decor: ctx.topItems({ x, y: y - 1 }, 0, [
					{ asset: 'paper_stack', lx: -0.25, lz: -0.1 },
					{ asset: 'red_stapler', lx: 0.22, lz: 0.27, turn: 0.4 },
					{ asset: 'paper_stack', lx: 0.25, lz: -0.2 },
				]),
			}),
	);
	ctx.scatter(['trash_bin', 'recycle_bins', 'water_cooler', 'plant_cactus'], 3);
};

const garden: Placer = (ctx) => {
	for (let y = ctx.y0 + 2; y <= ctx.y1 - 2; y += 3) {
		const n = Math.min(5, ctx.w - 4);
		if (n < 2) break;
		const x = ctx.x0 + 2 + randInt(ctx.rng, 0, Math.max(0, ctx.w - 4 - n));
		ctx.place({
			pieces: ctx.run('planter', { x, y }, n, 0),
			spots: [{ kind: 'stand', x, y: y + 1, rot: 2 }],
		});
	}
	wallPiece(ctx, 'fish_tank', () => {}, 'edge');
	ctx.scatter(FLOOR_PLANTS, 4, true);
	ctx.scatter(['plant_hanging', 'plant_cactus', 'plant_monstera', 'dog_bed', 'stool'], 5);
	ctx.sprinkle(['plant_ficus', 'plant_fiddle'], 2);
};

/** How a company dresses its corridor. */
export const HALL_STYLES = ['plain', 'rugs', 'planters', 'track'] as const;
export type HallStyle = (typeof HALL_STYLES)[number];

const hall: Placer = (ctx, { hall: style = 'plain' }) => {
	const vertical = ctx.h > ctx.w;
	const length = vertical ? ctx.h : ctx.w;
	const across = vertical ? ctx.w : ctx.h;
	if (style === 'rugs' && across >= 2)
		// Runner rugs down the middle, a few tiles apart.
		for (let i = 1; i + 3 <= length - 1; i += 5)
			ctx.place({
				pieces: [
					vertical
						? { asset: 'rug_rect', x: ctx.x0 + Math.floor((ctx.w - 2) / 2), y: ctx.y0 + i, rot: 1 }
						: { asset: 'rug_rect', x: ctx.x0 + i, y: ctx.y0 + Math.floor((ctx.h - 2) / 2), rot: 0 },
				],
			});
	if (style === 'planters' && across >= 3)
		// Short planter boxes along one long wall, with room to pass.
		for (let i = 1; i + 3 <= length - 1; i += 5)
			ctx.place({
				pieces: vertical
					? ctx.run('planter', { x: ctx.x0, y: ctx.y0 + i + 2 }, 3, 1)
					: ctx.run('planter', { x: ctx.x0 + i, y: ctx.y0 }, 3, 0),
			});
	const props = Math.max(1, Math.floor((ctx.w + ctx.h) / (style === 'planters' ? 16 : 10)));
	ctx.scatter(['plant_monstera', 'water_cooler', 'plant_fiddle', 'trash_bin', 'bike'], props, true);
};

export const PLACERS: Record<ZoneKind | 'hall', Placer> = {
	desks,
	meetup,
	library,
	server,
	reception,
	coffee,
	kitchen,
	lounge,
	games,
	meeting,
	phone,
	print,
	garden,
	hall,
};

/** Low planter boxes along an open boundary, with gaps at the doorways and the ends. */
export function planterDivider(ctx: RoomCtx, axis: 'h' | 'v', at: number, from: number, to: number, doors: number[]) {
	// The strip of cells inside this room next to the boundary.
	const inside = axis === 'h' ? (at === ctx.y0 ? ctx.y0 : ctx.y1) : at === ctx.x0 ? ctx.x0 : ctx.x1;
	const cells: number[] = [];
	for (let i = from + 1; i <= to - 2; i++) if (!doors.some((d) => Math.abs(d - i) <= 1)) cells.push(i);
	const runs: number[][] = [];
	for (const i of cells) {
		const last = runs.at(-1);
		if (last && last.at(-1) === i - 1) last.push(i);
		else runs.push([i]);
	}
	for (const run of runs) {
		if (run.length < 2) continue;
		const pieces =
			axis === 'h'
				? ctx.run('planter', { x: run[0], y: inside }, run.length, 0)
				: ctx.run('planter', { x: inside, y: run.at(-1)! }, run.length, 1);
		ctx.place({ pieces });
	}
}

/** Mount heights from the kit (bottom of the back face), and lower ones for cut-down inner walls. */
const WALL_MOUNT: Partial<Record<AssetId, { outer: number; inner: number | null }>> = {
	wall_tv: { outer: 1, inner: 0.95 },
	poster_motivation: { outer: 1.125, inner: 0.85 },
	poster_turn_off_on: { outer: 1.125, inner: 0.85 },
	wall_clock: { outer: 1.875, inner: null },
	neon_sign: { outer: 2.25, inner: null },
};

/** Posters, clocks and signs on the room's north wall where the wall is solid. */
export function wallDecor(ctx: RoomCtx, tall: Set<number>) {
	const options: Partial<Record<ZoneKind | 'hall', AssetId[]>> = {
		desks: ['poster_motivation', 'wall_clock', 'poster_turn_off_on'],
		games: ['neon_sign', 'poster_turn_off_on'],
		coffee: ['neon_sign', 'wall_clock'],
		reception: ['neon_sign', 'wall_clock'],
		meeting: ['wall_tv'],
		lounge: ['wall_tv', 'poster_motivation'],
		server: ['poster_turn_off_on'],
		print: ['poster_turn_off_on', 'wall_clock'],
		kitchen: ['wall_clock', 'poster_motivation'],
		meetup: ['neon_sign'],
		hall: ['poster_motivation'],
	};
	const outer = ctx.y0 === 0;
	const list = options[ctx.kind]?.filter((a) => (outer ? true : WALL_MOUNT[a]?.inner != null));
	if (!list?.length) return;
	const xs = shuffle(ctx.rng, range(ctx.x0, ctx.x1));
	let placed = 0;
	const want = Math.min(list.length, ctx.w >= 8 ? 2 : 1);
	for (const x of xs) {
		if (placed >= want) break;
		if (ctx.grid.hEdge[hIndex(x, ctx.y0)] !== EDGE.wall) continue;
		if (tall.has(cellIndex(x, ctx.y0))) continue;
		const asset = list[placed];
		const mount = WALL_MOUNT[asset];
		if (!mount) continue;
		ctx.out.decor.push({
			id: ctx.nextId('w'),
			asset,
			x: x + 0.5,
			z: ctx.y0 + 0.13,
			y: outer ? mount.outer : mount.inner!,
			heading: 0,
			room: ctx.rect.index,
			wall: { axis: 'h', x, y: ctx.y0 },
		});
		placed++;
	}
}

export const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

type Island = (ctx: RoomCtx, x: number, y: number) => Group;

/** Little furniture groups that fill leftover floor, each with a tile of air around it. */
const ISLANDS: Record<string, { w: number; h: number; make: Island }> = {
	reading: {
		w: 4,
		h: 2,
		make: (ctx, x, y) => ({
			pieces: [
				{ asset: 'rug_round', x: x + 1, y, rot: 0 },
				{ asset: 'armchair', x, y: y + 1, rot: 1 },
				{ asset: 'chess_table', x: x + 1, y: y + 1, rot: 0 },
				{ asset: 'armchair', x: x + 2, y: y + 1, rot: 3 },
				{ asset: pick(ctx.rng, FLOOR_PLANTS), x: x + 3, y: y + 1, rot: 0 },
			],
			spots: [
				{ kind: 'seat', x, y: y + 1, rot: 1, sit: true, elev: 6 / 16 },
				{ kind: 'seat', x: x + 2, y: y + 1, rot: 3, sit: true, elev: 6 / 16 },
			],
		}),
	},
	beanbags: {
		w: 2,
		h: 2,
		make: (_ctx, x, y) => ({
			pieces: [
				{ asset: 'rug_round', x, y, rot: 0 },
				{ asset: 'beanbag_teal', x, y: y + 1, rot: 1 },
				{ asset: 'beanbag_coral', x: x + 1, y, rot: 3 },
				{ asset: 'floor_lamp', x: x + 1, y: y + 1, rot: 0 },
			],
			spots: [
				{ kind: 'beanbag', x, y: y + 1, rot: 1, sit: true, elev: 4 / 16 },
				{ kind: 'beanbag', x: x + 1, y, rot: 3, sit: true, elev: 4 / 16 },
			],
		}),
	},
	plants: {
		w: 2,
		h: 2,
		make: (ctx, x, y) => ({
			pieces: [
				{ asset: 'plant_ficus', x, y, rot: 0 },
				{ asset: pick(ctx.rng, ['plant_monstera', 'plant_fiddle'] as const), x: x + 1, y, rot: 1 },
				{ asset: pick(ctx.rng, ['plant_snake', 'plant_cactus'] as const), x, y: y + 1, rot: 2 },
			],
			spots: [{ kind: 'stand', x: x + 1, y: y + 1, rot: 3 }],
		}),
	},
	sofa: {
		w: 3,
		h: 2,
		make: (ctx, x, y) => ({
			pieces: [
				...ctx.run('sofa', { x, y }, 3, 0),
				{ asset: 'coffee_table', x, y: y + 1, rot: 0 },
				{ asset: 'floor_lamp', x: x + 2, y: y + 1, rot: 0 },
			],
			spots: [
				{ kind: 'sofa', x, y, rot: 0, sit: true, elev: 6 / 16 },
				{ kind: 'sofa', x: x + 2, y, rot: 0, sit: true, elev: 6 / 16 },
			],
			decor: ctx.topItems({ x, y: y + 1 }, 0, [{ asset: 'mug', lx: 0.3, lz: 0.1 }], COFFEE_TABLE_TOP),
		}),
	},
	shelves: {
		w: 4,
		h: 1,
		make: (ctx, x, y) => ({
			pieces: [...ctx.run('shelf', { x, y }, 3, 0), { asset: 'floor_lamp', x: x + 3, y, rot: 0 }],
			spots: [{ kind: 'shelf', x: x + 1, y: y + 1, rot: 2 }],
		}),
	},
	cafe: {
		w: 2,
		h: 3,
		make: (ctx, x, y) => ({
			pieces: [
				{ asset: 'stool', x, y, rot: 0 },
				{ asset: 'coffee_table', x, y: y + 1, rot: 0 },
				{ asset: 'stool', x: x + 1, y: y + 2, rot: 2 },
			],
			spots: [
				{ kind: 'table', x, y, rot: 0, sit: true, elev: 7 / 16 },
				{ kind: 'table', x: x + 1, y: y + 2, rot: 2, sit: true, elev: 7 / 16 },
			],
			decor: ctx.topItems({ x, y: y + 1 }, 0, [{ asset: 'coffee_cup_togo', lx: 0.6, lz: 0 }], COFFEE_TABLE_TOP),
		}),
	},
};

const FILLERS: Partial<Record<ZoneKind, (keyof typeof ISLANDS)[]>> = {
	library: ['shelves', 'shelves', 'reading', 'plants'],
	phone: ['reading', 'beanbags', 'plants', 'sofa'],
	garden: ['plants', 'plants', 'beanbags', 'reading'],
	meeting: ['plants', 'sofa'],
	print: ['plants', 'shelves'],
	kitchen: ['cafe', 'cafe', 'plants'],
	coffee: ['cafe', 'cafe', 'plants', 'sofa'],
	lounge: ['beanbags', 'sofa', 'plants', 'reading'],
	games: ['beanbags', 'plants', 'sofa'],
	server: ['plants'],
	reception: ['sofa', 'plants', 'reading'],
	meetup: ['beanbags', 'plants', 'sofa'],
};

/** Big rooms for small zones get little furniture islands so they never look empty. */
/** Things that stand against a wall in each kind of room, for topping up sparse ones. */
const WALL_FILL: Partial<Record<ZoneKind | 'hall', AssetId[]>> = {
	library: ['bookshelf', 'bookshelf_b', 'plant_ficus', 'floor_lamp', 'armchair'],
	phone: ['plant_monstera', 'floor_lamp', 'water_cooler'],
	garden: ['plant_ficus', 'plant_fiddle', 'plant_monstera', 'plant_cactus'],
	meeting: ['whiteboard', 'plant_fiddle', 'filing_cabinet', 'water_cooler'],
	print: ['filing_cabinet', 'recycle_bins', 'plant_snake'],
	kitchen: ['vending_machine', 'water_cooler', 'plant_snake', 'recycle_bins'],
	coffee: ['plant_monstera', 'floor_lamp', 'bookshelf', 'armchair'],
	lounge: ['floor_lamp', 'plant_ficus', 'bookshelf_b', 'armchair', 'beanbag_teal'],
	games: ['arcade_cabinet', 'plant_snake', 'gaming_chair', 'beanbag_coral'],
	server: ['server_rack', 'filing_cabinet', 'recycle_bins'],
	reception: ['plant_monstera', 'umbrella_stand', 'coat_rack', 'armchair', 'plant_fiddle'],
	meetup: ['floor_lamp', 'plant_monstera', 'coat_rack'],
	desks: ['filing_cabinet', 'plant_monstera', 'whiteboard', 'water_cooler'],
};

function blockedShare(ctx: RoomCtx) {
	let blocked = 0;
	for (let y = ctx.y0; y <= ctx.y1; y++)
		for (let x = ctx.x0; x <= ctx.x1; x++) if (ctx.grid.blocked[cellIndex(x, y)]) blocked++;
	return blocked / (ctx.w * ctx.h);
}

/**
 * Big rooms for small zones get little furniture islands, then pieces along the walls, until
 * about a fifth of the floor is furnished, so no room ever looks empty.
 */
export function fillSpace(ctx: RoomCtx) {
	const kinds = FILLERS[ctx.kind as ZoneKind];
	if (!kinds || ctx.w * ctx.h < 24) return;
	const cells = shuffle(
		ctx.rng,
		range(ctx.y0 + 1, ctx.y1 - 1).flatMap((y) => range(ctx.x0, ctx.x1).map((x) => ({ x, y }))),
	);
	let placed = 0;
	for (const { x, y } of cells) {
		if (placed >= 7 || blockedShare(ctx) > 0.3) break;
		const island = ISLANDS[kinds[placed % kinds.length]];
		if (x + island.w - 1 > ctx.x1 || y + island.h > ctx.y1) continue;
		// Keep a ring of free floor around the island (walls count as free: islands may hug them).
		let clear = true;
		for (let dy = -1; dy <= island.h && clear; dy++)
			for (let dx = -1; dx <= island.w; dx++) {
				if (!ctx.inRoom(x + dx, y + dy)) continue;
				const i = cellIndex(x + dx, y + dy);
				if (ctx.grid.blocked[i] || ctx.keepClear.has(i)) clear = false;
			}
		if (clear && ctx.place(island.make(ctx, x, y))) placed++;
	}
	const wall = WALL_FILL[ctx.kind];
	for (let round = 0; wall && round < 4 && blockedShare(ctx) < 0.2; round++) ctx.scatter(wall, 3);
}
