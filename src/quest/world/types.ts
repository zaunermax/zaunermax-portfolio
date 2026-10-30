import type { Appearance } from './appearance';
import type { AssetId, CharacterId } from './catalog';
import type {
	EventKind,
	LandmarkId,
	Outside,
	TimeOfDay,
	Vibe,
	ZoneKind,
} from './schema';

/** Quarter turns around the vertical axis: 0 faces south (+y, towards the camera), 1 east. */
export type Rot = 0 | 1 | 2 | 3;

/**
 * The default camera yaw (radians, 0 looks north from the south): a three-quarter isometric
 * view from the south-east, Minecraft Dungeons style. People who idle without a seat face
 * roughly this way, so their faces read from the default view.
 */
export const CAMERA_YAW = Math.PI / 4;
export type Cell = { x: number; y: number };

/** What sits on the edge between two cells. */
export const EDGE = {
	none: 0,
	wall: 1,
	glass: 2,
	window: 3,
	door: 4,
	glassdoor: 5,
	entrance: 6,
	open: 7,
} as const;
export type EdgeKind = (typeof EDGE)[keyof typeof EDGE];

export const PASSABLE_EDGES: ReadonlySet<number> = new Set([
	EDGE.none,
	EDGE.door,
	EDGE.glassdoor,
	EDGE.open,
]);

export type FloorKind =
	'wood' | 'carpet' | 'checker' | 'concrete' | 'raised' | 'cozy' | 'tile' | 'moss' | 'bare' | 'track';

/** A footprint-sized piece of furniture standing on the grid. */
export type Furniture = {
	id: string;
	asset: AssetId;
	/** North-west cell of the (rotated) footprint and its size in cells. */
	x: number;
	y: number;
	w: number;
	d: number;
	rot: Rot;
	/** Mirrored along its local X (right-hand end pieces). */
	mirror: boolean;
	/** Height of its base above the floor (on a stage, say). */
	elev: number;
	blocks: boolean;
	room: number;
	/** An empty seat pushed this far (in tiles) towards its front, under its desk or table. */
	tuck?: number;
};

/** A small free-standing item: desk-top props, things on shelves and walls. */
export type Decor = {
	id: string;
	asset: AssetId;
	/** Centre in cell space; y is the height above the floor. */
	x: number;
	z: number;
	y: number;
	/** Radians, 0 faces south. */
	heading: number;
	room: number;
	/** Hangs on this wall edge; hidden while the wall is cut down. */
	wall?: { axis: 'h' | 'v'; x: number; y: number };
};

export type SpotKind =
	| 'desk'
	| 'meeting'
	| 'seat'
	| 'sofa'
	| 'beanbag'
	| 'bar'
	| 'barista'
	| 'counter'
	| 'table'
	| 'game'
	| 'arcade'
	| 'reading'
	| 'shelf'
	| 'speaker'
	| 'audience'
	| 'rack'
	| 'reception'
	| 'printer'
	| 'stand'
	/** Inside a phone booth. */
	| 'booth'
	/** On top of furniture, for small companions (a parrot on a shelf, a robot on the bar). */
	| 'perch';

/** A place where a person can be: a chair, a spot behind a counter, a stage. */
export type Spot = {
	kind: SpotKind;
	x: number;
	y: number;
	heading: number;
	sit: boolean;
	elev: number;
	room: number;
};

export type Pose =
	| 'type'
	| 'sit'
	| 'stand'
	| 'chat'
	| 'present'
	| 'cheer'
	| 'clap'
	| 'play'
	| 'wave'
	| 'nap'
	| 'walk'
	| 'serve'
	| 'panic'
	| 'call';

export type Actor = {
	id: string;
	name: string;
	character: CharacterId;
	/** Centre in cell space. */
	x: number;
	y: number;
	heading: number;
	pose: Pose;
	/** Height of the feet (or seat) above the floor. */
	elev: number;
	/**
	 * Sitting on a seat, whatever the pose: hips and legs take the seated pose, the arms (and
	 * head) still do the pose's gesture, so people can cheer, clap or chat from a chair.
	 */
	sit: boolean;
	room: number;
	line: string;
	/** Strolls within `radius` cells of home. */
	wanders: boolean;
	/** Flies over furniture (walls still stop it). */
	flies?: boolean;
	radius: number;
	/** Named cast members have a nameplate and talk; extras only fill the room. */
	interactive: boolean;
	/** People only (Max is bespoke, pets and robots have none). */
	appearance: Appearance | null;
	/** A little story told over this actor's head (a vignette's caption), always shown nearby. */
	caption?: string;
	/** Something true about Max they mention when the visitor passes by (or on a second F). */
	remark?: string;
	/** Has a part in a talk, so their speech bubbles need an anchor even without a nameplate. */
	chats?: boolean;
};

/** Two people near each other who chat about Max when the visitor comes close: a, b, a, b… */
export type Talk = { a: string; b: string; lines: string[] };

export type LandmarkEntity = {
	id: string;
	landmark: LandmarkId;
	name: string;
	/** Centre in cell space. */
	x: number;
	y: number;
	/** Where the visitor stands to use it. Always walkable and reachable from the spawn. */
	interact: Cell;
	room: number;
	/** Top of the landmark, for its nameplate. */
	height: number;
};

export type Room = {
	index: number;
	x: number;
	y: number;
	w: number;
	h: number;
	hall: boolean;
	kind: ZoneKind | 'hall' | null;
	name: string;
	story: string;
	/** Has appeared yet (while a brief streams in, unnamed rooms are bare). */
	revealed: boolean;
	/** Reveal order while streaming; -1 for rooms that were always there. */
	order: number;
	floor: FloorKind;
};

export type WorldMeta = {
	company: string;
	tagline: string;
	vibe: Vibe;
	timeOfDay: TimeOfDay;
	outside: Outside;
};

export type CompiledWorld = {
	version: number;
	seed: number;
	width: number;
	height: number;
	partial: boolean;
	meta: WorldMeta;
	rooms: Room[];
	/** Room index per cell (y * width + x); -1 outside the building. */
	roomAt: Int16Array;
	/** The building's outline as rectangles that tile it; the rest of the grid is outdoors. */
	footprint: { x: number; y: number; w: number; h: number }[];
	/** Furniture blocks the cell. */
	blocked: Uint8Array;
	/** Horizontal edges: index y * width + x is the north edge of cell (x, y), y in 0..height. */
	hEdge: Uint8Array;
	/** Vertical edges: index y * (width + 1) + x is the west edge of cell (x, y), x in 0..width. */
	vEdge: Uint8Array;
	furniture: Furniture[];
	decor: Decor[];
	landmarks: LandmarkEntity[];
	landmark: Partial<Record<LandmarkId, LandmarkEntity>>;
	/** Max himself, at his desk. */
	max: Actor | null;
	npcs: Actor[];
	talks: Talk[];
	event: { kind: EventKind; title: string; room: number } | null;
	spawn: Cell;
	/** The front door: `w` cells of the horizontal edge at row `y`. */
	entrance: { x: number; y: number; w: number };
};
