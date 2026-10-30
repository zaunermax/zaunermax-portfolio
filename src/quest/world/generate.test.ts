import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	streamText: vi.fn(),
	moderate: vi.fn(),
	responses: vi.fn((id: string) => ({ modelId: id })),
	chatter: vi.fn(),
}));
vi.mock('./chatter.server', () => ({ generateChatter: mocks.chatter }));
vi.mock('@/server/openai-client.server', () => ({
	getAIProvider: () => ({ responses: mocks.responses }),
	getOpenAI: () => ({ moderations: { create: mocks.moderate } }),
}));
vi.mock('ai', async (original) => ({
	...(await original<typeof import('ai')>()),
	streamText: mocks.streamText,
}));

import { defaultBrief } from './default-world';
import { optionalRoomCount, planFloor } from './floorplan';
import {
	buildRunPrompt,
	DEFAULT_WORLD_MODEL,
	generateWorld,
	pickPremise,
	WORLD_INSTRUCTIONS,
	WorldGenerationError,
	type GeneratedWorld,
} from './generate.server';
import { optionalZones, requiredZones, type Brief } from './schema';

type StreamOptions = {
	onError?: (event: { error: unknown }) => void;
	abortSignal?: AbortSignal;
	maxRetries?: number;
	maxOutputTokens?: number;
	prompt?: string;
	instructions?: string;
	reasoning?: string;
	providerOptions?: unknown;
};

/** Partial objects the way the SDK streams them: growing prefixes of the final brief. */
function prefixes(brief: Record<string, unknown>) {
	const out: Record<string, unknown>[] = [];
	const acc: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(brief)) {
		if (Array.isArray(value))
			for (let i = 1; i <= value.length; i++) out.push({ ...acc, [key]: value.slice(0, i) });
		acc[key] = value;
		out.push({ ...acc });
	}
	return out;
}

function fakeStream(final: Record<string, unknown> | null, { error, cut }: { error?: unknown; cut?: number } = {}) {
	mocks.streamText.mockImplementation((options: StreamOptions) => {
		const parts = final ? prefixes(final).slice(0, cut) : [];
		const output = error || cut ? Promise.reject(new Error('no output')) : Promise.resolve(final);
		output.catch(() => {});
		return {
			partialOutputStream: (async function* () {
				for (const part of parts) yield part;
				if (error) options.onError?.({ error });
			})(),
			output,
			totalUsage: Promise.resolve({ inputTokens: 2000, outputTokens: 2500, totalTokens: 4500 }),
			finishReason: Promise.resolve('stop'),
		};
	});
}

async function drain(generator: AsyncGenerator<Brief, GeneratedWorld>) {
	const streamed: Brief[] = [];
	let step = await generator.next();
	while (!step.done) {
		streamed.push(step.value);
		step = await generator.next();
	}
	return { streamed, result: step.value };
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv('QUEST_WORLD_MODEL', '');
	mocks.moderate.mockResolvedValue({ results: [{ flagged: false }] });
	mocks.chatter.mockResolvedValue(null);
});

describe('generateWorld', () => {
	it('streams growing sanitized briefs and returns the moderated one', async () => {
		fakeStream({ ...defaultBrief, company: 'Byte & Biscuit​' });
		const { streamed, result } = await drain(generateWorld({ seed: 850 }));
		expect(streamed.length).toBeGreaterThan(10);
		// Each streamed brief only grows.
		for (let i = 1; i < streamed.length; i++) {
			expect(streamed[i].zones.length).toBeGreaterThanOrEqual(streamed[i - 1].zones.length);
			expect(streamed[i].cast.length).toBeGreaterThanOrEqual(streamed[i - 1].cast.length);
		}
		expect(result.brief).toEqual(defaultBrief);
		expect(result.seed).toBe(850);
		expect(result.model).toBe(DEFAULT_WORLD_MODEL);
		expect(result.usage).toMatchObject({ outputTokens: 2500 });
		const input = mocks.moderate.mock.calls[0][0].input as string;
		expect(input).toContain('Byte & Biscuit');
		expect(input).toContain('Priya: Oat, soy');
	});

	it('streams the finished brief, closing and all, before the checks run', async () => {
		fakeStream(defaultBrief);
		const generator = generateWorld({ seed: 850 });
		let last: Brief | null = null;
		let lastBeforeModeration: Brief | null = null;
		mocks.moderate.mockImplementation(async () => {
			lastBeforeModeration = last;
			return { results: [{ flagged: false }] };
		});
		let step = await generator.next();
		while (!step.done) {
			last = step.value;
			step = await generator.next();
		}
		expect(lastBeforeModeration).toEqual(defaultBrief);
		expect(lastBeforeModeration!.closing).not.toBe('');
		expect(step.value.brief).toEqual(defaultBrief);
	});

	it('adds the office chatter, written alongside the brief, to the finished brief', async () => {
		const chatter = { remarks: ['Max owns an ErgoDox EZ.'], talks: [] };
		mocks.chatter.mockResolvedValue(chatter);
		fakeStream(defaultBrief);
		const { streamed, result } = await drain(generateWorld({ seed: 850 }));
		expect(mocks.chatter).toHaveBeenCalledTimes(1);
		expect(mocks.chatter.mock.calls[0][0].premise).toEqual(expect.any(String));
		expect(result.brief).toEqual({ ...defaultBrief, chatter });
		expect(streamed.at(-1)).toEqual(result.brief);
		// Only the brief that is done carries it.
		expect(streamed.slice(0, -1).every((b) => !b.chatter)).toBe(true);
	});

	it('defaults to gpt-6-luna with low reasoning, one attempt, no storage and a timeout', async () => {
		fakeStream(defaultBrief);
		await drain(generateWorld({ previous: { company: 'Old Co', vibe: 'cozy' } }));
		expect(mocks.responses).toHaveBeenCalledWith('gpt-6-luna');
		const options = mocks.streamText.mock.calls[0][0] as StreamOptions;
		expect(options.reasoning).toBe('low');
		expect(options.maxRetries).toBe(0);
		expect(options.maxOutputTokens).toBeLessThanOrEqual(12_000);
		expect(options.abortSignal).toBeInstanceOf(AbortSignal);
		expect(options.providerOptions).toEqual({ openai: { store: false } });
		expect(options.instructions).toBe(WORLD_INSTRUCTIONS);
		expect(options.prompt).toContain('"Old Co"');
	});

	it('uses QUEST_WORLD_MODEL when set', async () => {
		vi.stubEnv('QUEST_WORLD_MODEL', 'other-model');
		fakeStream(defaultBrief);
		await drain(generateWorld());
		expect(mocks.responses).toHaveBeenCalledWith('other-model');
	});

	it('drops cast members and landmark names that mention Max', async () => {
		fakeStream({
			...defaultBrief,
			landmarks: { ...defaultBrief.landmarks, library: "Max's Books", max: "Max's Den" },
			cast: [
				...defaultBrief.cast,
				{ name: 'Zed', character: 'intern', zone: 'desks', activity: 'typing', line: 'Max is great.' },
			],
		});
		const { result } = await drain(generateWorld());
		expect(result.brief.cast.map((c) => c.name)).not.toContain('Zed');
		expect(result.brief.landmarks.library).toBeUndefined();
		expect(result.brief.landmarks.max).toBe("Max's Den");
	});

	it('fails when moderation flags the text or is unavailable', async () => {
		fakeStream(defaultBrief);
		mocks.moderate.mockResolvedValueOnce({ results: [{ flagged: true }] });
		await expect(drain(generateWorld())).rejects.toBeInstanceOf(WorldGenerationError);
		fakeStream(defaultBrief);
		mocks.moderate.mockRejectedValueOnce(new Error('down'));
		await expect(drain(generateWorld())).rejects.toThrow(/could not check/);
	});

	it('fails when the model errors, even after part of the brief', async () => {
		fakeStream(defaultBrief, { error: new Error('boom'), cut: 20 });
		await expect(drain(generateWorld())).rejects.toThrow(/did not answer/);
	});

	it('refuses a brief too thin to be an office', async () => {
		fakeStream({ company: 'Tiny', zones: [{ kind: 'desks', name: 'A', story: '' }] });
		await expect(drain(generateWorld())).rejects.toThrow(/too little/);
	});

	it('fails when the caller aborts', async () => {
		const controller = new AbortController();
		controller.abort();
		fakeStream(defaultBrief);
		await expect(drain(generateWorld({ signal: controller.signal }))).rejects.toThrow(/cancelled/);
	});
});

describe('prompt', () => {
	it('documents every zone and asks for exactly the free rooms', () => {
		for (const kind of [...requiredZones, ...optionalZones]) expect(WORLD_INSTRUCTIONS).toContain(`- ${kind}`);
		const premise = pickPremise(850, null, () => 0.5);
		expect(premise.optionalZones).toBe(optionalRoomCount(planFloor(850)));
		const prompt = buildRunPrompt(premise, null);
		expect(prompt).toContain(`exactly ${premise.optionalZones}`);
		expect(prompt).not.toContain('previous');
	});

	it('avoids the previous vibe', () => {
		for (let i = 0; i < 20; i++) expect(pickPremise(1, { company: 'X', vibe: 'neon' }).vibe).not.toBe('neon');
	});
});
