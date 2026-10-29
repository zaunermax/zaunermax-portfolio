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
 * The building fills the grid. Rooms come from a treemap: a list of target areas is split in
 * two halves of similar total area, the rectangle is cut along its longer side in the same
 * ratio, and so on down to single rooms. Sometimes a two-tile hall runs along one of the cuts.
 * Doors join rooms along a random spanning tree of the adjacency graph (preferring the hall),
 * plus a few extra loops. The five required zones get their rooms here too, so the landmarks
 * exist from the first frame of a generation; optional zones are matched to the rest as the
 * brief streams in.
 *
 * Cells: (x, y) covers [x, x+1] × [y, y+1], y grows southwards (towards the camera).
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
	rooms: RoomShape[];
	doors: Door[];
	/** Shared boundary length between two rooms, by `a-b` with a < b. */
	shared: Map<string, number>;
	degree: number[];
	/** Rooms of the required zones. */
	reserved: Record<(typeof requiredZones)[number], number>;
	/** The front door: two cells of the reception's south wall (axis 'h', y = H). */
	entrance: { x: number; w: number };
};

/** Typical share of the floor for each zone; the treemap and the matcher both use it. */
export const ZONE_AREA: Record<ZoneKind, number> = {
	desks: 0.2,
	meetup: 0.12,
	reception: 0.07,
	library: 0.07,
	server: 0.045,
	coffee: 0.065,
	kitchen: 0.07,
	lounge: 0.075,
	games: 0.09,
	meeting: 0.06,
	phone: 0.035,
	print: 0.04,
	garden: 0.06,
};

/** Zones that are walled off; the others flow into each other as open plan. */
export const CLOSED_ZONES = new Set<ZoneKind>(['library', 'server', 'meeting', 'phone', 'print']);
export const GLASS_ZONES = new Set<ZoneKind>(['meeting', 'phone']);

export const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

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
	const shared = new Map(edges.map((e) => [pairKey(e.a, e.b), e.to - e.from]));
	return { doors, shared };
}

// ---------------------------------------------------------------------------------------------
// Matching zones to rooms

export type RoomFacts = {
	area: number;
	degree: number;
	north: boolean;
	south: boolean;
	hall: boolean;
	centre: number;
};

export function roomFacts(plan: Pick<Floorplan, 'rooms' | 'degree'>, index: number): RoomFacts {
	const r = plan.rooms[index];
	return {
		area: r.w * r.h,
		degree: plan.degree[index],
		north: r.y === 0,
		south: r.y + r.h === H,
		hall: r.hall,
		centre: Math.abs(r.x + r.w / 2 - W / 2) / W,
	};
}

/** Lower is better. Walled-off zones prefer dead ends; reception needs the street side. */
export function zoneCost(kind: ZoneKind, room: RoomFacts) {
	if (room.hall) return Infinity;
	const target = ZONE_AREA[kind] * W * H;
	let cost = Math.abs(Math.log(room.area / target)) * 2;
	if (CLOSED_ZONES.has(kind)) cost += Math.max(0, room.degree - 1) * 0.7;
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

/** Zones without a landmark that an office may have twice. */
export const DOUBLE_ZONES: readonly ZoneKind[] = ['meeting', 'lounge', 'phone', 'coffee', 'games'];

function bestRoom(kind: ZoneKind, plan: Pick<Floorplan, 'rooms' | 'degree'>, taken: Set<number>) {
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

export function planFloor(seed: number): Floorplan {
	const hit = cache.get(seed);
	if (hit) return hit;
	const rng = rngFor(seed, 'floor');
	const extra = randInt(rng, 5, 7);
	const optional = shuffle(rng, optionalZones).slice(0, extra);
	const areas = shuffle(rng, [...requiredZones, ...optional]).map(
		(kind) => ZONE_AREA[kind] * (0.85 + rng() * 0.3),
	);
	const roll = rng();
	const hall = { depth: roll < 0.4 ? 0 : roll < 0.7 ? 1 : -1 };
	const nodes = splitRooms({ x: 0, y: 0, w: W, h: H }, areas, rng, hall);
	const rooms: RoomShape[] = nodes.map((node, index) => ({
		...node.rect,
		index,
		hall: node.hall === true,
	}));
	const { doors, shared } = connectRooms(rooms, rng);
	const degree = rooms.map((r) => doors.filter((d) => d.rooms.includes(r.index)).length);

	const taken = new Set<number>();
	const reserved = {} as Floorplan['reserved'];
	for (const kind of ['reception', 'desks', 'meetup', 'library', 'server'] as const) {
		reserved[kind] = bestRoom(kind, { rooms, degree }, taken);
		taken.add(reserved[kind]);
	}
	const lobby = rooms[reserved.reception];
	const entranceX = lobby.x + Math.max(0, Math.floor(lobby.w / 2) - 1);

	const plan: Floorplan = {
		seed,
		rooms,
		doors,
		shared,
		degree,
		reserved,
		entrance: { x: entranceX, w: Math.min(2, lobby.w) },
	};
	if (cache.size > 64) cache.clear();
	cache.set(seed, plan);
	return plan;
}

/**
 * Which zone each room holds. Required zones sit in their reserved rooms (revealed once the
 * brief names them, or at the end); optional zones take the best free room in brief order, so
 * a longer brief never moves a zone that is already on screen. Leftover rooms get unused
 * optional zones when the brief is complete.
 */
export function assignZones(plan: Floorplan, named: ZoneKind[], final: boolean) {
	const kinds: (ZoneKind | null)[] = plan.rooms.map(() => null);
	const revealed: boolean[] = plan.rooms.map((r) => r.hall);
	const order: number[] = plan.rooms.map(() => -1);
	const taken = new Set<number>(Object.values(plan.reserved));
	const required = new Set<ZoneKind>(requiredZones);
	let step = 0;
	for (const kind of named) {
		let room: number;
		if (required.has(kind)) room = plan.reserved[kind as keyof Floorplan['reserved']];
		else {
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
		const unused = optionalZones.filter((kind) => !kinds.includes(kind));
		// Now and then, with rooms to spare, an office doubles up on a zone it likes (a second
		// meeting room, another lounge) instead of filling the last room with one more kind.
		const leftovers = plan.rooms.filter((r) => !r.hall && !kinds[r.index]);
		const twin = leftovers.length >= 2 && rngFor(plan.seed, 'double')() < 0.4 ? leftovers.at(-1)!.index : -1;
		for (const room of plan.rooms) {
			if (room.hall || kinds[room.index]) continue;
			const facts = roomFacts(plan, room.index);
			const doubles = DOUBLE_ZONES.filter((kind) => kinds.includes(kind));
			if (room.index === twin && doubles.length) {
				kinds[room.index] = doubles.reduce((a, b) => (zoneCost(b, facts) < zoneCost(a, facts) ? b : a));
				revealed[room.index] = true;
				order[room.index] = step++;
				continue;
			}
			const kind = unused.length
				? unused.reduce((a, b) => (zoneCost(b, facts) < zoneCost(a, facts) ? b : a))
				: 'garden';
			unused.splice(unused.indexOf(kind), 1);
			kinds[room.index] = kind;
			revealed[room.index] = true;
			order[room.index] = step++;
		}
	}
	return { kinds, revealed, order };
}
