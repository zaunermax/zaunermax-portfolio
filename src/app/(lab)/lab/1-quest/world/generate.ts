import 'server-only';
import {
	jsonSchema,
	Output,
	streamText,
	zodSchema,
	type JSONSchema7,
	type LanguageModelUsage,
} from 'ai';
import { z } from 'zod';
import { aiOpenAI, openai } from '@/lib/server-only/openai-client';
import {
	biomes,
	landmarkIds,
	landmarkRoles,
	LIMITS,
	timesOfDay,
	weathers,
	WORLD_HEIGHT,
	WORLD_WIDTH,
	worldOp,
	type LandmarkId,
	type MetaOp,
	type WorldOp,
} from './schema';
import { createOpSanitizer } from './sanitize';

/**
 * World generation: a server-only prompt plus one streamed model call.
 *
 * Visitors never send text to the model. Variety comes from a theme picked here at random and
 * from the previous world's name; everything the model returns is sanitized op by op, and the
 * finished world is moderated before anyone persists it.
 */

export const GENERATION_TIMEOUT_MS = 120_000;
/** About 45-60 tokens per op; 110 ops fit comfortably, runaway output is cut off. */
export const MAX_OUTPUT_TOKENS = 9_000;
/** Fewer valid ops than this is not a world worth replacing the current one with. */
export const MIN_WORLD_OPS = 25;
/** Lower bound for the array in the response schema. */
const MIN_REQUESTED_OPS = 70;

export function worldModelId() {
	const model = process.env.QUEST_WORLD_MODEL?.trim() || process.env.OPENAI_MODEL?.trim();
	if (!model) throw new Error('QUEST_WORLD_MODEL or OPENAI_MODEL is required');
	return model;
}

// ---------------------------------------------------------------------------------------------
// Themes: server-side randomness, never visitor input.

type Biome = (typeof biomes)[number];
type TimeOfDay = (typeof timesOfDay)[number];
type Weather = (typeof weathers)[number];

type ThemeSeed = {
	motif: string;
	biome: Biome;
	weathers: readonly Weather[];
	times?: readonly TimeOfDay[];
};

type Cell = { x: number; y: number };

export type WorldTheme = {
	motif: string;
	biome: Biome;
	timeOfDay: TimeOfDay;
	weather: Weather;
	/**
	 * A skeleton planned here rather than by the model, which is weak at spatial reasoning:
	 * the settlement's heart, five well-spread landmark cells and where the main water goes.
	 */
	heart: Cell;
	landmarks: Record<LandmarkId, Cell>;
	water: Cell;
};

export const THEME_SEEDS: readonly ThemeSeed[] = [
	{
		motif: 'a fishing village around a lake',
		biome: 'meadow',
		weathers: ['clear', 'fog', 'rain'],
	},
	{
		motif: 'a windmill farm on rolling hills',
		biome: 'meadow',
		weathers: ['clear', 'rain', 'fireflies'],
	},
	{
		motif: 'a river-crossing market town with a tavern and docks',
		biome: 'meadow',
		weathers: ['clear', 'rain'],
	},
	{
		motif: 'a lantern-lit night market at a crossroads',
		biome: 'meadow',
		weathers: ['fireflies', 'clear'],
		times: ['dusk', 'night'],
	},
	{
		motif: 'a vineyard village on sunny terraced slopes',
		biome: 'meadow',
		weathers: ['clear', 'fireflies'],
	},
	{
		motif: 'a ruined watchtower in an autumn forest',
		biome: 'autumn',
		weathers: ['leaves', 'fog', 'clear'],
	},
	{
		motif: 'a harvest festival in a farming valley',
		biome: 'autumn',
		weathers: ['leaves', 'clear'],
	},
	{
		motif: 'an apple-orchard village beside a slow river',
		biome: 'autumn',
		weathers: ['leaves', 'rain'],
	},
	{
		motif: 'a snowbound mountain-pass village around a smithy',
		biome: 'winter',
		weathers: ['snow', 'clear', 'fog'],
	},
	{
		motif: 'a frozen lake with ice fishers and a warm tavern',
		biome: 'winter',
		weathers: ['snow', 'clear'],
	},
	{
		motif: 'a pine-forest logging camp along a river',
		biome: 'winter',
		weathers: ['snow', 'fog', 'clear'],
	},
	{
		motif: 'a desert oasis market ringed by palms',
		biome: 'desert',
		weathers: ['clear'],
	},
	{
		motif: 'a canyon outpost with a watchtower guarding the pass',
		biome: 'desert',
		weathers: ['clear'],
		times: ['dawn', 'day', 'dusk'],
	},
	{
		motif: 'a caravan rest stop around an old well',
		biome: 'desert',
		weathers: ['clear'],
		times: ['dusk', 'night', 'dawn'],
	},
	{
		motif: 'a swamp hamlet where frogs outnumber people',
		biome: 'swamp',
		weathers: ['fog', 'fireflies', 'rain'],
	},
	{
		motif: "a mushroom-forest glade around a wizard's camp",
		biome: 'swamp',
		weathers: ['fireflies', 'fog'],
		times: ['dusk', 'night'],
	},
	{
		motif: "a highland shepherds' crossing with a stone chapel",
		biome: 'highlands',
		weathers: ['clear', 'fog', 'rain'],
	},
	{
		motif: 'a crystal-mining camp at the foot of tall cliffs',
		biome: 'highlands',
		weathers: ['clear', 'fog'],
	},
	{
		motif: 'a quiet chapel and old graveyard on a misty moor',
		biome: 'highlands',
		weathers: ['fog', 'rain'],
	},
];

const pick = <T>(items: readonly T[], random: () => number): T =>
	items[Math.min(items.length - 1, Math.floor(random() * items.length))];
const randomInt = (min: number, max: number, random: () => number) =>
	min + Math.min(max - min, Math.floor(random() * (max - min + 1)));
const distance = (a: Cell, b: Cell) => Math.hypot(a.x - b.x, a.y - b.y);

export const LANDMARK_MARGIN = 3;
export const LANDMARK_SPACING = 8;

/** Random cell in the map minus a margin. */
function randomCell(margin: number, random: () => number): Cell {
	return {
		x: randomInt(margin, WORLD_WIDTH - 1 - margin, random),
		y: randomInt(margin, WORLD_HEIGHT - 1 - margin, random),
	};
}

/** Best of a few random candidates by `score`; stops early once `good` is reached. */
function bestCell(
	score: (cell: Cell) => number,
	good: number,
	margin: number,
	random: () => number,
) {
	let best = randomCell(margin, random);
	let bestScore = score(best);
	for (let attempt = 0; attempt < 80 && bestScore < good; attempt++) {
		const cell = randomCell(margin, random);
		const cellScore = score(cell);
		if (cellScore > bestScore) [best, bestScore] = [cell, cellScore];
	}
	return best;
}

export function planLayout(random: () => number = Math.random) {
	const heart = {
		x: randomInt(12, WORLD_WIDTH - 13, random),
		y: randomInt(9, WORLD_HEIGHT - 10, random),
	};
	const placed: Cell[] = [];
	const clearance = (cell: Cell) =>
		Math.min(...placed.map((other) => distance(cell, other)));
	const landmarks = {} as Record<LandmarkId, Cell>;
	for (const id of landmarkIds) {
		landmarks[id] =
			id === 'max'
				? { x: heart.x + randomInt(-2, 2, random), y: heart.y + randomInt(-2, 2, random) }
				: bestCell(clearance, LANDMARK_SPACING, LANDMARK_MARGIN, random);
		placed.push(landmarks[id]);
	}
	// Near enough to the settlement to belong to it, as far from the landmarks as possible.
	const water = bestCell(
		(cell) => {
			const fromHeart = distance(cell, heart);
			return (
				clearance(cell) - Math.max(0, 6 - fromHeart) * 3 - Math.max(0, fromHeart - 12)
			);
		},
		Infinity,
		4,
		random,
	);
	return { heart, landmarks, water };
}

/** A random theme; avoids the previous world's biome so consecutive worlds feel different. */
export function pickTheme(
	previousBiome?: Biome,
	random: () => number = Math.random,
): WorldTheme {
	const fresh = THEME_SEEDS.filter((seed) => seed.biome !== previousBiome);
	const seed = pick(fresh.length ? fresh : THEME_SEEDS, random);
	return {
		motif: seed.motif,
		biome: seed.biome,
		timeOfDay: pick(seed.times ?? timesOfDay, random),
		weather: pick(seed.weathers, random),
		...planLayout(random),
	};
}

// ---------------------------------------------------------------------------------------------
// Prompt. The op reference is rendered from the schema so ranges and vocabularies can't drift.

type JsonProp = {
	type?: string;
	enum?: string[];
	const?: string;
	description?: string;
};

/** Fields every positional op shares; explained once in the map section instead. */
const SHARED_FIELDS = new Set(['type', 'x', 'y', 'story']);

function describeField(name: string, prop: JsonProp): string {
	if (prop.enum) return `${name}: ${prop.enum.join(' | ')}`;
	const kind =
		prop.type === 'array'
			? 'list of {x, y}'
			: prop.type === 'integer'
				? 'integer'
				: prop.type === 'boolean'
					? 'true | false'
					: 'text';
	return prop.description
		? `${name} (${kind}): ${prop.description}`
		: `${name} (${kind})`;
}

export function opReference(): string {
	return worldOp.options
		.map((option) => {
			const schema = z.toJSONSchema(option) as { properties: Record<string, JsonProp> };
			const type = schema.properties.type.const;
			const positional = 'x' in schema.properties ? ' x, y,' : '';
			const fields = Object.entries(schema.properties)
				.filter(([name]) => !SHARED_FIELDS.has(name))
				.map(([name, prop]) => `    - ${describeField(name, prop)}`);
			return [`- "${type}":${positional} story, plus`, ...fields].join('\n');
		})
		.join('\n');
}

const landmarkList = landmarkIds.map((id) => `- ${id}: ${landmarkRoles[id]}`).join('\n');

export const WORLD_INSTRUCTIONS = `You are the World Forge, level designer for a cozy low-poly fantasy RPG in the style of a 2004 online roleplaying game. You design one small, hand-crafted zone and output it as an ordered list of build ops in "elements". The game assembles the zone live in front of a visitor in exactly the order you emit ops, and shows each op's "story" in a build log, so the order should feel like watching a world being made.

# The map
- A grid of ${WORLD_WIDTH} columns by ${WORLD_HEIGHT} rows. x is the column: 0 is the west edge, ${WORLD_WIDTH - 1} the east edge. y is the row: 0 is the north edge, ${WORLD_HEIGHT - 1} the south edge. The centre is (${WORLD_WIDTH / 2}, ${WORLD_HEIGHT / 2}).
- One cell is about one cottage wide. A building covers about 2x2 cells, a landmark about 3x3, a forest or hill a disc of the given radius, a lake an ellipse.
- Land is walkable ground in the biome's style. Lakes and rivers are water; hills raise the ground; forests and rocks block walking; paths are roads (bridges appear where they cross water).
- Every op is a whole object with all of its fields. "story" is one short sentence (max 90 characters) narrating that op as it appears.

# Ops
${opReference()}

# Landmarks: the five functional places, each exactly once
${landmarkList}

# The plan you are given
Each request gives you the heart of the settlement (its square or main crossroads), the exact cell of every landmark, and where the main water goes. Build the zone around that plan:
- Put each landmark exactly on its given cell.
- Water keeps at least 3 cells away from every landmark cell and from the heart. The main water is a lake, or the bend of a river, around its given cell. A river runs from one map edge to another edge or into a lake; it never ends inside the settlement and passes around the landmarks, not through them.
- Paths connect the heart to every landmark: each landmark cell must appear as a point of some path, usually its last point. Give roads 3-4 points so they bend naturally; branches may leave the main road instead of all starting at the heart. Paths may cross rivers (bridges appear there).

# Build order
Emit, in this order, with these counts:
1. meta: exactly one, first.
2. Terrain, 6-8 ops: hills, the main lake or river, maybe a pond or a second river.
3. path ops, 5-6: the main road through the heart, then branches to the landmarks.
4. The five landmark ops, one per id.
5. building ops, 12-14.
6. forest ops, 6-8, then rocks ops, 3-5.
7. props ops, 20-24: be generous with them along the roads, around the square and beside every landmark.
8. npc ops last, 12-14 and never more.
That is 70-85 ops in total. Hard limits: ${LIMITS.ops} ops, ${LIMITS.buildings} buildings, ${LIMITS.forests} forests, ${LIMITS.props} props ops, ${LIMITS.npcs} npcs, ${LIMITS.pointsPerLine} points per path or river.

# Layout
- Every building, landmark, prop and npc has a cell of its own: never two on the same cell. Buildings stand at least 3 cells apart and at least 3 cells from any landmark cell.
- The settlement reads as a real place: most buildings cluster within about 7 cells of the heart, along the main road or around the square, fronts facing the nearest path. A well or statue marks the square. Farms sit at the edge with fields of haystacks, fences and a scarecrow; docks sit on a shore facing the water; lamps and signposts line the roads; barrels and crates gather beside the tavern, smithy and docks.
- Each landmark gets a little scene: 1-2 props ops 2-3 cells beside it (never on its cell), sometimes an npc. The stage faces an open green; the worldforge waystone stands in a clearing or on a hilltop.
- Forests and rocks frame the map edges and the wilds. Near the settlement they stay small (radius 2-3); the big ones (radius 5-7) go to corners and edges. Their discs never cover a path, landmark, building or the square.
- Only rivers, lakes, docks and path bridges touch water. Use the whole map.

# NPCs
- A mix of people (guard, farmer, bard, merchant, wizard, fisher, child) and animals (cat, dog, sheep, chicken, cow, deer, frog), placed where they belong: fishers by water, farmers and livestock in the fields, a guard at a tower or the road, a merchant on the square, a bard near the stage or tavern.
- Unique names that fit the world; animals get pet names.
- line: one or two short sentences in character, without quotation marks, about this world: its places, weather, chores, rumours and small mysteries. Animals make sounds or actions, e.g. "*flicks an ear* Mrrp."
- wanders: true for animals and strollers, false for anyone at a post.

# Writing
- Stories are vivid and in the present tense, e.g. "Reeds whisper as Mirrormere fills the western hollow." Vary their openings; no two alike.
- Names are original and fit the theme.
- All text is family-friendly fiction about this world only: no real people, places, brands, products, technology or current events; peril stays storybook-gentle.
- Max, who owns this website, may be named only in the max landmark's name and story (e.g. "Max's Lakeside Camp"). No npc and no other text mentions him.`;

const cell = ({ x, y }: Cell) => `(${x}, ${y})`;

export function buildRunPrompt(theme: WorldTheme, previousName?: string | null): string {
	return [
		'Forge a new zone:',
		`- motif: ${theme.motif}`,
		`- meta: biome ${theme.biome}, timeOfDay ${theme.timeOfDay}, weather ${theme.weather}`,
		`- heart of the settlement: ${cell(theme.heart)}`,
		`- landmark cells: ${landmarkIds.map((id) => `${id} ${cell(theme.landmarks[id])}`).join(', ')}`,
		`- main water around ${cell(theme.water)}`,
		previousName
			? `- The previous zone was "${previousName}". Choose a clearly different name and layout.`
			: null,
	]
		.filter(Boolean)
		.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Model call

/**
 * OpenAI strict structured outputs reject `oneOf` (zod emits it for discriminated unions) but
 * accept the equivalent `anyOf`. The ±MAX_SAFE_INTEGER bounds zod adds to every int are noise.
 * Validation is left to sanitizeOp, so no element is lost to a recoverable mistake.
 */
function toStrictOpenAISchema(node: unknown): unknown {
	if (Array.isArray(node)) return node.map(toStrictOpenAISchema);
	if (typeof node !== 'object' || node === null) return node;
	return Object.fromEntries(
		Object.entries(node).flatMap(([key, value]) => {
			if (
				(key === 'minimum' || key === 'maximum') &&
				Math.abs(value as number) === Number.MAX_SAFE_INTEGER
			)
				return [];
			return [[key === 'oneOf' ? 'anyOf' : key, toStrictOpenAISchema(value)]];
		}),
	);
}

const elementSchema = jsonSchema<unknown>(
	async () => toStrictOpenAISchema(await zodSchema(worldOp).jsonSchema) as JSONSchema7,
	{ validate: (value) => ({ success: true, value }) },
);

/** Defence in depth for "never about Max": such npcs and stray landmark names are dropped. */
const MENTIONS_MAX = /\bmax\b|maximilian|zauner/i;

function mentionsMax(raw: unknown) {
	if (typeof raw !== 'object' || raw === null) return false;
	const op = raw as Record<string, unknown>;
	const texts =
		op.type === 'npc'
			? [op.name, op.line]
			: op.type === 'landmark' && op.id !== 'max'
				? [op.name]
				: [];
	return texts.some((text) => typeof text === 'string' && MENTIONS_MAX.test(text));
}

export class WorldGenerationError extends Error {
	constructor(
		/** Plain text that may be shown to visitors. */
		readonly publicMessage: string,
		options?: { cause?: unknown },
	) {
		super(publicMessage, options);
		this.name = 'WorldGenerationError';
	}
}

export type GeneratedWorld = {
	ops: WorldOp[];
	model: string;
	theme: WorldTheme;
	usage: LanguageModelUsage | null;
	finishReason: string | null;
	durationMs: number;
};

export type GenerateWorldOptions = {
	/** Cancels the model call (in addition to the built-in timeout). */
	signal?: AbortSignal;
	/** Meta of the world on display, so the next one differs. */
	previous?: Pick<MetaOp, 'name' | 'biome'> | null;
};

function worldText(ops: WorldOp[]) {
	return ops
		.flatMap((op) => {
			switch (op.type) {
				case 'meta':
					return [op.name, op.tagline, op.story];
				case 'landmark':
					return [op.name, op.story];
				case 'npc':
					return [`${op.name}: ${op.line}`, op.story];
				default:
					return [op.story];
			}
		})
		.filter(Boolean)
		.join('\n');
}

async function moderate(ops: WorldOp[], signal?: AbortSignal) {
	let flagged: boolean;
	try {
		const moderation = await openai.moderations.create(
			{ model: 'omni-moderation-latest', input: worldText(ops) },
			{ signal, timeout: 15_000, maxRetries: 1 },
		);
		flagged = moderation.results.some((result) => result.flagged);
	} catch (error) {
		throw new WorldGenerationError(
			'The forge could not check its work, so the new world was discarded.',
			{ cause: error },
		);
	}
	if (flagged)
		throw new WorldGenerationError(
			'The forge produced something unfit for this world, so it was discarded.',
		);
}

/**
 * Streams a freshly generated world. Yields each sanitized op as soon as the model completes it,
 * and returns the final op list once it has been validated and moderated. Throws
 * WorldGenerationError (with a visitor-safe message) when the result is unusable.
 */
export async function* generateWorld({
	signal,
	previous,
}: GenerateWorldOptions = {}): AsyncGenerator<WorldOp, GeneratedWorld> {
	const model = worldModelId();
	const theme = pickTheme(previous?.biome);
	const startedAt = Date.now();
	const timeout = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
	const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
	let streamError: unknown = null;

	const result = streamText({
		model: aiOpenAI.responses(model),
		output: Output.array({
			element: elementSchema,
			// Enforced by OpenAI's constrained decoding; the model tends to stop early otherwise.
			minItems: MIN_REQUESTED_OPS,
			maxItems: LIMITS.ops,
			name: 'world_ops',
			description: 'Build ops of one game zone, in build order.',
		}),
		instructions: WORLD_INSTRUCTIONS,
		prompt: buildRunPrompt(theme, previous?.name),
		maxOutputTokens: MAX_OUTPUT_TOKENS,
		// One attempt only: a retry could double the cost of a run.
		maxRetries: 0,
		abortSignal,
		providerOptions: { openai: { store: false } },
		onError: ({ error }) => {
			streamError ??= error;
		},
	});

	const sanitizer = createOpSanitizer();
	for await (const raw of result.elementStream) {
		if (mentionsMax(raw)) continue;
		const op = sanitizer.push(raw);
		if (op) yield op;
	}
	const ops = sanitizer.ops();

	if (signal?.aborted) throw new WorldGenerationError('The forge was stopped.');
	// A timeout keeps whatever was built so far if it is enough for a world.
	if (streamError && !timeout.aborted)
		throw new WorldGenerationError('The forge lost its spark: the AI service failed.', {
			cause: streamError,
		});
	if (ops[0]?.type !== 'meta' || ops.length < MIN_WORLD_OPS)
		throw new WorldGenerationError(
			timeout.aborted
				? 'The forge ran out of time before the world took shape.'
				: 'The forge produced too little to build a world.',
			{ cause: streamError ?? undefined },
		);

	const [usage, finishReason] = timeout.aborted
		? [null, 'timeout']
		: await Promise.all([
				Promise.resolve(result.totalUsage).catch(() => null),
				Promise.resolve(result.finishReason).catch(() => null),
			]);

	await moderate(ops, signal);

	return { ops, model, theme, usage, finishReason, durationMs: Date.now() - startedAt };
}
