import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	streamText: vi.fn(),
	moderate: vi.fn(),
	responses: vi.fn((id: string) => ({ modelId: id })),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-only/openai-client', () => ({
	aiOpenAI: { responses: mocks.responses },
	openai: { moderations: { create: mocks.moderate } },
}));
vi.mock('ai', async (original) => ({
	...(await original<typeof import('ai')>()),
	streamText: mocks.streamText,
}));

import {
	buildRunPrompt,
	generateWorld,
	LANDMARK_MARGIN,
	LANDMARK_SPACING,
	planLayout,
	MIN_WORLD_OPS,
	pickTheme,
	THEME_SEEDS,
	WORLD_INSTRUCTIONS,
	WorldGenerationError,
	type GeneratedWorld,
} from './generate';
import {
	biomes,
	LIMITS,
	WORLD_HEIGHT,
	WORLD_WIDTH,
	worldOp,
	type WorldOp,
} from './schema';
import { RANGES, TEXT_LIMITS } from './sanitize';

const meta = {
	type: 'meta',
	name: 'Frostmere',
	tagline: 'Snow on the lake.',
	biome: 'winter',
	timeOfDay: 'night',
	weather: 'snow',
	story: 'Snow begins.',
};
const hill = (i: number) => ({
	type: 'hill',
	x: i,
	y: 4,
	radius: 3,
	height: 2,
	story: `Hill ${i}.`,
});
const world = (count = 40) => [
	meta,
	...Array.from({ length: count - 1 }, (_, i) => hill(i)),
];

type StreamOptions = {
	onError?: (event: { error: unknown }) => void;
	abortSignal?: AbortSignal;
	maxRetries?: number;
	maxOutputTokens?: number;
	prompt?: string;
	instructions?: string;
	providerOptions?: unknown;
};

function fakeStream(elements: unknown[], { error }: { error?: unknown } = {}) {
	mocks.streamText.mockImplementation((options: StreamOptions) => ({
		elementStream: (async function* () {
			for (const element of elements) yield element;
			if (error) options.onError?.({ error });
		})(),
		totalUsage: Promise.resolve({
			inputTokens: 3000,
			outputTokens: 5000,
			totalTokens: 8000,
		}),
		finishReason: Promise.resolve('stop'),
	}));
}

async function drain(generator: AsyncGenerator<WorldOp, GeneratedWorld>) {
	const streamed: WorldOp[] = [];
	let step = await generator.next();
	while (!step.done) {
		streamed.push(step.value);
		step = await generator.next();
	}
	return { streamed, result: step.value };
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv('OPENAI_MODEL', 'base-model');
	vi.stubEnv('QUEST_WORLD_MODEL', '');
	mocks.moderate.mockResolvedValue({ results: [{ flagged: false }] });
});

describe('generateWorld', () => {
	it('streams sanitized ops and returns the moderated world', async () => {
		fakeStream([
			meta,
			{ ...hill(1), x: 500 },
			'junk',
			{ type: 'volcano' },
			...world(30).slice(1),
		]);
		const { streamed, result } = await drain(generateWorld());
		expect(streamed[1]).toMatchObject({ type: 'hill', x: WORLD_WIDTH - 1 });
		expect(streamed).toHaveLength(31);
		for (const op of streamed) expect(worldOp.safeParse(op).success).toBe(true);
		expect(result.ops).toEqual(streamed);
		expect(result.model).toBe('base-model');
		expect(result.usage).toMatchObject({ outputTokens: 5000 });
		expect(mocks.moderate).toHaveBeenCalledTimes(1);
		const input = mocks.moderate.mock.calls[0][0].input as string;
		expect(input).toContain('Frostmere');
		expect(input).toContain('Hill 1.');
	});

	it('uses QUEST_WORLD_MODEL, one attempt, bounded output and a timeout signal', async () => {
		vi.stubEnv('QUEST_WORLD_MODEL', 'world-model');
		fakeStream(world());
		await drain(generateWorld({ previous: { name: 'Rosemoor Vale', biome: 'meadow' } }));
		expect(mocks.responses).toHaveBeenCalledWith('world-model');
		const options = mocks.streamText.mock.calls[0][0] as StreamOptions;
		expect(options.maxRetries).toBe(0);
		expect(options.maxOutputTokens).toBeGreaterThan(4000);
		expect(options.maxOutputTokens).toBeLessThanOrEqual(12_000);
		expect(options.abortSignal).toBeInstanceOf(AbortSignal);
		expect(options.providerOptions).toEqual({ openai: { store: false } });
		expect(options.instructions).toBe(WORLD_INSTRUCTIONS);
		expect(options.prompt).toContain('"Rosemoor Vale"');
	});

	it('drops npcs and stray landmark names that mention Max', async () => {
		fakeStream([
			...world(30),
			{
				type: 'npc',
				kind: 'bard',
				x: 1,
				y: 1,
				name: 'Wren',
				line: 'Max is great!',
				wanders: false,
				story: '',
			},
			{
				type: 'npc',
				kind: 'dog',
				x: 1,
				y: 1,
				name: 'Max',
				line: 'Woof.',
				wanders: true,
				story: '',
			},
			{
				type: 'npc',
				kind: 'cat',
				x: 1,
				y: 1,
				name: 'Maxine',
				line: 'Mrrp.',
				wanders: true,
				story: '',
			},
			{
				type: 'landmark',
				id: 'library',
				x: 5,
				y: 5,
				facing: 'south',
				name: "Zauner's Books",
				story: '',
			},
			{
				type: 'landmark',
				id: 'max',
				x: 9,
				y: 9,
				facing: 'south',
				name: "Max's Camp",
				story: 'Max waves.',
			},
		]);
		const { result } = await drain(generateWorld());
		const npcs = result.ops.filter((op) => op.type === 'npc');
		expect(npcs.map((op) => op.name)).toEqual(['Maxine']);
		expect(result.ops.filter((op) => op.type === 'landmark').map((op) => op.id)).toEqual([
			'max',
		]);
	});

	it('fails when the moderation flags the text', async () => {
		fakeStream(world());
		mocks.moderate.mockResolvedValue({ results: [{ flagged: true }] });
		await expect(drain(generateWorld())).rejects.toBeInstanceOf(WorldGenerationError);
	});

	it('fails closed when the moderation is unavailable', async () => {
		fakeStream(world());
		mocks.moderate.mockRejectedValue(new Error('offline'));
		await expect(drain(generateWorld())).rejects.toThrow(/could not check/);
	});

	it.each([
		['too few ops', world(MIN_WORLD_OPS - 1)],
		['no meta', world(40).slice(1)],
		['nothing usable', ['a', 1, null]],
	])('fails with %s', async (_, elements) => {
		fakeStream(elements);
		await expect(drain(generateWorld())).rejects.toThrow(/too little/);
		expect(mocks.moderate).not.toHaveBeenCalled();
	});

	it('fails when the model call errors, even after some ops', async () => {
		fakeStream(world(), { error: new Error('500') });
		await expect(drain(generateWorld())).rejects.toThrow(/AI service failed/);
	});

	it('fails when the caller aborts', async () => {
		const controller = new AbortController();
		controller.abort();
		fakeStream(world());
		await expect(drain(generateWorld({ signal: controller.signal }))).rejects.toThrow(
			/stopped/,
		);
	});
});

describe('prompt', () => {
	it('documents every op type, landmark and range from the schema', () => {
		for (const option of worldOp.options)
			expect(WORLD_INSTRUCTIONS).toContain(`"${option.shape.type.value}"`);
		for (const [min, max] of Object.values(RANGES))
			expect(WORLD_INSTRUCTIONS).toMatch(new RegExp(`${min}\\b[^\\n]*to ${max}\\b`));
		expect(WORLD_INSTRUCTIONS).toContain(
			`${WORLD_WIDTH} columns by ${WORLD_HEIGHT} rows`,
		);
		expect(WORLD_INSTRUCTIONS).toContain(`max ${TEXT_LIMITS.story} characters`);
		expect(WORLD_INSTRUCTIONS).toContain(`${LIMITS.ops} ops`);
		for (const id of ['max', 'library', 'stage', 'questboard', 'worldforge'])
			expect(WORLD_INSTRUCTIONS).toContain(`- ${id}: `);
	});

	it('passes the theme and previous name, nothing else', () => {
		const theme = pickTheme(undefined, () => 0);
		const prompt = buildRunPrompt(theme, 'Old Vale');
		expect(prompt).toContain(theme.motif);
		expect(prompt).toContain(`biome ${theme.biome}`);
		expect(prompt).toContain(`max (${theme.landmarks.max.x}, ${theme.landmarks.max.y})`);
		expect(prompt).toContain(`main water around (${theme.water.x}, ${theme.water.y})`);
		expect(prompt).toContain('"Old Vale"');
		expect(buildRunPrompt(theme)).not.toContain('previous');
	});
});

describe('pickTheme', () => {
	it('covers every biome and keeps the heart inside the map', () => {
		expect(new Set(THEME_SEEDS.map((seed) => seed.biome))).toEqual(new Set(biomes));
		for (const random of [() => 0, () => 0.5, () => 0.999999]) {
			const theme = pickTheme(undefined, random);
			expect(theme.heart.x).toBeGreaterThanOrEqual(8);
			expect(theme.heart.x).toBeLessThan(WORLD_WIDTH - 8);
			expect(theme.heart.y).toBeGreaterThanOrEqual(8);
			expect(theme.heart.y).toBeLessThan(WORLD_HEIGHT - 8);
		}
	});

	it('plans well-spread landmark cells inside the margins, max near the heart', () => {
		for (let i = 0; i < 300; i++) {
			const { heart, landmarks, water } = planLayout();
			const cells = Object.values(landmarks);
			for (const cell of [...cells, water]) {
				expect(cell.x).toBeGreaterThanOrEqual(LANDMARK_MARGIN);
				expect(cell.x).toBeLessThanOrEqual(WORLD_WIDTH - 1 - LANDMARK_MARGIN);
				expect(cell.y).toBeGreaterThanOrEqual(LANDMARK_MARGIN);
				expect(cell.y).toBeLessThanOrEqual(WORLD_HEIGHT - 1 - LANDMARK_MARGIN);
			}
			for (const [a, b] of cells.flatMap((a, i) => cells.slice(i + 1).map((b) => [a, b])))
				expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(LANDMARK_SPACING);
			expect(
				Math.hypot(landmarks.max.x - heart.x, landmarks.max.y - heart.y),
			).toBeLessThan(3);
			const waterClearance = Math.min(
				...cells.map((cell) => Math.hypot(cell.x - water.x, cell.y - water.y)),
			);
			expect(waterClearance).toBeGreaterThanOrEqual(3);
		}
	});

	it('avoids the previous biome and stays consistent with its seed', () => {
		for (let i = 0; i < 200; i++) {
			const theme = pickTheme('winter');
			expect(theme.biome).not.toBe('winter');
			const seed = THEME_SEEDS.find((candidate) => candidate.motif === theme.motif)!;
			expect(seed.weathers).toContain(theme.weather);
			if (seed.times) expect(seed.times).toContain(theme.timeOfDay);
		}
	});
});
