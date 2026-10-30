import { balanceLooks, isPerson, randomLook, skinTones } from './appearance';
import type { Face } from './character-parts';
import { ASSETS, COFFEE_TABLE_TOP, COUNTER_TOP, DESK_TOP, TABLE_TOP, type AssetId, type CharacterId } from './catalog';
import {
	assignZones,
	CLOSED_ZONES,
	GLASS_ZONES,
	H,
	planFloor,
	W,
	type Floorplan,
} from './floorplan';
import {
	cafeTables,
	cellIndex,
	EVENT_AUDIENCE,
	FACE,
	fillSpace,
	HALL_STYLES,
	hIndex,
	PLACERS,
	planterDivider,
	RoomCtx,
	seatAudience,
	snapSeats,
	stepOpen,
	topHalf,
	vIndex,
	wallDecor,
	type Furnished,
	type Grid,
} from './furnish';
import { pick, rngFor, shuffle, type Rng } from './random';
import { DEFAULT_LANDMARK_NAMES, DEFAULT_ZONE_NAMES } from './sanitize';
import {
	landmarkIds,
	WORLD_VERSION,
	type Activity,
	type Brief,
	type Chatter,
	type EventKind,
	type LandmarkId,
	type ZoneKind,
} from './schema';
import {
	CAMERA_YAW,
	EDGE,
	PASSABLE_EDGES,
	type Actor,
	type Cell,
	type CompiledWorld,
	type Decor,
	type FloorKind,
	type Furniture,
	type LandmarkEntity,
	type Pose,
	type Room,
	type Spot,
	type SpotKind,
	type Talk,
} from './types';
import { DEFAULT_CHATTER } from './default-world';

/*
 * The compiler: brief + seed in, a fully resolved office out.
 *
 * Pure and deterministic, identical on server and client. The floorplan depends on the seed
 * only; zones, landmarks and people are added in brief order, so compiling a longer prefix of a
 * streaming brief only ever adds to what is already on screen. With `partial`, rooms the brief
 * has not named yet stay bare and nothing is invented; the final compile fills every room,
 * supplies anything the brief left out and adds extras, pets and the event's crowd.
 */

export const GRID_W = W;
export const GRID_H = H;
export type * from './types';

export type CompileOptions = {
	/** Streaming: show what the brief has named so far, nothing more. */
	partial?: boolean;
};

const ZONE_FLOOR: Record<ZoneKind | 'hall', FloorKind> = {
	reception: 'tile',
	desks: 'carpet',
	meetup: 'cozy',
	library: 'wood',
	server: 'raised',
	coffee: 'wood',
	kitchen: 'checker',
	lounge: 'cozy',
	games: 'carpet',
	meeting: 'wood',
	phone: 'carpet',
	print: 'concrete',
	garden: 'moss',
	hall: 'concrete',
};

const isOpenZone = (kind: Room['kind']) =>
	kind !== null && (kind === 'hall' || !CLOSED_ZONES.has(kind));

// ---------------------------------------------------------------------------------------------
// Walls

/** Style of the boundary between two rooms (or a room and the outside, `b` = null). */
function boundary(a: Room, b: Room | null): number {
	if (!b) return EDGE.wall;
	if (!a.revealed && !b.revealed) return EDGE.none;
	const closed = (r: Room) => r.revealed && r.kind !== null && !isOpenZone(r.kind);
	const glass = (r: Room) => r.revealed && r.kind !== null && GLASS_ZONES.has(r.kind as ZoneKind);
	if (!a.revealed || !b.revealed) {
		const known = a.revealed ? a : b;
		return closed(known) ? (glass(known) ? EDGE.glass : EDGE.wall) : EDGE.none;
	}
	if (!closed(a) && !closed(b)) return EDGE.open;
	return glass(a) || glass(b) ? EDGE.glass : EDGE.wall;
}

function buildEdges(plan: Floorplan, rooms: Room[], roomAt: Int16Array) {
	const hEdge = new Uint8Array((H + 1) * W);
	const vEdge = new Uint8Array(H * (W + 1));
	const windowRng = rngFor(plan.seed, 'windows');
	const period = 3 + Math.floor(windowRng() * 2);
	const offset = Math.floor(windowRng() * period);
	const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? roomAt[cellIndex(x, y)] : -1);
	/** Outside walls: windows at a steady rhythm, solid where privacy matters. */
	const outer = (along: number, room: Room) =>
		room.kind === 'server' || room.kind === 'phone' || (along + offset) % period === 0
			? EDGE.wall
			: EDGE.window;
	const edge = (a: number, b: number, along: number, axis: 'h' | 'v') => {
		if (a === b) return EDGE.none;
		if (a < 0 && b < 0) return EDGE.none;
		// The street side stays solid: the camera looks in from there.
		if (b < 0 && axis === 'h') return EDGE.wall;
		if (a < 0 || b < 0) return outer(along, rooms[a < 0 ? b : a]);
		return boundary(rooms[a], rooms[b]);
	};
	for (let y = 0; y <= H; y++)
		for (let x = 0; x < W; x++) hEdge[hIndex(x, y)] = edge(at(x, y - 1), at(x, y), x, 'h');
	for (let y = 0; y < H; y++)
		for (let x = 0; x <= W; x++) vEdge[vIndex(x, y)] = edge(at(x - 1, y), at(x, y), y + (x === W ? 1 : 0), 'v');
	for (const door of plan.doors) {
		const array = door.axis === 'h' ? hEdge : vEdge;
		const i = door.axis === 'h' ? hIndex(door.x, door.y) : vIndex(door.x, door.y);
		array[i] =
			array[i] === EDGE.wall
				? EDGE.door
				: array[i] === EDGE.glass
					? EDGE.glassdoor
					: array[i] === EDGE.none
						? EDGE.none
						: EDGE.open;
	}
	const { x, y, w } = plan.entrance;
	for (let i = x; i < x + w; i++) hEdge[hIndex(i, y)] = EDGE.entrance;
	return { hEdge, vEdge };
}

/** The two cells either side of each door, and one more inwards where the room allows. */
function doorCells(plan: Floorplan): Cell[] {
	const out: Cell[] = [];
	const inside = (index: number, c: Cell) => {
		const r = plan.rooms[index];
		return c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h;
	};
	for (const d of plan.doors) {
		const step = d.axis === 'h' ? { x: 0, y: 1 } : { x: 1, y: 0 };
		const after = { x: d.x, y: d.y };
		const before = { x: d.x - step.x, y: d.y - step.y };
		for (const [cell, dir] of [
			[before, -1],
			[after, 1],
		] as const) {
			out.push(cell);
			const room = d.rooms.find((index) => inside(index, cell));
			if (room === undefined) continue;
			const r = plan.rooms[room];
			const deeper = { x: cell.x + step.x * dir, y: cell.y + step.y * dir };
			if ((d.axis === 'h' ? r.h : r.w) >= 4 && inside(room, deeper)) out.push(deeper);
		}
	}
	return out;
}

// ---------------------------------------------------------------------------------------------
// People

const ACTIVITY_SPOTS: Record<Activity, SpotKind[]> = {
	typing: ['desk'],
	meeting: ['meeting', 'table', 'seat'],
	chatting: [],
	coffee: ['bar', 'table', 'counter'],
	serving: ['barista', 'counter', 'reception'],
	lounging: ['sofa', 'beanbag', 'seat'],
	gaming: ['game', 'arcade'],
	reading: ['reading', 'shelf', 'seat'],
	presenting: ['speaker'],
	attending: ['audience', 'sofa', 'beanbag'],
	fixing: ['rack', 'printer'],
	greeting: ['reception', 'barista'],
	printing: ['printer'],
	wandering: [],
	napping: ['beanbag', 'sofa', 'seat'],
	calling: ['booth', 'stand'],
};

/** Where a character goes when the brief puts them in a zone this office does not have. */
const HOME_ZONES: Partial<Record<CharacterId, ZoneKind[]>> = {
	max: ['desks'],
	visitor: ['reception'],
	dev_hoodie: ['desks', 'games'],
	dev_glasses: ['desks', 'server', 'library'],
	dev_slacker: ['desks', 'server', 'games'],
	manager: ['meeting', 'desks'],
	designer: ['desks', 'lounge', 'coffee'],
	barista: ['coffee', 'kitchen'],
	intern: ['desks', 'print', 'kitchen'],
	office_dog: ['lounge', 'reception', 'garden', 'desks'],
	office_cat: ['library', 'lounge', 'garden', 'reception'],
	robo_vacuum: ['desks'],
};

const EXTRA_CHARACTERS: CharacterId[] = [
	'dev_hoodie',
	'dev_glasses',
	'dev_slacker',
	'designer',
	'intern',
	'manager',
];

function poseFor(activity: Activity, spot: Spot | null, event: EventKind): Pose {
	if (activity === 'wandering') return 'walk';
	switch (activity) {
		case 'typing':
			return spot?.kind === 'desk' ? 'type' : 'stand';
		case 'chatting':
			return 'chat';
		case 'serving':
			return 'serve';
		case 'gaming':
			return 'play';
		case 'presenting':
			return spot?.kind === 'speaker' ? 'present' : 'chat';
		case 'fixing':
			return event === 'deploy' ? 'panic' : 'serve';
		case 'greeting':
			return 'wave';
		case 'napping':
			return spot?.sit ? 'nap' : 'stand';
		case 'attending':
			return spot?.sit ? 'sit' : 'cheer';
		case 'calling':
			return 'call';
		default:
			return spot?.sit ? 'sit' : 'stand';
	}
}

/** A seat makes anyone a sitter; standing or walking poses on one simply become sitting. */
function seatedPose(pose: Pose, sit: boolean): Pose {
	return sit && (pose === 'stand' || pose === 'walk') ? 'sit' : pose;
}

/** Facing the default camera, give or take, so faces read from the start. */
const towardsCamera = (rng: Rng) => CAMERA_YAW + (rng() - 0.5) * 1.3;

class Crowd {
	private taken = new Set<Spot>();
	private occupied = new Set<number>();
	readonly actors: Actor[] = [];

	constructor(
		private world: Pick<CompiledWorld, 'blocked' | 'roomAt' | 'hEdge' | 'vEdge'>,
		readonly rooms: Room[],
		private spots: Spot[],
		private reserved: Uint8Array,
		/** Cells the visitor can reach; free-standing people only go there. */
		private reach: Uint8Array,
		/** The next skin tone, from a seeded walk through the whole range. */
		readonly skin: () => number,
	) {
		for (const s of spots) if (s.sit) this.occupied.add(cellIndex(Math.floor(s.x), Math.floor(s.y)));
	}

	/** The corridor, if this floorplan has one. */
	hall() {
		return this.rooms.find((r) => r.hall && r.revealed) ?? null;
	}

	/** Whether someone at `cell` could be walked up to. */
	approachable(cell: Cell) {
		return FACE.some((f) => {
			const x = cell.x + f.x;
			const y = cell.y + f.y;
			return inBounds(x, y) && this.reach[cellIndex(x, y)] === 1;
		});
	}

	roomOf(kinds: ZoneKind[]) {
		for (const kind of kinds) {
			const room = this.rooms.find((r) => r.revealed && r.kind === kind);
			if (room) return room;
		}
		return null;
	}

	private people = new Set<number>();

	/** Free spots of these kinds in the room. */
	freeSpots(room: Room, kinds: SpotKind[]) {
		const cell = (s: Spot) => cellIndex(Math.floor(s.x), Math.floor(s.y));
		return this.spots.filter(
			(s) => s.room === room.index && kinds.includes(s.kind) && !this.taken.has(s) && !this.people.has(cell(s)),
		);
	}

	/** All spots of these kinds in the room, taken or not. */
	spotsOf(room: Room, kinds: SpotKind[]) {
		return this.spots.filter((s) => s.room === room.index && kinds.includes(s.kind));
	}

	/**
	 * A free spot of the first kind that has one; the one nearest `near` if given. `apart` keeps
	 * a free seat between people (round a table, sitting shoulder to shoulder reads as one blob).
	 */
	takeSpot(room: Room, kinds: SpotKind[], rng: Rng, near?: { x: number; y: number }, apart = false): Spot | null {
		const cell = (s: Spot) => cellIndex(Math.floor(s.x), Math.floor(s.y));
		const crowded = (s: Spot) =>
			FACE.some((f) => {
				const x = Math.floor(s.x) + f.x;
				const y = Math.floor(s.y) + f.y;
				return inBounds(x, y) && this.people.has(cellIndex(x, y));
			});
		for (const kind of kinds) {
			const free = this.freeSpots(room, [kind]).filter((s) => !apart || !crowded(s));
			if (free.length) {
				const spot = near
					? free.reduce((a, b) =>
							Math.hypot(b.x - near.x, b.y - near.y) < Math.hypot(a.x - near.x, a.y - near.y) ? b : a,
						)
					: pick(rng, free);
				this.taken.add(spot);
				this.people.add(cell(spot));
				return spot;
			}
		}
		return null;
	}

	/** How hemmed in a cell is: walls on its sides and furniture next to it. */
	private crowding(x: number, y: number) {
		const { hEdge, vEdge, blocked } = this.world;
		let n = 0;
		for (const f of FACE) {
			if (!stepOpen(hEdge, vEdge, x, y, f.x, f.y)) n += 2;
			else if (inBounds(x + f.x, y + f.y) && blocked[cellIndex(x + f.x, y + f.y)]) n += 1;
		}
		return n;
	}

	/**
	 * A free floor cell in the room, near `near` when given. Standing people keep off walls and
	 * out of the plants: the least hemmed-in cells win.
	 */
	freeCell(room: Room, rng: Rng, near?: Cell): Cell | null {
		let cells: Cell[] = [];
		let best = Infinity;
		for (let y = room.y; y < room.y + room.h; y++)
			for (let x = room.x; x < room.x + room.w; x++) {
				const i = cellIndex(x, y);
				if (this.world.blocked[i] || this.reserved[i] || this.occupied.has(i) || this.people.has(i) || !this.reach[i])
					continue;
				if (near && Math.abs(near.x - x) + Math.abs(near.y - y) !== 1) continue;
				const score = Math.min(2, this.crowding(x, y));
				if (score < best) [cells, best] = [[], score];
				if (score === best) cells.push({ x, y });
			}
		const cell = cells.length ? pick(rng, cells) : null;
		if (cell) this.people.add(cellIndex(cell.x, cell.y));
		return cell;
	}

	add(actor: Actor) {
		this.actors.push(actor);
		return actor;
	}

	/** Whether someone could stand on this cell: open floor the visitor can reach, nobody there. */
	standable(cell: Cell) {
		if (!inBounds(cell.x, cell.y)) return false;
		const i = cellIndex(cell.x, cell.y);
		return !this.world.blocked[i] && this.reach[i] === 1 && !this.occupied.has(i) && !this.people.has(i);
	}

	claim(cell: Cell) {
		this.people.add(cellIndex(cell.x, cell.y));
	}
}

function castActors(brief: Brief, crowd: Crowd, seed: number, event: EventKind) {
	const rng = rngFor(seed, 'cast');
	/** A chatter per room still waiting for someone to chat with. */
	const lonelyChatter = new Map<number, Actor>();
	brief.cast.forEach((member, index) => {
		const room =
			crowd.roomOf([member.zone, ...(HOME_ZONES[member.character] ?? [])]) ??
			crowd.roomOf(['desks', 'reception']);
		if (!room) return;
		const pet = member.character === 'office_dog' || member.character === 'office_cat';
		const activity: Activity = pet ? 'wandering' : member.activity;
		let spot = pet ? null : crowd.takeSpot(room, ACTIVITY_SPOTS[activity], rng);
		if (!spot && !pet && activity !== 'wandering' && activity !== 'chatting')
			spot = crowd.takeSpot(room, ['stand', 'seat', 'shelf', 'table'], rng);
		let x: number;
		let y: number;
		let heading = towardsCamera(rng);
		let waiting = false;
		if (spot) {
			({ x, y, heading } = spot);
		} else {
			const partner = activity === 'chatting' ? lonelyChatter.get(room.index) : undefined;
			const cell =
				(partner && crowd.freeCell(room, rng, { x: Math.floor(partner.x), y: Math.floor(partner.y) })) ||
				crowd.freeCell(room, rng);
			if (!cell) return;
			x = cell.x + 0.5;
			y = cell.y + 0.5;
			if (partner) {
				heading = Math.atan2(partner.x - x, partner.y - y);
				partner.heading = Math.atan2(x - partner.x, y - partner.y);
				lonelyChatter.delete(room.index);
			} else waiting = activity === 'chatting';
		}
		const actor: Actor = {
			id: `npc-${index}`,
			name: member.name,
			character: member.character,
			x,
			y,
			heading,
			pose: seatedPose(poseFor(activity, spot, event), spot?.sit ?? false),
			elev: spot?.elev ?? 0,
			sit: spot?.sit ?? false,
			room: room.index,
			line: member.line,
			wanders: !spot && (activity === 'wandering' || pet),
			radius: pet ? 4 : 2,
			interactive: true,
			appearance: isPerson(member.character)
				? { ...(member.look ?? randomLook(seed, `cast-${index}`, member.character)), skin: crowd.skin() }
				: null,
		};
		if (waiting) lonelyChatter.set(room.index, actor);
		crowd.add(actor);
	});
}

const EVENT_ROOM: Record<EventKind, ZoneKind[]> = {
	none: [],
	meetup: ['meetup'],
	pingpong: ['games'],
	birthday: ['kitchen', 'coffee', 'lounge'],
	deploy: ['server'],
	hackathon: ['desks'],
};

const DOG_NAMES = ['Biscuit', 'Pixel', 'Waffles', 'Noodle', 'Byte', 'Pretzel', 'Mochi'];

/** Expressions that go with a pose, from the kit's faces. */
const POSE_FACES: Partial<Record<Pose, Face[]>> = {
	nap: ['sleepy'],
	cheer: ['bright', 'wink', 'smile'],
	clap: ['bright', 'smile', 'smile_lines'],
	present: ['bright', 'smile_lines'],
	play: ['wink', 'bright', 'smile'],
	panic: ['bright'],
};

/** How many people come to a meetup, given the seats. */
export function meetupAttendance(seats: number) {
	return Math.max(0, Math.min(22, seats - 2));
}

function extras(crowd: Crowd, seed: number, event: CompiledWorld['event'], hasDog: boolean) {
	const rng = rngFor(seed, 'extras');
	let n = 0;
	const extra = (room: Room, spot: Spot | null, pose: Pose, cell?: Cell | null, heading?: number) => {
		if (!spot && !cell) return;
		const id = `extra-${n++}`;
		const character = pick(rng, EXTRA_CHARACTERS);
		const sit = spot?.sit ?? false;
		const final = seatedPose(pose, sit);
		const look = randomLook(seed, id, character);
		const faces = POSE_FACES[final];
		crowd.add({
			id,
			name: '',
			character,
			x: spot ? spot.x : cell!.x + 0.5,
			y: spot ? spot.y : cell!.y + 0.5,
			heading: spot ? spot.heading : (heading ?? towardsCamera(rng)),
			pose: final,
			elev: spot?.elev ?? 0,
			sit,
			room: room.index,
			line: '',
			wanders: false,
			radius: 0,
			interactive: false,
			appearance: { ...look, ...(faces ? { face: pick(rng, faces) } : {}), skin: crowd.skin() },
		});
	};
	const fill = (
		kinds: ZoneKind[],
		spotKinds: SpotKind[],
		count: number,
		pose: (s: Spot) => Pose,
		near?: (room: Room) => { x: number; y: number } | undefined,
		apart = false,
	) => {
		const room = crowd.roomOf(kinds);
		if (!room) return;
		for (let i = 0; i < count; i++) {
			const spot = crowd.takeSpot(room, spotKinds, rng, near?.(room), apart);
			if (!spot) break;
			extra(room, spot, pose(spot));
		}
	};
	const stageOf = (room: Room) => crowd.spotsOf(room, ['speaker'])[0];
	switch (event?.kind) {
		case 'meetup': {
			fill(['meetup'], ['speaker'], 1, () => 'present');
			// A full house, front rows first: most listen, some cheer or clap.
			const room = crowd.rooms[event.room];
			const seats = crowd.spotsOf(room, ['audience']).length;
			const free = crowd.freeSpots(room, ['audience']).length;
			const want = meetupAttendance(seats) - (seats - free);
			fill(['meetup'], ['audience'], want, () => {
				const r = rng();
				return r < 0.2 ? 'cheer' : r < 0.4 ? 'clap' : 'sit';
			}, stageOf);
			break;
		}
		case 'pingpong':
			fill(['games'], ['game'], 2, () => 'play');
			fill(['games'], ['stand', 'arcade'], 3, () => 'cheer');
			break;
		case 'birthday': {
			const room = crowd.roomOf(EVENT_ROOM.birthday);
			if (room) {
				fill(EVENT_ROOM.birthday, ['table', 'counter'], 4, () => (rng() < 0.5 ? 'cheer' : 'clap'), undefined, true);
				// Two more stand round the party, facing the table rather than the camera.
				const seats = crowd.spotsOf(room, ['table']);
				const table = seats.length
					? { x: seats.reduce((t, s) => t + s.x, 0) / seats.length, y: seats.reduce((t, s) => t + s.y, 0) / seats.length }
					: null;
				for (let i = 0; i < 2; i++) {
					const cell = crowd.freeCell(room, rng);
					const facing = cell && table ? Math.atan2(table.x - cell.x - 0.5, table.y - cell.y - 0.5) : undefined;
					extra(room, null, 'cheer', cell, facing);
				}
			}
			break;
		}
		case 'deploy':
			fill(['server'], ['rack'], 3, () => 'panic');
			break;
		case 'hackathon':
			fill(['desks'], ['desk'], 7, () => 'type');
			break;
	}
	fill(['desks'], ['desk'], 4, () => 'type');
	fill(['coffee', 'kitchen'], ['bar', 'table'], 2, () => (rng() < 0.5 ? 'chat' : 'sit'), undefined, true);
	// A meeting in progress: people round the table, someone presenting at its head.
	fill(['meeting'], ['meeting'], 4, () => (rng() < 0.4 ? 'chat' : 'sit'), undefined, true);
	fill(['meeting'], ['stand'], 1, () => 'present');
	// The lounge and the game corner are never empty.
	fill(['lounge'], ['sofa', 'beanbag'], 2, () => (rng() < 0.5 ? 'chat' : 'sit'));
	if (event?.kind !== 'pingpong') fill(['games'], ['game', 'arcade'], 2, () => 'play');

	const roam = (id: string, name: string, character: CharacterId, line: string, kinds: ZoneKind[], radius: number) => {
		const room = crowd.roomOf(kinds);
		const cell = room && crowd.freeCell(room, rng);
		if (!room || !cell) return;
		crowd.add({
			id,
			name,
			character,
			x: cell.x + 0.5,
			y: cell.y + 0.5,
			heading: rng() * Math.PI * 2,
			pose: 'walk',
			elev: 0,
			sit: false,
			room: room.index,
			line,
			wanders: true,
			radius,
			interactive: true,
			appearance: null,
		});
	};
	if (!hasDog)
		roam('pet-dog', pick(rng, DOG_NAMES), 'office_dog', '*wags tail* Woof! *sniffs your shoes*', ['lounge', 'reception', 'desks'], 4);
	roam('pet-robo', 'Dustin', 'robo_vacuum', '*bonk* Recalculating route… *bonk*', ['desks', 'meetup', 'reception'], 6);
}

const VIGNETTE_CAPTIONS = {
	standup: ['Stand-up, minute 47', 'Daily stand-up (sit-down soon)', 'Blocked by: the stand-up'],
	duck: ['Explaining the bug to the duck…', 'The duck has questions', 'Rubber duck, senior reviewer'],
	courier: ['*beep* Oat flat white, desk 4', '*beep* One emergency espresso', '*beep* Coffee for the on-call'],
	printer: ['PC LOAD LETTER?!', 'Printer jam #47 this week', 'Three people, one jam'],
} as const;

type Vignette = keyof typeof VIGNETTE_CAPTIONS;

/**
 * A free place for a rubber duck on the desk tile `desk`, at the front edge towards its owner
 * (who looks along `facing`), wholly on the desk top and clear of every screen, keyboard and
 * mug already there. In practice that is beside a laptop. Cell space, x and z.
 */
function duckSpot(decor: Decor[], desk: Cell, facing: number): { x: number; z: number } | null {
	const boxes = decor
		.filter((d) => d.y === DESK_TOP && Math.abs(d.x - desk.x - 0.5) < 1.5 && Math.abs(d.z - desk.y - 0.5) < 1.5)
		.map((d) => {
			const [hx, hz] = topHalf(d.asset, d.heading);
			return [d.x - hx, d.x + hx, d.z - hz, d.z + hz];
		});
	const [hx, hz] = topHalf('rubber_duck', facing + Math.PI);
	const f = { x: Math.round(Math.sin(facing)), z: Math.round(Math.cos(facing)) };
	for (const side of [0.24, -0.24, 0]) {
		const x = desk.x + 0.5 - f.x * 0.32 - f.z * side;
		const z = desk.y + 0.5 - f.z * 0.32 + f.x * side;
		if (x - hx < desk.x + 0.03 || x + hx > desk.x + 0.97 || z - hz < desk.y + 0.03 || z + hz > desk.y + 0.97) continue;
		if (boxes.some((b) => x - hx < b[1] + 0.02 && x + hx > b[0] - 0.02 && z - hz < b[3] + 0.02 && z + hz > b[2] - 0.02)) continue;
		return { x, z };
	}
	return null;
}

/**
 * Small seeded stories around the office, each with a short caption: a stand-up at the ticket
 * board, someone debugging with a rubber duck, a robot delivering coffee to a desk, a queue at
 * a jammed printer. Two or three per office, from whatever this office has room for.
 */
function vignettes(
	crowd: Crowd,
	seed: number,
	world: { furniture: Furniture[]; decor: Decor[]; landmark: CompiledWorld['landmark'] },
) {
	const rng = rngFor(seed, 'vignettes');
	let n = 0;
	const person = (room: number, cell: Cell, heading: number, pose: Pose, caption?: string) => {
		const id = `vignette-${n++}`;
		const character = pick(rng, EXTRA_CHARACTERS);
		crowd.claim(cell);
		crowd.add({
			id,
			name: '',
			character,
			x: cell.x + 0.5,
			y: cell.y + 0.5,
			heading,
			pose,
			elev: 0,
			sit: false,
			room,
			line: '',
			wanders: false,
			radius: 0,
			interactive: false,
			appearance: { ...randomLook(seed, id, character), skin: crowd.skin() },
			...(caption ? { caption } : {}),
		});
	};
	const towards = (from: Cell, to: { x: number; y: number }) => Math.atan2(to.x - from.x - 0.5, to.y - from.y - 0.5);
	const caption = (kind: Vignette) => pick(rng, VIGNETTE_CAPTIONS[kind]);
	/** People typing at a desk, still free for a story. */
	const typists = () => crowd.actors.filter((a) => a.sit && a.pose === 'type' && a.appearance && !a.caption);
	const ahead = (a: Actor, k: number): Cell => ({
		x: Math.floor(a.x) + Math.round(Math.sin(a.heading)) * k,
		y: Math.floor(a.y) + Math.round(Math.cos(a.heading)) * k,
	});

	const tell: Record<Vignette, () => boolean> = {
		// Three or four people in a half circle in front of the ticket board, one pointing at it.
		standup: () => {
			const board = world.landmark.questboard;
			if (!board) return false;
			const front = board.interact;
			// Straight out from the board's wall (its centre can sit half a tile to one side).
			const dx = front.x + 0.5 - board.x;
			const dy = front.y + 0.5 - board.y;
			const out = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
			const side = { x: out.y, y: out.x };
			const middle = { x: front.x + out.x + 0.5, y: front.y + out.y + 0.5 };
			// The visitor's own spot in front of the board stays free.
			const ring = [
				{ x: front.x + side.x, y: front.y + side.y },
				{ x: front.x - side.x, y: front.y - side.y },
				{ x: front.x + out.x * 2, y: front.y + out.y * 2 },
				{ x: front.x + out.x + side.x, y: front.y + out.y + side.y },
				{ x: front.x + out.x - side.x, y: front.y + out.y - side.y },
			].filter((c, i, all) => crowd.standable(c) && all.findIndex((d) => d.x === c.x && d.y === c.y) === i);
			if (ring.length < 3) return false;
			ring.slice(0, 4).forEach((c, i) => {
				const pose: Pose = i === 0 ? 'present' : pick(rng, ['chat', 'stand', 'stand'] as Pose[]);
				person(board.room, c, towards(c, i === 0 ? board : middle), pose, i === 1 ? caption('standup') : undefined);
			});
			return true;
		},
		// Someone at a desk with a rubber duck on it, talking it through: their own duck if they
		// have one, else a duck goes wherever it fits on their desk, facing them.
		duck: () => {
			const deskOf = (t: Actor) => ahead(t, 1);
			const on = (d: Decor, c: Cell) => Math.floor(d.x) === c.x && Math.floor(d.z) === c.y;
			let a = typists().find((t) => world.decor.some((d) => d.asset === 'rubber_duck' && on(d, deskOf(t))));
			if (!a)
				for (const t of shuffle(rng, typists())) {
					const desk = deskOf(t);
					const spot = duckSpot(world.decor, desk, t.heading);
					if (!spot) continue;
					world.decor.push({ id: 'vignette-duck', asset: 'rubber_duck', x: spot.x, z: spot.z, y: DESK_TOP, heading: t.heading + Math.PI, room: t.room });
					a = t;
					break;
				}
			if (!a) return false;
			a.caption = caption('duck');
			a.pose = 'chat';
			return true;
		},
		// A courier robot parked behind someone's chair with their coffee.
		courier: () => {
			for (const a of shuffle(rng, typists())) {
				const back = ahead(a, -1);
				if (!crowd.standable(back)) continue;
				crowd.claim(back);
				crowd.add({
					id: 'vignette-courier',
					name: '',
					character: 'robo_courier',
					x: back.x + 0.5,
					y: back.y + 0.5,
					heading: a.heading,
					pose: 'stand',
					elev: 0,
					sit: false,
					room: a.room,
					line: '',
					wanders: false,
					radius: 0,
					interactive: false,
					appearance: null,
					caption: caption('courier'),
				});
				return true;
			}
			return false;
		},
		// Someone wrestling the printer, a little queue waiting behind them.
		printer: () => {
			for (const p of world.furniture.filter((f) => f.asset === 'printer')) {
				const face = FACE[p.rot];
				const cells = [1, 2, 3].map((k) => ({ x: p.x + face.x * k, y: p.y + face.y * k }));
				if (!cells.every((c) => crowd.standable(c))) continue;
				const target = { x: p.x + 0.5, y: p.y + 0.5 };
				cells.forEach((c, i) =>
					person(p.room, c, towards(c, target), i === 0 ? 'panic' : i === 1 ? 'stand' : 'call', i === 0 ? caption('printer') : undefined),
				);
				return true;
			}
			return false;
		},
	};
	const want = 2 + Math.floor(rng() * 2);
	let told = 0;
	for (const kind of shuffle(rng, Object.keys(tell) as Vignette[])) {
		if (told >= want) break;
		if (tell[kind]()) told++;
	}
}

/** How far apart (in cells) two people may stand to chat with each other. */
const TALK_REACH = 2.5;

/**
 * Who says what about Max: each remark goes to one of the named people (then to anyone else),
 * each talk to the closest two people in one room (at least one of them named), nobody in two
 * talks. The first talk is the one nearest Max's desk, so every visitor overhears one early.
 */
function assignChatter(actors: Actor[], castCount: number, chatter: Chatter, seed: number, near: Cell | null): Talk[] {
	const rng = rngFor(seed, 'chatter');
	const named = shuffle(rng, actors.slice(0, castCount).filter((a) => a.appearance));
	const others = shuffle(rng, actors.slice(castCount).filter((a) => a.appearance && !a.caption));
	const speakers = [...named, ...others];
	chatter.remarks.forEach((remark, i) => {
		if (speakers[i]) speakers[i].remark = remark;
	});
	const people = actors.filter((a) => a.appearance);
	const busy = new Set<string>();
	const talks: Talk[] = [];
	for (const lines of chatter.talks) {
		let best: { a: Actor; b: Actor; d: number } | null = null;
		for (const a of named) {
			if (busy.has(a.id)) continue;
			for (const b of people) {
				if (b === a || busy.has(b.id) || b.room !== a.room) continue;
				if (Math.hypot(a.x - b.x, a.y - b.y) > TALK_REACH) continue;
				const d =
					near && !talks.length
						? Math.hypot((a.x + b.x) / 2 - near.x - 0.5, (a.y + b.y) / 2 - near.y - 0.5)
						: Math.hypot(a.x - b.x, a.y - b.y);
				if (!best || d < best.d) best = { a, b, d };
			}
		}
		if (!best) break;
		busy.add(best.a.id);
		busy.add(best.b.id);
		best.a.chats = best.b.chats = true;
		talks.push({ a: best.a.id, b: best.b.id, lines });
	}
	return talks;
}

/** Someone always works the coffee bar: a barista behind the counter if nobody is there yet. */
function staffCoffeeBar(crowd: Crowd, seed: number) {
	const room = crowd.roomOf(['coffee']);
	const spot = room && crowd.takeSpot(room, ['barista'], rngFor(seed, 'barista'));
	if (!room || !spot) return;
	const id = 'staff-barista';
	crowd.add({
		id,
		name: '',
		character: 'barista',
		x: spot.x,
		y: spot.y,
		heading: spot.heading,
		pose: 'serve',
		elev: 0,
		sit: false,
		room: room.index,
		line: '',
		wanders: false,
		radius: 0,
		interactive: false,
		appearance: { ...randomLook(seed, id, 'barista'), skin: crowd.skin() },
	});
}

function balance(actors: Actor[], seed: number) {
	const people = actors.filter((a) => a.appearance);
	const looks = balanceLooks(
		people.map((a) => a.appearance!),
		seed,
	);
	people.forEach((a, i) => (a.appearance = looks[i]));
}

const COMPANION_NAMES: Record<string, string[]> = {
	robo_barista: ['Brewster', 'Bean-E', 'Latte-9', 'Mocha Unit'],
	drone_cam: ['Stand-Up Cam', 'Hovers', 'Zoom', 'Sprint Review Cam'],
	robo_courier: ['Parcel', 'Dispatch', 'Shippy', 'Ack'],
	plant_bot: ['Sprout', 'Drip', 'Fernando', 'Watts'],
	office_parrot: ['Captain Merge', 'Polly Morphism', 'Kiwi', 'Mango'],
	office_hamster: ['Nibbles', 'Cache', 'Turbo', 'Peanut'],
};

const COMPANION_LINES: Record<string, string[]> = {
	robo_barista: ['*whirr* One flat white, extra flat. *clink*', 'Order received. Brewing with 99.9% uptime.'],
	drone_cam: ['*bzzz* Recording the stand-up for posterity. *bzzz*', '*hovers closer* Smile, it is for the retro.'],
	robo_courier: ['*beep beep* Parcel for… the person who ordered 40 rubber ducks.', '*beep* Delivering the printer toner. Again.'],
	plant_bot: ['*sploosh* Hydration is a team sport.', '*rustle* The ficus says hi. The ficus is thriving.'],
	office_parrot: ['*squawk* Works on my machine! Works on my machine!', '*head tilt* Have you tried turning it off and on? *squawk*'],
	office_hamster: ['*rolls past at full speed* Squeak!', '*stops, sniffs, rolls away* This ball is my standing desk.'],
};

/**
 * The office's helpers, each where it makes sense: a barista bot on the coffee bar, a parrot
 * on a bookshelf, a hamster rolling round the lounge, a camera drone over the open space (or
 * the meetup), a courier robot on the corridor and a plant bot among the plants.
 */
function companions(crowd: Crowd, seed: number, furniture: CompiledWorld['furniture'], event: CompiledWorld['event']) {
	const rng = rngFor(seed, 'companions');
	const add = (character: CharacterId, room: Room, x: number, y: number, extra: Partial<Actor> = {}) =>
		crowd.add({
			id: `bot-${character}`,
			name: pick(rng, COMPANION_NAMES[character]),
			character,
			x,
			y,
			heading: rng() * Math.PI * 2,
			pose: 'stand',
			elev: 0,
			sit: false,
			room: room.index,
			line: pick(rng, COMPANION_LINES[character]),
			wanders: true,
			radius: 3,
			interactive: true,
			appearance: null,
			...extra,
		});

	for (const kind of ['coffee', 'kitchen'] as const) {
		const bar = crowd.roomOf([kind]);
		const perch = bar && crowd.takeSpot(bar, ['perch'], rng);
		if (!bar || !perch) continue;
		add('robo_barista', bar, perch.x, perch.y, { heading: perch.heading, elev: perch.elev, wanders: false, pose: 'serve' });
		break;
	}

	// A parrot on the tallest flat-topped thing it can find, preferably a bookshelf.
	const perches = furniture
		.filter((f) => ['bookshelf', 'bookshelf_b', 'filing_cabinet', 'vending_machine', 'fridge'].includes(f.asset))
		.filter((f) => crowd.approachable({ x: f.x, y: f.y }))
		.sort((a, b) => Number(b.asset.startsWith('bookshelf')) - Number(a.asset.startsWith('bookshelf')) || a.y - b.y || a.x - b.x);
	if (perches.length) {
		const shelves = perches.filter((f) => f.asset === perches[0].asset);
		const f = shelves[Math.floor(rng() * shelves.length)];
		add('office_parrot', crowd.rooms[f.room], f.x + 0.5, f.y + 0.5, {
			heading: f.rot * (Math.PI / 2),
			elev: ASSETS[f.asset].h,
			wanders: false,
		});
	}

	const roamer = (character: CharacterId, room: Room | null, extra: Partial<Actor>) => {
		const cell = room && crowd.freeCell(room, rng);
		if (room && cell) add(character, room, cell.x + 0.5, cell.y + 0.5, extra);
	};
	roamer('office_hamster', crowd.roomOf(['lounge', 'games', 'reception', 'library']), { radius: 3 });
	roamer('drone_cam', crowd.roomOf(event?.kind === 'meetup' ? ['meetup', 'desks'] : ['desks', 'meetup']), {
		radius: 5,
		// Above the monitors and partitions, below the cut-down walls' tops: it never clips a desk.
		elev: 1.6,
		flies: true,
	});
	roamer('robo_courier', crowd.hall() ?? crowd.roomOf(['reception', 'desks']), { radius: 8 });
	const green = crowd.roomOf(['garden']) ?? crowd.roomOf(['lounge', 'reception', 'library', 'desks']);
	roamer('plant_bot', green, { radius: 3 });
}

// ---------------------------------------------------------------------------------------------

const LANDMARK_FALLBACK: Record<
	LandmarkId,
	{ zone: keyof Floorplan['reserved']; asset: AssetId }
> = {
	max: { zone: 'desks', asset: 'desk_single' },
	library: { zone: 'library', asset: 'bookshelf' },
	stage: { zone: 'meetup', asset: 'podium' },
	questboard: { zone: 'desks', asset: 'whiteboard' },
	worldforge: { zone: 'server', asset: 'server_rack' },
};

export function compileWorld(brief: Brief, seed: number, options: CompileOptions = {}): CompiledWorld {
	const partial = options.partial ?? false;
	const plan = planFloor(seed);
	const zoneOf = new Map(brief.zones.map((z) => [z.kind, z]));
	const assigned = assignZones(
		plan,
		brief.zones.map((z) => z.kind),
		!partial,
	);
	const hallStyle = pick(rngFor(seed, 'hall-style'), HALL_STYLES);
	const seenKinds = new Set<string>();
	const rooms: Room[] = plan.rooms.map((shape) => {
		const kind = shape.hall ? 'hall' : assigned.kinds[shape.index];
		const named = kind && kind !== 'hall' ? zoneOf.get(kind) : undefined;
		const revealed = assigned.revealed[shape.index];
		const name = kind && kind !== 'hall' ? (named?.name ?? DEFAULT_ZONE_NAMES[kind]) : '';
		// A second room of the same zone is its annex.
		const twin = kind !== null && kind !== 'hall' && seenKinds.has(kind);
		if (kind) seenKinds.add(kind);
		return {
			index: shape.index,
			x: shape.x,
			y: shape.y,
			w: shape.w,
			h: shape.h,
			hall: shape.hall,
			kind,
			name: twin ? `${name} II` : name,
			story: twin ? '' : (named?.story ?? ''),
			revealed,
			order: assigned.order[shape.index],
			floor: revealed && kind ? (kind === 'hall' && hallStyle === 'track' ? 'track' : ZONE_FLOOR[kind]) : 'bare',
		};
	});

	const roomAt = new Int16Array(W * H).fill(-1);
	for (const r of rooms)
		for (let y = r.y; y < r.y + r.h; y++)
			for (let x = r.x; x < r.x + r.w; x++) roomAt[cellIndex(x, y)] = r.index;
	const { hEdge, vEdge } = buildEdges(plan, rooms, roomAt);
	// Outdoors is never walkable.
	const blocked = new Uint8Array(W * H);
	for (let i = 0; i < blocked.length; i++) if (roomAt[i] < 0) blocked[i] = 1;
	const grid: Grid = {
		roomAt,
		blocked,
		reserved: new Uint8Array(W * H),
		hEdge,
		vEdge,
	};
	for (const c of doorCells(plan)) grid.reserved[cellIndex(c.x, c.y)] = 1;

	const out: Furnished = { furniture: [], decor: [], spots: [], landmarks: [], max: null };
	const ctxs = new Map<number, RoomCtx>();
	for (const room of rooms) {
		if (!room.revealed || !room.kind) continue;
		const ctx = new RoomCtx(grid, room, seed, room.kind, out);
		ctxs.set(room.index, ctx);
		PLACERS[room.kind](ctx, {
			entrance: room.index === plan.reserved.reception ? plan.entrance : null,
			hall: hallStyle,
		});
		if (room.kind !== 'hall' && room.kind !== 'desks') fillSpace(ctx);
	}

	// Supply any landmark whose placer could not fit it, as a single tile with a spot in front.
	if (!partial)
		for (const id of landmarkIds) {
			if (out.landmarks.some((l) => l.landmark === id)) continue;
			const { zone, asset } = LANDMARK_FALLBACK[id];
			const order = [plan.reserved[zone], ...rooms.map((r) => r.index)];
			for (const index of order) {
				const ctx = ctxs.get(index);
				if (!ctx) continue;
				let done = false;
				for (let y = ctx.y0; y < ctx.y1 && !done; y++)
					for (let x = ctx.x0; x <= ctx.x1 && !done; x++)
						if (ctx.place({ pieces: [{ asset, x, y, rot: 0 }], reserve: [{ x, y: y + 1 }] })) {
							ctx.landmark(id, x + 0.5, y + 0.5, { x, y: y + 1 }, ASSETS[asset].h + 0.3);
							done = true;
						}
				if (done) break;
			}
		}

	// Planter dividers where two open-plan zones meet (never the hall).
	for (const a of rooms)
		for (const b of rooms) {
			if (a.index >= b.index || a.hall || b.hall) continue;
			if (!a.revealed || !b.revealed || !isOpenZone(a.kind) || !isOpenZone(b.kind)) continue;
			const host = a.w * a.h >= b.w * b.h ? a : b;
			const ctx = ctxs.get(host.index);
			if (!ctx) continue;
			const doors = plan.doors.filter((d) => d.rooms.includes(a.index) && d.rooms.includes(b.index));
			if (a.x + a.w === b.x || b.x + b.w === a.x) {
				const at = a.x + a.w === b.x ? b.x : a.x;
				const from = Math.max(a.y, b.y);
				const to = Math.min(a.y + a.h, b.y + b.h);
				if (to - from >= 5) planterDivider(ctx, 'v', at, from, to, doors.map((d) => d.y));
			} else if (a.y + a.h === b.y || b.y + b.h === a.y) {
				const at = a.y + a.h === b.y ? b.y : a.y;
				const from = Math.max(a.x, b.x);
				const to = Math.min(a.x + a.w, b.x + b.w);
				if (to - from >= 5) planterDivider(ctx, 'h', at, from, to, doors.map((d) => d.x));
			}
		}

	const eventKind = brief.event.kind;
	// The first zone in the event's order of preference that this office has.
	const eventRoom = EVENT_ROOM[eventKind]
		.map((kind) => rooms.find((r) => r.revealed && r.kind === kind))
		.find((r) => r !== undefined);
	const event = eventRoom ? { kind: eventKind, title: brief.event.title, room: eventRoom.index } : null;
	if (event) dressEvent(event.kind, ctxs.get(event.room)!, out);

	snapSeats(out);

	const tall = new Set<number>();
	for (const f of out.furniture)
		if (ASSETS[f.asset].h > 1.3) for (let x = f.x; x < f.x + f.w; x++) tall.add(cellIndex(x, f.y));
	for (const ctx of ctxs.values()) wallDecor(ctx, tall);

	const landmarks: LandmarkEntity[] = out.landmarks.map((l) => ({
		id: `landmark-${l.landmark}`,
		landmark: l.landmark,
		name: brief.landmarks[l.landmark] || DEFAULT_LANDMARK_NAMES[l.landmark],
		x: l.x,
		y: l.y,
		interact: l.interact,
		room: roomAt[cellIndex(l.interact.x, l.interact.y)],
		height: l.height,
	}));
	const landmark: CompiledWorld['landmark'] = {};
	for (const l of landmarks) landmark[l.landmark] ??= l;

	const max: Actor | null = out.max
		? {
				id: 'max-npc',
				name: 'Max Zauner',
				character: 'max',
				...out.max,
				pose: 'type',
				line: '',
				wanders: false,
				radius: 0,
				interactive: false,
				appearance: null,
			}
		: null;

	const root = landmark.max?.interact ?? { x: plan.entrance.x, y: plan.entrance.y - 1 };
	const crowd = new Crowd(
		{ blocked: grid.blocked, roomAt, hEdge, vEdge },
		rooms,
		out.spots,
		grid.reserved,
		reachable({ blocked: grid.blocked, hEdge, vEdge }, root),
		skinTones(seed),
	);
	castActors(brief, crowd, seed, eventKind);
	const castCount = crowd.actors.length;
	let talks: Talk[] = [];
	if (!partial) {
		extras(
			crowd,
			seed,
			event,
			brief.cast.some((c) => c.character === 'office_dog'),
		);
		companions(crowd, seed, out.furniture, event);
		staffCoffeeBar(crowd, seed);
		vignettes(crowd, seed, { furniture: out.furniture, decor: out.decor, landmark });
		talks = assignChatter(crowd.actors, castCount, brief.chatter ?? DEFAULT_CHATTER, seed, landmark.max?.interact ?? null);
	}
	tuckEmptySeats(out.furniture, crowd.actors, grid.blocked);
	// Keep playful hair and glasses in proportion: the named cast first, then the extras.
	balance(crowd.actors.slice(0, castCount), seed);
	balance(crowd.actors.slice(castCount), seed + 1);

	// Just beside Max's visitor spot, so the visitor does not stand between him and the camera.
	const reach = landmark.max ? reachable({ blocked: grid.blocked, hEdge, vEdge }, landmark.max.interact) : null;
	const spawn =
		(landmark.max &&
			[
				{ x: 1, y: 1 },
				{ x: -1, y: 1 },
				{ x: 1, y: 0 },
				{ x: -1, y: 0 },
			]
				.map((d) => ({ x: landmark.max!.interact.x + d.x, y: landmark.max!.interact.y + d.y }))
				.find((c) => inBounds(c.x, c.y) && reach![cellIndex(c.x, c.y)] === 1)) ??
		landmark.max?.interact ?? { x: plan.entrance.x, y: plan.entrance.y - 1 };

	return {
		version: WORLD_VERSION,
		seed,
		width: W,
		height: H,
		partial,
		meta: {
			company: brief.company || 'Untitled Startup',
			tagline: brief.tagline,
			vibe: brief.vibe,
			timeOfDay: brief.timeOfDay,
			outside: brief.outside,
		},
		rooms,
		roomAt,
		footprint: plan.footprint,
		blocked: grid.blocked,
		hEdge,
		vEdge,
		furniture: out.furniture,
		decor: out.decor,
		landmarks,
		landmark,
		max,
		npcs: crowd.actors,
		talks,
		event,
		spawn,
		entrance: plan.entrance,
	};
}

/** Seats that slide in under a desk or table when nobody sits on them, and how far. */
const TUCK: Partial<Record<AssetId, { under: RegExp; by: number }>> = {
	office_chair: { under: /^(desk_|meeting_)/, by: 0.34 },
	folding_chair: { under: /^dining_/, by: 0.3 },
	stool: { under: /^coffee_table$/, by: 0.22 },
};

/**
 * Empty chairs are pushed in under their desk or table, square to it, like an office at the
 * end of the day: pods read as tidy furniture instead of a crowd of chairs.
 */
function tuckEmptySeats(furniture: Furniture[], actors: Actor[], blocked: Uint8Array) {
	const at = new Map<number, Furniture>();
	for (const f of furniture)
		if (blocked[cellIndex(f.x, f.y)])
			for (let y = f.y; y < f.y + f.d; y++) for (let x = f.x; x < f.x + f.w; x++) at.set(cellIndex(x, y), f);
	const taken = new Set(actors.filter((a) => a.sit).map((a) => cellIndex(Math.floor(a.x), Math.floor(a.y))));
	for (const f of furniture) {
		const tuck = TUCK[f.asset];
		if (!tuck || taken.has(cellIndex(f.x, f.y))) continue;
		const face = FACE[f.rot];
		const front = inBounds(f.x + face.x, f.y + face.y) ? at.get(cellIndex(f.x + face.x, f.y + face.y)) : undefined;
		if (front && tuck.under.test(front.asset)) f.tuck = tuck.by;
	}
}

/** Additive props for the event, placed after everything else so nothing moves. */
function dressEvent(kind: EventKind, ctx: RoomCtx, out: Furnished) {
	switch (kind) {
		case 'meetup':
			// More rows of chairs for the crowd, as many as it needs and no more.
			seatAudience(ctx, EVENT_AUDIENCE);
			break;
		case 'birthday': {
			// The cake goes on the canteen table if there is one, else on a café table.
			const run = out.furniture.filter((f) => f.room === ctx.rect.index && f.asset.startsWith('dining_'));
			const table = run.sort((p, q) => p.x - q.x)[Math.floor(run.length / 2)];
			if (table) ctx.decorate([{ asset: 'birthday_cake', x: table.x + 0.5, z: table.y + 0.5, y: TABLE_TOP, heading: 0 }]);
			else if (!cafeTables(ctx, 1, true)) {
				// No room for another table: the cake goes on whatever counter or table is there.
				const tops: Partial<Record<AssetId, number>> = {
					counter_mid: COUNTER_TOP,
					counter_end_r: COUNTER_TOP,
					coffee_table: COFFEE_TABLE_TOP,
					snack_table: TABLE_TOP,
				};
				// In order of preference (the left cap carries the espresso machine).
				const top = (['counter_mid', 'coffee_table', 'snack_table', 'counter_end_r'] as const)
					.map((asset) => out.furniture.find((f) => f.room === ctx.rect.index && f.asset === asset))
					.find((f) => f !== undefined);
				if (top) {
					ctx.decorate([{ asset: 'birthday_cake', x: top.x + 0.5, z: top.y + 0.5, y: tops[top.asset]!, heading: 0 }]);
					// The cake takes the barista bot's perch on the right cap.
					const perch = out.spots.findIndex((s) => s.kind === 'perch' && Math.floor(s.x) === top.x && Math.floor(s.y) === top.y);
					if (perch >= 0) out.spots.splice(perch, 1);
				}
			}
			break;
		}
		case 'pingpong': {
			const table = out.furniture.find((f) => f.asset === 'ping_pong_table' && f.room === ctx.rect.index);
			if (table)
				ctx.decorate([{ asset: 'trophy', x: table.x + 0.2, z: table.y + 1.5, y: 0.8, heading: 0 }]);
			break;
		}
	}
}

// ---------------------------------------------------------------------------------------------
// Queries for movement, used by the scene and the tests

export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
export const cellAt = (fx: number, fy: number): Cell => ({ x: Math.floor(fx), y: Math.floor(fy) });

export function isOpenCell(world: Pick<CompiledWorld, 'blocked'>, x: number, y: number) {
	return inBounds(x, y) && !world.blocked[cellIndex(x, y)];
}

export function canStep(
	world: Pick<CompiledWorld, 'blocked' | 'hEdge' | 'vEdge'>,
	x: number,
	y: number,
	dx: number,
	dy: number,
): boolean {
	if (!isOpenCell(world, x + dx, y + dy)) return false;
	if (dx && dy)
		return (
			canStep(world, x, y, dx, 0) &&
			canStep(world, x, y, 0, dy) &&
			canStep(world, x + dx, y, 0, dy) &&
			canStep(world, x, y + dy, dx, 0)
		);
	return stepOpen(world.hEdge, world.vEdge, x, y, dx, dy);
}

const DIRS = [...FACE, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }];

/** Cells reachable from `from` with 4-neighbour steps. */
export function reachable(world: Pick<CompiledWorld, 'blocked' | 'hEdge' | 'vEdge'>, from: Cell) {
	const seen = new Uint8Array(W * H);
	if (!isOpenCell(world, from.x, from.y)) return seen;
	const queue = [cellIndex(from.x, from.y)];
	seen[queue[0]] = 1;
	while (queue.length) {
		const i = queue.pop()!;
		const x = i % W;
		const y = (i - x) / W;
		for (const d of FACE) {
			if (!canStep(world, x, y, d.x, d.y)) continue;
			const j = cellIndex(x + d.x, y + d.y);
			if (seen[j]) continue;
			seen[j] = 1;
			queue.push(j);
		}
	}
	return seen;
}

export function nearestOpenCell(world: CompiledWorld, from: Cell): Cell | null {
	let best: Cell | null = null;
	let bestD = Infinity;
	for (let y = 0; y < H; y++)
		for (let x = 0; x < W; x++) {
			if (!isOpenCell(world, x, y)) continue;
			const d = Math.hypot(x - from.x, y - from.y);
			if (d < bestD) [best, bestD] = [{ x, y }, d];
		}
	return best;
}

/** A* over the grid with diagonal steps that never cut a corner. */
export function findPath(world: CompiledWorld, from: Cell, to: Cell): Cell[] | null {
	if (!isOpenCell(world, to.x, to.y)) {
		const near = nearestOpenCell(world, to);
		if (!near) return null;
		to = near;
	}
	if (!isOpenCell(world, from.x, from.y)) return null;
	const start = cellIndex(from.x, from.y);
	const goal = cellIndex(to.x, to.y);
	const g = new Float32Array(W * H).fill(Infinity);
	const came = new Int32Array(W * H).fill(-1);
	const closed = new Uint8Array(W * H);
	const open: number[] = [start];
	const f = new Float32Array(W * H).fill(Infinity);
	const h = (i: number) => {
		const x = i % W;
		const y = (i - x) / W;
		const dx = Math.abs(x - to.x);
		const dy = Math.abs(y - to.y);
		return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
	};
	g[start] = 0;
	f[start] = h(start);
	while (open.length) {
		let bi = 0;
		for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
		const i = open[bi];
		open[bi] = open[open.length - 1];
		open.pop();
		if (i === goal) break;
		if (closed[i]) continue;
		closed[i] = 1;
		const x = i % W;
		const y = (i - x) / W;
		for (const d of DIRS) {
			if (!canStep(world, x, y, d.x, d.y)) continue;
			const j = cellIndex(x + d.x, y + d.y);
			if (closed[j]) continue;
			const cost = g[i] + (d.x && d.y ? Math.SQRT2 : 1);
			if (cost < g[j]) {
				g[j] = cost;
				f[j] = cost + h(j);
				came[j] = i;
				open.push(j);
			}
		}
	}
	if (came[goal] === -1 && goal !== start) return null;
	const path: Cell[] = [];
	for (let i = goal; i !== -1; i = came[i]) {
		const x = i % W;
		path.push({ x, y: (i - x) / W });
		if (i === start) break;
	}
	return path.reverse();
}

const WALL_HALF = 2 / 16;

function circleRect(cx: number, cz: number, r: number, x0: number, z0: number, x1: number, z1: number) {
	const dx = cx - Math.max(x0, Math.min(cx, x1));
	const dz = cz - Math.max(z0, Math.min(cz, z1));
	return dx * dx + dz * dz < r * r;
}

/** Whether a body of radius `r` at (x, y) overlaps furniture, a wall or the outside. */
export function collides(world: Pick<CompiledWorld, 'blocked' | 'hEdge' | 'vEdge'>, x: number, y: number, r: number) {
	if (x - r < 0 || y - r < 0 || x + r > W || y + r > H) return true;
	const x0 = Math.floor(x - r - WALL_HALF);
	const x1 = Math.floor(x + r + WALL_HALF);
	const y0 = Math.floor(y - r - WALL_HALF);
	const y1 = Math.floor(y + r + WALL_HALF);
	for (let cy = y0; cy <= y1 + 1; cy++)
		for (let cx = x0; cx <= x1 + 1; cx++) {
			if (cy <= y1 && cx <= x1 && inBounds(cx, cy) && world.blocked[cellIndex(cx, cy)])
				if (circleRect(x, y, r, cx, cy, cx + 1, cy + 1)) return true;
			if (cx >= 0 && cx < W && cy >= 0 && cy <= H && !PASSABLE_EDGES.has(world.hEdge[hIndex(cx, cy)]))
				if (circleRect(x, y, r, cx, cy - WALL_HALF, cx + 1, cy + WALL_HALF)) return true;
			if (cy >= 0 && cy < H && cx >= 0 && cx <= W && !PASSABLE_EDGES.has(world.vEdge[vIndex(cx, cy)]))
				if (circleRect(x, y, r, cx - WALL_HALF, cy, cx + WALL_HALF, cy + 1)) return true;
		}
	return false;
}

/** Zone kinds that exist in a compiled world, in reveal order. */
export function zoneOrder(world: CompiledWorld) {
	return world.rooms.filter((r) => r.order >= 0).sort((a, b) => a.order - b.order);
}
