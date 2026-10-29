import { z } from 'zod';

/**
 * The building-block vocabulary of a Quest world.
 *
 * A world is an ordered list of ops. The generator (an LLM with a server-only prompt) may only
 * emit these ops; the compiler turns them into terrain, entities and collision deterministically.
 * Every op is self-contained so the world can be rendered while ops are still streaming in.
 *
 * Coordinates are grid cells: x is the column (0 = west edge), y is the row (0 = north edge).
 * Descriptions double as the generator's documentation, so keep them precise.
 */

export const WORLD_WIDTH = 40;
export const WORLD_HEIGHT = 28;

export const LIMITS = {
	ops: 140,
	npcs: 16,
	buildings: 16,
	forests: 14,
	props: 30,
	pointsPerLine: 6,
} as const;

export const biomes = ['meadow', 'autumn', 'winter', 'desert', 'swamp', 'highlands'] as const;
export const timesOfDay = ['dawn', 'day', 'dusk', 'night'] as const;
export const weathers = ['clear', 'rain', 'snow', 'fog', 'fireflies', 'leaves'] as const;
export const facings = ['north', 'east', 'south', 'west'] as const;

/** Functional places. Each must appear exactly once; the compiler supplies any that are missing. */
export const landmarkIds = ['max', 'library', 'stage', 'questboard', 'worldforge'] as const;
export const landmarkRoles: Record<LandmarkId, string> = {
	max: "Max's camp: where visitors talk to Max",
	library: "a library holding Max's wiki",
	stage: "an outdoor stage for Max's conference talks",
	questboard: 'a quest board where visitors post a project for Max',
	worldforge: 'a rune-carved waystone that forges a new world',
};

export const buildingKinds = [
	'cottage',
	'farmhouse',
	'windmill',
	'watchtower',
	'barn',
	'tent',
	'ruin',
	'well',
	'smithy',
	'tavern',
	'chapel',
	'dock',
] as const;
export const roofColors = ['red', 'blue', 'slate', 'thatch', 'rose'] as const;
export const treeSpecies = ['oak', 'pine', 'birch', 'autumn', 'palm', 'dead', 'mushroom'] as const;
export const propKinds = [
	'lamp',
	'fence',
	'crate',
	'barrel',
	'cart',
	'campfire',
	'banner',
	'statue',
	'flowers',
	'mushrooms',
	'signpost',
	'bench',
	'haystack',
	'scarecrow',
	'tombstone',
	'crystal',
] as const;
export const npcKinds = [
	'guard',
	'farmer',
	'bard',
	'merchant',
	'wizard',
	'fisher',
	'child',
	'cat',
	'dog',
	'sheep',
	'chicken',
	'cow',
	'deer',
	'frog',
] as const;

export type LandmarkId = (typeof landmarkIds)[number];

const x = z.number().int().describe(`Column, 0 (west) to ${WORLD_WIDTH - 1} (east)`);
const y = z.number().int().describe(`Row, 0 (north) to ${WORLD_HEIGHT - 1} (south)`);
const point = z.object({ x, y });
const story = z
	.string()
	.describe(
		'One short sentence (max 90 characters) narrating this step for the build log, e.g. "A windmill rises above the barley fields."',
	);
const facing = z.enum(facings).describe('Which way the front or door faces');

export const metaOp = z.object({
	type: z.literal('meta'),
	name: z.string().describe('World name, 2-4 words, max 32 characters, e.g. "Rosemoor Vale"'),
	tagline: z.string().describe('One evocative sentence about the world, max 110 characters'),
	biome: z.enum(biomes),
	timeOfDay: z.enum(timesOfDay),
	weather: z.enum(weathers),
	story,
});

export const hillOp = z.object({
	type: z.literal('hill'),
	x,
	y,
	radius: z.number().int().describe('2 to 8 cells'),
	height: z.number().int().describe('1 (gentle) to 4 (steep)'),
	story,
});

export const lakeOp = z.object({
	type: z.literal('lake'),
	x,
	y,
	radiusX: z.number().int().describe('2 to 8 cells'),
	radiusY: z.number().int().describe('2 to 6 cells'),
	story,
});

export const riverOp = z.object({
	type: z.literal('river'),
	points: z.array(point).describe('2 to 6 points; start or end at a map edge or a lake'),
	width: z.number().int().describe('1 to 3 cells'),
	story,
});

export const pathOp = z.object({
	type: z.literal('path'),
	points: z
		.array(point)
		.describe('2 to 6 points connecting places; bridges appear where it crosses water'),
	style: z.enum(['dirt', 'cobble']),
	story,
});

export const forestOp = z.object({
	type: z.literal('forest'),
	x,
	y,
	radius: z.number().int().describe('2 to 7 cells'),
	density: z.enum(['sparse', 'normal', 'dense']),
	species: z.enum(treeSpecies),
	story,
});

export const rocksOp = z.object({
	type: z.literal('rocks'),
	x,
	y,
	radius: z.number().int().describe('1 to 4 cells'),
	size: z.enum(['pebbles', 'boulders', 'cliff']),
	story,
});

export const landmarkOp = z.object({
	type: z.literal('landmark'),
	id: z.enum(landmarkIds),
	x,
	y,
	facing,
	name: z
		.string()
		.describe('In-world name, max 32 characters, e.g. "The Quill and Lantern" for the library'),
	story,
});

export const buildingOp = z.object({
	type: z.literal('building'),
	kind: z.enum(buildingKinds),
	x,
	y,
	facing,
	roof: z.enum(roofColors),
	story,
});

export const propsOp = z.object({
	type: z.literal('props'),
	kind: z.enum(propKinds),
	x,
	y,
	count: z.number().int().describe('1 to 8; extra copies scatter within 2 cells'),
	story,
});

export const npcOp = z.object({
	type: z.literal('npc'),
	kind: z.enum(npcKinds),
	x,
	y,
	name: z.string().describe('Max 24 characters, e.g. "Guard Elric" or "Biscuit"'),
	line: z
		.string()
		.describe(
			'What they say when greeted, max 120 characters, about this world only (never about Max)',
		),
	wanders: z.boolean(),
	story,
});

export const worldOp = z.discriminatedUnion('type', [
	metaOp,
	hillOp,
	lakeOp,
	riverOp,
	pathOp,
	forestOp,
	rocksOp,
	landmarkOp,
	buildingOp,
	propsOp,
	npcOp,
]);

export type WorldOp = z.infer<typeof worldOp>;
export type MetaOp = z.infer<typeof metaOp>;
export type OpOfType<T extends WorldOp['type']> = Extract<WorldOp, { type: T }>;
