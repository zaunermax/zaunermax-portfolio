/**
 * The asset vocabulary from tools/quest-voxel/SPEC.md: ids, footprints and rough heights.
 *
 * The compiler places furniture by these footprints (it never needs the GLB); the renderer uses
 * the heights for pastel placeholder boxes while an id is missing from the kit. Footprints are
 * in tiles along X × Z before rotation; desk-top and wall items give their size in world units.
 * A floor piece that is slimmer than its footprint (a chair, a lamp) also gives its body: the
 * model's bounds in 16ths of a tile, local x0, z0, x1, z1 around the footprint's centre, +z at
 * its front. Bodies are what characters bump into, so they can slip between two chairs.
 */

type Floor = { fp: readonly [number, number]; h: number; body?: readonly [number, number, number, number]; kind?: 'floor' };
type Small = { size: readonly [number, number]; h: number; kind: 'top' | 'wall' };
export type AssetInfo = Floor | Small;

const floor = (w: number, d: number, h: number, body?: Floor['body']): Floor => ({ fp: [w, d], h, body });
const top = (w: number, d: number, h: number): Small => ({ size: [w, d], h, kind: 'top' });
const wall = (w: number, h: number): Small => ({ size: [w, 0.12], h, kind: 'wall' });

export const ASSETS = {
	// Connecting families
	desk_single: floor(1, 1, 1.0625),
	desk_end_l: floor(1, 1, 1.0625),
	desk_mid: floor(1, 1, 1.0625),
	desk_end_r: floor(1, 1, 1.0625),
	meeting_end: floor(1, 1, 0.75, [-8, -6, 8, 6]),
	meeting_mid: floor(1, 1, 0.75, [-8, -6, 8, 6]),
	sofa_end_l: floor(1, 1, 0.9375),
	sofa_mid: floor(1, 1, 0.9375),
	sofa_end_r: floor(1, 1, 0.9375),
	sofa_corner: floor(1, 1, 0.9375),
	counter_end_l: floor(1, 1, 0.9375),
	counter_end_r: floor(1, 1, 0.9375),
	/** Alias of counter_end_l, kept for stored worlds. */
	counter_end: floor(1, 1, 0.9375),
	counter_mid: floor(1, 1, 0.9375),
	counter_corner: floor(1, 1, 0.9375),
	counter_sink: floor(1, 1, 1.1875),
	bookshelf: floor(1, 1, 2, [-8, -6, 8, 5]),
	bookshelf_b: floor(1, 1, 2, [-8, -6, 8, 5]),
	planter_end: floor(1, 1, 0.8125, [-8, -5, 8, 5]),
	planter_mid: floor(1, 1, 0.8125, [-8, -5, 8, 5]),
	planter_mid_b: floor(1, 1, 0.8125, [-8, -5, 8, 5]),
	dining_end: floor(1, 1, 0.75, [-8, -6, 8, 6]),
	dining_mid: floor(1, 1, 0.75, [-8, -6, 8, 6]),
	// Furniture & landmarks
	office_chair: floor(1, 1, 0.9375, [-5, -5, 5, 5]),
	gaming_chair: floor(1, 1, 1.125, [-5, -5, 5, 5]),
	armchair: floor(1, 1, 0.8125),
	beanbag_teal: floor(1, 1, 0.6875, [-7, -6, 7, 6]),
	beanbag_coral: floor(1, 1, 0.6875, [-7, -6, 7, 6]),
	coffee_table: floor(2, 1, 0.625, [-13, -6, 13, 6]),
	stool: floor(1, 1, 0.4375, [-5, -5, 5, 5]),
	bar_stool: floor(1, 1, 0.8125, [-5, -5, 5, 5]),
	folding_chair: floor(1, 1, 0.875, [-5, -4, 5, 5]),
	fridge: floor(1, 1, 2, [-7, -6, 7, 8]),
	vending_machine: floor(1, 1, 2.0625, [-7, -6, 7, 8]),
	water_cooler: floor(1, 1, 1.5, [-5, -4, 7, 6]),
	filing_cabinet: floor(1, 1, 1.375, [-6, -5, 6, 7]),
	whiteboard: floor(1, 1, 1.875, [-7, -4, 7, 5]),
	kanban_board: floor(2, 1, 2.0625, [-15, -4, 15, 5]),
	server_rack: floor(1, 1, 2.125, [-7, -6, 7, 7]),
	printer: floor(1, 1, 1.4375, [-8, -5, 6, 7]),
	phone_booth: floor(1, 1, 2.25, [-6, -4, 6, 7]),
	ping_pong_table: floor(2, 3, 1, [-14, -19, 14, 19]),
	foosball_table: floor(2, 1, 1.0625, [-13, -8, 13, 8]),
	chess_table: floor(1, 1, 0.9375),
	arcade_cabinet: floor(1, 1, 2, [-7, -6, 7, 7]),
	tv_console: floor(2, 1, 1.6875, [-14, -5, 14, 6]),
	podium: floor(1, 1, 1.25, [-7, -5, 7, 6]),
	projector_screen: floor(3, 1, 2.3125, [-22, -4, 22, 5]),
	stage_block: floor(1, 1, 0.25),
	snack_table: floor(2, 1, 1.0625, [-14, -6, 14, 6]),
	big_desk_max: floor(2, 1, 1.375),
	reception_desk: floor(3, 1, 1.4375, [-22, -6, 22, 7]),
	bike: floor(1, 1, 1.0625, [-8, -3, 8, 4]),
	coat_rack: floor(1, 1, 1.5, [-5, -5, 5, 5]),
	floor_lamp: floor(1, 1, 1.875, [-5, -5, 5, 5]),
	trash_bin: floor(1, 1, 0.4375, [-4, -4, 4, 4]),
	recycle_bins: floor(1, 1, 0.4375, [-7, -3, 7, 3]),
	umbrella_stand: floor(1, 1, 1, [-3, -3, 3, 3]),
	fish_tank: floor(2, 1, 1.25, [-11, -5, 11, 5]),
	dog_bed: floor(1, 1, 0.3125, [-7, -6, 7, 6]),
	rug_round: floor(2, 2, 0.0625),
	rug_rect: floor(3, 2, 0.0625),
	// Plants
	plant_monstera: floor(1, 1, 1.3125),
	plant_fiddle: floor(1, 1, 1.3125, [-6, -3, 6, 4]),
	plant_snake: floor(1, 1, 1.125, [-4, -4, 4, 4]),
	plant_cactus: floor(1, 1, 1.1875, [-5, -4, 5, 4]),
	plant_ficus: floor(1, 1, 2.1875, [-6, -4, 7, 4]),
	plant_hanging: floor(1, 1, 1.875, [-4, -4, 5, 7]),
	plant_desk: top(0.375, 0.375, 0.4375),
	plant_pothos_shelf: top(0.75, 0.75, 0.5625),
	// Desk-top & small props
	espresso_machine: top(0.875, 0.75, 0.6875),
	monitor: top(0.75, 0.375, 0.6875),
	monitor_dual: top(1, 0.5, 0.625),
	laptop: top(0.625, 0.5, 0.5),
	keyboard_mouse: top(0.875, 0.375, 0.0625),
	mug: top(0.5, 0.5, 0.3125),
	mug_boss: top(0.5, 0.375, 0.3125),
	rubber_duck: top(0.375, 0.375, 0.25),
	desk_lamp: top(0.5, 0.5, 0.8125),
	paper_stack: top(0.5, 0.5, 0.1875),
	red_stapler: top(0.375, 0.5, 0.1875),
	the_internet: top(0.5, 0.375, 0.4375),
	trophy: top(0.5, 0.375, 0.5),
	coffee_cup_togo: top(0.375, 0.375, 0.3125),
	headphones: top(0.5, 0.375, 0.375),
	pizza_box: top(0.75, 0.75, 0.125),
	birthday_cake: top(0.625, 0.625, 1),
	// Wall-mounted
	wall_clock: wall(0.75, 0.75),
	poster_turn_off_on: wall(0.75, 1.0625),
	poster_motivation: wall(0.875, 1.125),
	neon_sign: wall(1.5, 0.6875),
	wall_tv: wall(1.5, 0.9375),
	window_panel: wall(1, 1.125),
} as const satisfies Record<string, AssetInfo>;

export type AssetId = keyof typeof ASSETS;

export function footprint(id: AssetId): readonly [number, number] {
	const info: AssetInfo = ASSETS[id];
	return 'fp' in info ? info.fp : [1, 1];
}

/** A floor piece's body in tiles before rotation: local x0, z0, x1, z1 around its centre. */
export function body(id: AssetId): readonly [number, number, number, number] {
	const info: AssetInfo = ASSETS[id];
	if (!('fp' in info)) return [-0.5, -0.5, 0.5, 0.5];
	if (info.body) return [info.body[0] / 16, info.body[1] / 16, info.body[2] / 16, info.body[3] / 16];
	return [-info.fp[0] / 2, -info.fp[1] / 2, info.fp[0] / 2, info.fp[1] / 2];
}

/** Characters in characters.glb, with the part rig they use. */
export const CHARACTERS = {
	max: 'human',
	visitor: 'human',
	dev_hoodie: 'human',
	dev_glasses: 'human',
	dev_slacker: 'human',
	manager: 'human',
	designer: 'human',
	barista: 'human',
	intern: 'human',
	office_dog: 'animal',
	office_cat: 'animal',
	robo_vacuum: 'robot',
	robo_courier: 'robot',
	robo_barista: 'robot',
	plant_bot: 'robot',
	drone_cam: 'drone',
	office_parrot: 'bird',
	office_hamster: 'hamster',
} as const;

export type CharacterId = keyof typeof CHARACTERS;
export type Rig = (typeof CHARACTERS)[CharacterId];

export const RIG_PARTS: Record<Rig, readonly string[]> = {
	human: ['head', 'body', 'arm_l', 'arm_r', 'leg_l', 'leg_r'],
	animal: ['head', 'body', 'tail', 'leg_fl', 'leg_fr', 'leg_bl', 'leg_br'],
	robot: ['body', 'top'],
	drone: ['body', 'rotor_fl', 'rotor_fr', 'rotor_bl', 'rotor_br'],
	bird: ['body', 'head', 'wing_l', 'wing_r', 'tail'],
	hamster: ['body', 'head', 'ball'],
};

/** Height of desk tops and counter tops, where desk-top items stand. */
export const DESK_TOP = 12 / 16;
export const COUNTER_TOP = 15 / 16;
export const SEAT = 7 / 16;

/**
 * Seat-top height of everything people sit on, measured from the kit (the flat seat surface,
 * not cushions or armrests). Sitters are snapped onto these, so a rebuilt seat needs its number
 * updated here, nowhere else.
 */
export const SEAT_TOP: Partial<Record<AssetId, number>> = {
	office_chair: 7 / 16,
	gaming_chair: 7 / 16,
	folding_chair: 7 / 16,
	stool: 7 / 16,
	bar_stool: 11 / 16,
	armchair: 7 / 16,
	sofa_end_l: 7 / 16,
	sofa_mid: 7 / 16,
	sofa_end_r: 7 / 16,
	sofa_corner: 7 / 16,
	beanbag_teal: 4 / 16,
	beanbag_coral: 4 / 16,
};
/** A sitter's root sits this far in front of the seat tile's centre: back against the backrest. */
export const SEAT_FORWARD = 1 / 16;
export const TABLE_TOP = 12 / 16;
export const COFFEE_TABLE_TOP = 7 / 16;
export const STAGE_TOP = 4 / 16;
