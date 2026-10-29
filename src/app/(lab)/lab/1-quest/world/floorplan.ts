import { randInt, rngFor, shuffle, type Rng } from './random';
import {
	optionalZones,
	requiredZones,
	WORLD_HEIGHT,
	WORLD_WIDTH,
	type ZoneKind,
} from './schema';

/*
 * The floorplan: pure geometry from the seed alone, so it exists before the brief arrives.
 *
 * The building is not a box. Its outline is the grid minus a corner notch or two (an L, a T, a
 * Z, a bar with wings) or a courtyard bitten out of the north side, split into a few column
 * rectangles. Rooms come from a treemap inside each column: a list of target areas is split in
 * two halves of similar total area, the rectangle is cut along its longer side in the same
 * ratio, and so on down to single rooms. Sometimes a two-tile hall runs along one of the cuts.
 * Doors join rooms along a random spanning tree of the adjacency graph (preferring the hall),
 * plus a few extra loops.
 *
 * A seed lays out a couple of dozen candidates and keeps the one that breaks the fewest office
 * rules: rooms near their zone's typical size and never long slivers, the open space clearly
 * the biggest room, a reception on the street side, nothing else oversized. The five required
 * zones get their rooms here too, so the landmarks exist from the first frame of a generation;
 * optional zones are matched to the rest as the brief streams in.
 *
 * Cells: (x, y) covers [x, x+1] × [y, y+1], y grows southwards (towards the camera). Cells
 * outside the outline belong to no room (roomAt -1).
 */

export const W = WORLD_WIDTH;
export const H = WORLD_HEIGHT;
const MIN_SIDE = 4;

export type Rect = { x: number; y: number; w: number; h: number };
export type RoomShape = Rect & { index: number; hall: boolean };

/**
 * A door on the edge between two rooms. `axis: 'v'` is a vertical edge at column x (between
 * cells x-1 and x) on row y; `axis: 'h'` is a horizontal edge at row y (between rows y-1 and y)
 * on column x.
 */
export type Door = { axis: 'h' | 'v'; x: number; y: number; rooms: [number, number] };

export type Floorplan = {
	seed: number;
	/** The building's outline as rectangles that tile it exactly. */
	footprint: Rect[];
	/** 1 for every cell inside the building. */
	inside: Uint8Array;
	/** Floor tiles per unit of ZONE_AREA share, so zone sizes scale with the building. */
	unit: number;
	rooms: RoomShape[];
	doors: Door[];
	/** Shared boundary length between two rooms, by `a-b` with a < b. */
	shared: Map<string, number>;
	degree: number[];
	/** Rooms of the required zones. */
	reserved: Record<(typeof requiredZones)[number], number>;
	/** The front door: `w` cells of the reception's south wall, the horizontal edge at row `y`. */
	entrance: { x: number; y: number; w: number };
	/** How badly the chosen layout breaks the house rules (0 = not at all); for reviews. */
	penalty: number;
};

/** Typical share of the floor for each zone; the treemap and the matcher both use it. */
export const ZONE_AREA: Record<ZoneKind, number> = {
	desks: 0.2,
	meetup: 0.11,
	reception: 0.07,
	library: 0.065,
	server: 0.045,
	coffee: 0.06,
	kitchen: 0.07,
	lounge: 0.065,
	games: 0.07,
	meeting: 0.06,
	phone: 0.035,
	print: 0.04,
	garden: 0.06,
};

/**
 * How far past its typical size a zone may grow. A company never makes the game corner or the
 * lounge its biggest room, and a phone-booth room the size of a gym looks wrong, so leisure and
 * service rooms stay modest; the open space has no cap and always takes the biggest room.
 */
export const ZONE_STRETCH: Record<ZoneKind, number> = {
	desks: Infinity,
	meetup: 1.5,
	reception: 1.5,
	library: 1.5,
	server: 1.5,
	coffee: 1.4,
	kitchen: 1.5,
	lounge: 1.35,
	games: 1.35,
	meeting: 1.3,
	phone: 1.25,
	print: 1.25,
	garden: 1.5,
};

/** Zones for downtime; an office has at most two of them (see assignZones). */
export const LEISURE_ZONES = new Set<ZoneKind>(['games', 'lounge', 'garden']);
export const MAX_LEISURE = 2;

/** Zones that are walled off; the others flow into each other as open plan. */
export const CLOSED_ZONES = new Set<ZoneKind>(['library', 'server', 'meeting', 'phone', 'print']);
export const GLASS_ZONES = new Set<ZoneKind>(['meeting', 'phone']);

export const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

// ---------------------------------------------------------------------------------------------
// Outline

export const OUTLINES = ['rect', 'L', 'T', 'bar', 'Z', 'U'] as const;
export type Outline = (typeof OUTLINES)[number];
const OUTLINE_WEIGHTS: Record<Outline, number> = { rect: 0.08, L: 0.34, T: 0.16, bar: 0.14, Z: 0.16, U: 0.12 };

function pickOutline(seed: number): Outline {
	let roll = rngFor(seed, 'outline')();
	for (const kind of OUTLINES) {
		roll -= OUTLINE_WEIGHTS[kind];
		if (roll < 0) return kind;
	}
	return 'L';
}

/** Column rectangles of the building, west to east; each column spans one range of rows. */
function outline(kind: Outline, rng: Rng): Rect[] {
	const wing = () => randInt(rng, 8, 11);
	const bite = () => randInt(rng, 6, 9);
	const col = (x: number, w: number, top: number, bottom: number): Rect => ({ x, y: top, w, h: bottom - top });
	switch (kind) {
		case 'rect':
			return [col(0, W, 0, H)];
		case 'L': {
			const w = wing();
			const d = bite();
			const corner = randInt(rng, 0, 3);
			// 0 NE, 1 NW, 2 SE, 3 SW.
			if (corner === 0) return [col(0, W - w, 0, H), col(W - w, w, d, H)];
			if (corner === 1) return [col(0, w, d, H), col(w, W - w, 0, H)];
			if (corner === 2) return [col(0, W - w, 0, H), col(W - w, w, 0, H - d)];
			return [col(0, w, 0, H - d), col(w, W - w, 0, H)];
		}
		case 'T':
		case 'bar':
		case 'Z': {
			const wl = wing();
			const wr = wing();
			const dl = bite();
			const dr = bite();
			// T: both south corners gone; bar: both north corners; Z: one north, one south.
			const flip = rng() < 0.5;
			const leftNorth = kind === 'bar' || (kind === 'Z' && flip);
			const rightNorth = kind === 'bar' || (kind === 'Z' && !flip);
			return [
				leftNorth ? col(0, wl, dl, H) : col(0, wl, 0, H - dl),
				col(wl, W - wl - wr, 0, H),
				rightNorth ? col(W - wr, wr, dr, H) : col(W - wr, wr, 0, H - dr),
			];
		}
		case 'U': {
			const wm = randInt(rng, 8, 11);
			const wl = randInt(rng, 9, W - wm - 9);
			return [col(0, wl, 0, H), col(wl, wm, bite(), H), col(wl + wm, W - wl - wm, 0, H)];
		}
	}
}

/** Shares the target areas out over the outline's columns, in order, by column size. */
function distribute(parts: Rect[], areas: number[]): number[][] {
	const total = areas.reduce((s, a) => s + a, 0);
	const floor = parts.reduce((s, p) => s + p.w * p.h, 0);
	const out: number[][] = [];
	let i = 0;
	let want = 0;
	let have = 0;
	parts.forEach((part, k) => {
		const left = parts.length - k - 1;
		want += ((part.w * part.h) / floor) * total;
		const chunk: number[] = [];
		// Take areas while that brings the running total closer to this column's share.
		while (i < areas.length - left) {
			const next = have + areas[i];
			if (chunk.length && Math.abs(next - want) > Math.abs(have - want)) break;
			chunk.push(areas[i]);
			have = next;
			i++;
		}
		if (k === parts.length - 1) while (i < areas.length) chunk.push(areas[i++]);
		out.push(chunk);
	});
	return out;
}

// ---------------------------------------------------------------------------------------------
// Treemap

type Node = { rect: Rect; hall?: boolean };

/** `hall.depth`: the depth of the one cut that gets a hall alongside it (-1 for none). */
function splitRooms(
	rect: Rect,
	areas: number[],
	rng: Rng,
	hall: { depth: number },
	depth = 0,
): Node[] {
	if (areas.length === 1) return [{ rect }];
	const total = areas.reduce((sum, a) => sum + a, 0);
	// Contiguous split of the list closest to half the area, with a little wobble.
	let best = 1;
	let bestScore = Infinity;
	let running = 0;
	for (let k = 1; k < areas.length; k++) {
		running += areas[k - 1];
		const score = Math.abs(running / total - 0.5) + rng() * 0.08;
		if (score < bestScore) [best, bestScore] = [k, score];
	}
	const left = areas.slice(0, best);
	const right = areas.slice(best);
	const share = left.reduce((sum, a) => sum + a, 0) / total;

	const aspect = rect.w / rect.h;
	const vertical = aspect > 1.2 ? true : aspect < 0.83 ? false : rng() < 0.5;
	const width = depth === hall.depth ? 2 : 0;
	const len = (vertical ? rect.w : rect.h) - width;
	if (len < MIN_SIDE * 2) {
		// Too narrow to cut: the whole rectangle becomes one room.
		return [{ rect }];
	}
	const cut = Math.min(len - MIN_SIDE, Math.max(MIN_SIDE, Math.round(len * share)));
	const a: Rect = vertical
		? { x: rect.x, y: rect.y, w: cut, h: rect.h }
		: { x: rect.x, y: rect.y, w: rect.w, h: cut };
	const b: Rect = vertical
		? { x: rect.x + cut + width, y: rect.y, w: rect.w - cut - width, h: rect.h }
		: { x: rect.x, y: rect.y + cut + width, w: rect.w, h: rect.h - cut - width };
	if (width) hall.depth = -1;
	const nodes = [
		...splitRooms(a, left, rng, hall, depth + 1),
		...splitRooms(b, right, rng, hall, depth + 1),
	];
	if (width)
		nodes.push({
			rect: vertical
				? { x: rect.x + cut, y: rect.y, w: width, h: rect.h }
				: { x: rect.x, y: rect.y + cut, w: rect.w, h: width },
			hall: true,
		});
	return nodes;
}

// ---------------------------------------------------------------------------------------------
// Adjacency and doors

type Shared = { a: number; b: number; axis: 'h' | 'v'; at: number; from: number; to: number };

function sharedEdges(rooms: RoomShape[]): Shared[] {
	const out: Shared[] = [];
	for (const a of rooms)
		for (const b of rooms) {
			if (a.index >= b.index) continue;
			const vertical = a.x + a.w === b.x ? b.x : b.x + b.w === a.x ? a.x : null;
			if (vertical !== null) {
				const from = Math.max(a.y, b.y);
				const to = Math.min(a.y + a.h, b.y + b.h);
				if (to > from) out.push({ a: a.index, b: b.index, axis: 'v', at: vertical, from, to });
			}
			const horizontal = a.y + a.h === b.y ? b.y : b.y + b.h === a.y ? a.y : null;
			if (horizontal !== null) {
				const from = Math.max(a.x, b.x);
				const to = Math.min(a.x + a.w, b.x + b.w);
				if (to > from)
					out.push({ a: a.index, b: b.index, axis: 'h', at: horizontal, from, to });
			}
		}
	return out;
}

function doorOn(edge: Shared, rng: Rng): Door {
	const len = edge.to - edge.from;
	// Keep doors off the corners when the wall is long enough.
	const pad = len >= 3 ? 1 : 0;
	const along = edge.from + pad + Math.floor(rng() * (len - pad * 2));
	return edge.axis === 'v'
		? { axis: 'v', x: edge.at, y: along, rooms: [edge.a, edge.b] }
		: { axis: 'h', x: along, y: edge.at, rooms: [edge.a, edge.b] };
}

function connectRooms(rooms: RoomShape[], rng: Rng) {
	const edges = sharedEdges(rooms);
	const parent = rooms.map((r) => r.index);
	const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
	const weighted = edges
		.map((edge) => {
			const hall = rooms[edge.a].hall || rooms[edge.b].hall;
			const len = edge.to - edge.from;
			return { edge, weight: rng() - (hall ? 0.8 : 0) + (len < 3 ? 1 : 0) };
		})
		.sort((p, q) => p.weight - q.weight);
	const doors: Door[] = [];
	const loops: Shared[] = [];
	for (const { edge } of weighted) {
		const ra = find(edge.a);
		const rb = find(edge.b);
		if (ra !== rb) {
			parent[ra] = rb;
			doors.push(doorOn(edge, rng));
		} else if (edge.to - edge.from >= 4) loops.push(edge);
	}
	for (const edge of loops) if (rng() < 0.3) doors.push(doorOn(edge, rng));
	// Bypasses: wherever one room is the only way through to others, a door between its
	// neighbours (where they share a wall) gives a way round, so walled-off zones can sit in
	// dead ends and nobody cuts through a meeting to get coffee.
	for (let pass = 0; pass < rooms.length; pass++) {
		const cut = [...passageRooms({ rooms, doors })];
		const bypass = edges.find((e) => {
			if (doors.some((d) => d.rooms.includes(e.a) && d.rooms.includes(e.b))) return false;
			return cut.some((v) => e.a !== v && e.b !== v && !linked({ rooms, doors }, e.a, e.b, v));
		});
		if (!bypass) break;
		doors.push(doorOn(bypass, rng));
	}
	const shared = new Map(edges.map((e) => [pairKey(e.a, e.b), e.to - e.from]));
	return { doors, shared };
}

// ---------------------------------------------------------------------------------------------
// Matching zones to rooms

export type RoomFacts = {
	area: number;
	degree: number;
	/** The room's north or south wall is (at least partly) an outside wall. */
	north: boolean;
	south: boolean;
	hall: boolean;
	centre: number;
	unit: number;
	/** Other rooms can only be reached through this one: no place for a walled-off zone. */
	passage: boolean;
};

type PlanShape = Pick<Floorplan, 'rooms' | 'degree' | 'inside' | 'unit' | 'doors'>;

/** Rooms reachable from `from` through doors without entering room `skip`. */
function reach(plan: Pick<Floorplan, 'rooms' | 'doors'>, from: number, skip: number) {
	const seen = new Set<number>([from]);
	const queue = [from];
	while (queue.length) {
		const i = queue.pop()!;
		for (const d of plan.doors) {
			if (!d.rooms.includes(i)) continue;
			const j = d.rooms[0] === i ? d.rooms[1] : d.rooms[0];
			if (j === skip || seen.has(j)) continue;
			seen.add(j);
			queue.push(j);
		}
	}
	return seen;
}

const linked = (plan: Pick<Floorplan, 'rooms' | 'doors'>, a: number, b: number, skip: number) =>
	reach(plan, a, skip).has(b);

/** Rooms that are the only way through to some other room (cut vertices of the door graph). */
function passageRooms(plan: Pick<Floorplan, 'rooms' | 'doors'>) {
	const out = new Set<number>();
	for (const skip of plan.rooms) {
		const start = plan.rooms.find((r) => r.index !== skip.index)!.index;
		if (reach(plan, start, skip.index).size < plan.rooms.length - 1) out.add(skip.index);
	}
	return out;
}

const isInside = (inside: Uint8Array, x: number, y: number) =>
	x >= 0 && y >= 0 && x < W && y < H && inside[y * W + x] === 1;

/** Columns of the room's south wall that face the street. */
export function streetSide(plan: Pick<Floorplan, 'inside'>, r: Rect) {
	const out: number[] = [];
	for (let x = r.x; x < r.x + r.w; x++) if (!isInside(plan.inside, x, r.y + r.h)) out.push(x);
	return out;
}

export function roomFacts(plan: PlanShape, index: number): RoomFacts {
	const r = plan.rooms[index];
	let north = false;
	for (let x = r.x; x < r.x + r.w; x++) if (!isInside(plan.inside, x, r.y - 1)) north = true;
	return {
		area: r.w * r.h,
		degree: plan.degree[index],
		north,
		south: streetSide(plan, r).length >= 3,
		hall: r.hall,
		centre: Math.abs(r.x + r.w / 2 - W / 2) / W,
		unit: plan.unit,
		passage: passageRooms(plan).has(index),
	};
}

/** Lower is better. Walled-off zones prefer dead ends; reception needs the street side. */
export function zoneCost(kind: ZoneKind, room: RoomFacts) {
	if (room.hall) return Infinity;
	const target = ZONE_AREA[kind] * room.unit;
	let cost = Math.abs(Math.log(room.area / target)) * 2;
	// Past its cap a zone looks lost in its room: only as a last resort.
	const cap = target * ZONE_STRETCH[kind];
	if (room.area > cap) cost += 8 + Math.log(room.area / cap) * 8;
	// Far below it there is no room for the zone's furniture (a kitchen in a broom cupboard).
	if (room.area < target / 1.7) cost += 6;
	// Nobody walks through the server room or a meeting to get to the kitchen.
	if (CLOSED_ZONES.has(kind)) cost += Math.max(0, room.degree - 1) * 0.7 + (room.passage ? 6 : 0);
	else cost -= Math.min(room.degree, 4) * 0.08;
	switch (kind) {
		case 'reception':
			cost += (room.south ? 0 : 20) + room.centre;
			break;
		case 'desks':
			cost -= room.north ? 0.6 : 0;
			break;
		case 'server':
		case 'phone':
			cost += room.south ? 0.6 : 0;
			break;
		case 'meetup':
			cost += room.south ? 0.4 : 0;
			break;
	}
	return cost;
}

/** Zones without a landmark that an office may have twice: a second meeting room. */
export const DOUBLE_ZONES: readonly ZoneKind[] = ['meeting'];

function bestRoom(kind: ZoneKind, plan: PlanShape, taken: Set<number>) {
	let best = -1;
	let bestCost = Infinity;
	for (const room of plan.rooms) {
		if (taken.has(room.index)) continue;
		const cost = zoneCost(kind, roomFacts(plan, room.index));
		if (cost < bestCost) [best, bestCost] = [room.index, cost];
	}
	return best;
}

// ---------------------------------------------------------------------------------------------

/** How many rooms are left for optional zones, for the prompt. */
export function optionalRoomCount(plan: Floorplan) {
	return plan.rooms.filter((r) => !r.hall).length - requiredZones.length;
}

const cache = new Map<number, Floorplan>();
/** Candidate layouts per seed; the one breaking the fewest rules wins. */
const CANDIDATES = 24;

/** One candidate layout for the seed, scored: 0 follows every rule, higher is worse. */
function candidate(seed: number, attempt: number): { plan: Floorplan; penalty: number } {
	const rng = rngFor(seed, 'floor', attempt);
	const footprint = outline(pickOutline(seed), rng);
	const inside = new Uint8Array(W * H);
	for (const p of footprint)
		for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) inside[y * W + x] = 1;
	const floor = footprint.reduce((s, p) => s + p.w * p.h, 0);

	const extra = randInt(rngFor(seed, 'zones'), 4, 6);
	const optional = shuffle(rngFor(seed, 'zones', 'pick'), optionalZones).slice(0, extra);
	const kinds = shuffle(rng, [...requiredZones, ...optional]);
	const areas = kinds.map((kind) => ZONE_AREA[kind] * (0.9 + rng() * 0.2));
	const unit = floor / areas.reduce((s, a) => s + a, 0);

	// A hall along one cut of the biggest column, now and then.
	const biggest = footprint.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
	const roll = rng();
	const nodes = distribute(footprint, areas).flatMap((chunk, k) =>
		splitRooms(footprint[k], chunk, rng, { depth: footprint[k] === biggest && roll < 0.45 ? (roll < 0.25 ? 0 : 1) : -1 }),
	);
	const rooms: RoomShape[] = nodes.map((node, index) => ({ ...node.rect, index, hall: node.hall === true }));
	const { doors, shared } = connectRooms(rooms, rng);
	const degree = rooms.map((r) => doors.filter((d) => d.rooms.includes(r.index)).length);
	const shape = { rooms, degree, inside, unit, doors };

	// Required zones: reception on the street, then the open space in the biggest room left.
	const taken = new Set<number>();
	const reserved = {} as Floorplan['reserved'];
	reserved.reception = bestRoom('reception', shape, taken);
	taken.add(reserved.reception);
	reserved.desks = rooms
		.filter((r) => !r.hall && !taken.has(r.index))
		.reduce((a, b) => (b.w * b.h > a.w * a.h || (b.w * b.h === a.w * a.h && roomFacts(shape, b.index).north) ? b : a)).index;
	taken.add(reserved.desks);
	for (const kind of ['meetup', 'library', 'server'] as const) {
		reserved[kind] = bestRoom(kind, shape, taken);
		taken.add(reserved[kind]);
	}

	const lobby = rooms[reserved.reception];
	const street = streetSide({ inside }, lobby);
	const door = street.length ? street[Math.max(0, Math.floor(street.length / 2) - 1)] : lobby.x;
	const plan: Floorplan = {
		seed,
		footprint,
		inside,
		unit,
		rooms,
		doors,
		shared,
		degree,
		reserved,
		entrance: { x: door, y: lobby.y + lobby.h, w: Math.min(2, Math.max(1, street.length)) },
		penalty: 0,
	};

	// Score it against the house rules.
	let penalty = 0;
	const real = rooms.filter((r) => !r.hall);
	penalty += (kinds.length - real.length) * 8;
	const area = (i: number) => rooms[i].w * rooms[i].h;
	for (const r of real) {
		const aspect = Math.max(r.w, r.h) / Math.min(r.w, r.h);
		if (aspect > 2) penalty += (aspect - 2) * 8;
	}
	if (!roomFacts(shape, reserved.reception).south) penalty += 50;
	// The open space is the heart of the office: clearly the biggest room, a quarter of the floor.
	const others = real.filter((r) => r.index !== reserved.desks).map((r) => area(r.index));
	const second = Math.max(...others);
	if (second >= area(reserved.desks)) penalty += 12;
	else if (area(reserved.desks) < second * 1.5) penalty += 3;
	if (area(reserved.desks) < 0.24 * floor) penalty += 4;
	// Anything else bigger than any zone may grow (the meetup aside) would end up half empty.
	for (const r of real)
		if (r.index !== reserved.desks && r.index !== reserved.meetup && area(r.index) > 0.12 * floor) penalty += 4;
	// Walled-off required rooms are dead ends, never the way through to somewhere else.
	for (const kind of ['library', 'server'] as const) if (passageRooms(shape).has(reserved[kind])) penalty += 6;
	// Required zones near their typical size.
	for (const kind of ['reception', 'meetup', 'library', 'server'] as const) {
		const cost = zoneCost(kind, roomFacts(shape, reserved[kind]));
		if (cost > 4) penalty += cost - 4;
	}
	// Every room joined into one building.
	const parent = rooms.map((r) => r.index);
	const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
	for (const d of doors) parent[find(d.rooms[0])] = find(d.rooms[1]);
	if (new Set(rooms.map((r) => find(r.index))).size > 1) penalty += 100;
	plan.penalty = Math.round(penalty * 10) / 10;
	return { plan, penalty };
}

export function planFloor(seed: number): Floorplan {
	const hit = cache.get(seed);
	if (hit) return hit;
	let best: { plan: Floorplan; penalty: number } | null = null;
	// A second batch only for seeds whose first batch still breaks a rule.
	for (let attempt = 0; attempt < CANDIDATES * 2 && !(attempt >= CANDIDATES && best!.penalty === 0); attempt++) {
		const next = candidate(seed, attempt);
		if (!best || next.penalty < best.penalty) best = next;
		if (best.penalty === 0) break;
	}
	const plan = best!.plan;
	if (cache.size > 64) cache.clear();
	cache.set(seed, plan);
	return plan;
}

/**
 * Which zone each room holds. Required zones sit in their reserved rooms (revealed once the
 * brief names them, or at the end); optional zones take the best free room in brief order, so
 * a longer brief never moves a zone that is already on screen. A brief asking for more than two
 * leisure zones (games, lounge, garden) gets the first two: an office is a place of work.
 * Leftover rooms get unused optional zones when the brief is complete, work zones first once
 * the leisure quota is full.
 */
export function assignZones(plan: Floorplan, named: ZoneKind[], final: boolean) {
	const kinds: (ZoneKind | null)[] = plan.rooms.map(() => null);
	const revealed: boolean[] = plan.rooms.map((r) => r.hall);
	const order: number[] = plan.rooms.map(() => -1);
	const taken = new Set<number>(Object.values(plan.reserved));
	const required = new Set<ZoneKind>(requiredZones);
	const leisure = () => kinds.filter((k) => k && LEISURE_ZONES.has(k)).length;
	let step = 0;
	for (const kind of named) {
		let room: number;
		if (required.has(kind)) room = plan.reserved[kind as keyof Floorplan['reserved']];
		else {
			if (LEISURE_ZONES.has(kind) && leisure() >= MAX_LEISURE) continue;
			room = bestRoom(kind, plan, taken);
			if (room < 0) continue;
			taken.add(room);
		}
		kinds[room] = kind;
		revealed[room] = true;
		order[room] = step++;
	}
	if (final) {
		for (const kind of requiredZones) {
			const room = plan.reserved[kind];
			if (kinds[room]) continue;
			kinds[room] = kind;
			revealed[room] = true;
			order[room] = step++;
		}
		const unused: ZoneKind[] = optionalZones.filter((kind) => !kinds.includes(kind));
		// Now and then, with rooms to spare, an office doubles up on a zone it likes (a second
		// meeting room or booth room) instead of filling the last room with one more kind.
		const leftovers = plan.rooms.filter((r) => !r.hall && !kinds[r.index]);
		const twin = leftovers.length >= 2 && rngFor(plan.seed, 'double')() < 0.4 ? leftovers.at(-1)!.index : -1;
		for (const room of plan.rooms) {
			if (room.hall || kinds[room.index]) continue;
			const facts = roomFacts(plan, room.index);
			const doubles = DOUBLE_ZONES.filter((kind) => kinds.includes(kind));
			const cheapest = (list: readonly ZoneKind[]) =>
				list.reduce((a, b) => (zoneCost(b, facts) < zoneCost(a, facts) ? b : a));
			if (room.index === twin && doubles.length) {
				kinds[room.index] = cheapest(doubles);
				revealed[room.index] = true;
				order[room.index] = step++;
				continue;
			}
			const open = unused.filter((kind) => !LEISURE_ZONES.has(kind) || leisure() < MAX_LEISURE);
			const kind = open.length ? cheapest(open) : cheapest(DOUBLE_ZONES);
			if (unused.includes(kind)) unused.splice(unused.indexOf(kind), 1);
			kinds[room.index] = kind;
			revealed[room.index] = true;
			order[room.index] = step++;
		}
	}
	return { kinds, revealed, order };
}
