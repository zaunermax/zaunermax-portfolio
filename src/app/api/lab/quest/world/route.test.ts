import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	generateWorld: vi.fn(),
	after: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-only/openai-client', () => ({ aiOpenAI: {}, openai: {} }));
vi.mock('next/server', () => ({ after: mocks.after, connection: vi.fn(async () => {}) }));
vi.mock('@/app/(lab)/lab/1-quest/world/generate', async (original) => ({
	...(await original<typeof import('@/app/(lab)/lab/1-quest/world/generate')>()),
	generateWorld: mocks.generateWorld,
}));

import type {
	WorldState,
	WorldStreamEvent,
} from '@/app/(lab)/lab/1-quest/world/contract';
import { WorldGenerationError } from '@/app/(lab)/lab/1-quest/world/generate';
import { defaultBrief } from '@/app/(lab)/lab/1-quest/world/default-world';
import { sanitizeBrief } from '@/app/(lab)/lab/1-quest/world/sanitize';
import { createFileWorldStore, setWorldStore } from '@/app/(lab)/lab/1-quest/world/store';
import { currentJob } from '@/app/(lab)/lab/1-quest/world/forge';
import { GET, POST } from './route';

const final = sanitizeBrief({ ...defaultBrief, company: 'Frost Labs' });
const briefs = [1, 3, 6, defaultBrief.zones.length].map((zones) => ({
	...final,
	zones: final.zones.slice(0, zones),
	cast: [],
}));

let dir: string;
let ip = 0;

/** A fake generator that can be held open with `gate` and fail with `failWith`. */
function fakeGeneration({
	gate,
	failWith,
}: { gate?: Promise<void>; failWith?: Error } = {}) {
	mocks.generateWorld.mockImplementation(async function* ({ seed }: { seed: number }) {
		for (const [index, brief] of briefs.entries()) {
			if (index === 2 && gate) await gate;
			yield brief;
		}
		if (failWith) throw failWith;
		return {
			brief: final,
			seed,
			model: 'test-model',
			premise: {},
			usage: null,
			finishReason: 'stop',
			durationMs: 5,
		};
	});
}

function post(headers: Record<string, string> = {}) {
	return POST(
		new Request('http://localhost/api/lab/quest/world', {
			method: 'POST',
			headers: { 'x-forwarded-for': `10.0.0.${++ip}`, ...headers },
			body: 'ignored visitor text',
		}),
	);
}

async function events(response: Response): Promise<WorldStreamEvent[]> {
	const text = await response.text();
	return text
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

async function state(): Promise<WorldState> {
	return (await GET(new Request('http://localhost/api/lab/quest/world'))).json();
}

beforeEach(async () => {
	vi.clearAllMocks();
	vi.spyOn(console, 'info').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.stubEnv('QUEST_WORLD_COOLDOWN_MINUTES', '60');
	dir = await mkdtemp(path.join(tmpdir(), 'quest-route-'));
	setWorldStore(createFileWorldStore(dir));
});

afterEach(async () => {
	await currentJob()?.done;
	setWorldStore(null);
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	await rm(dir, { recursive: true, force: true });
});

describe('GET', () => {
	it('returns the world state without caching', async () => {
		const response = await GET(new Request('http://localhost/api/lab/quest/world'));
		expect(response.headers.get('cache-control')).toBe('no-store');
		const body = (await response.json()) as WorldState;
		expect(body).toMatchObject({ nextGenerationAt: null, generating: false });
		expect(body.world.source).toBe('default');
	});

	it('?follow=1 falls back to JSON state when nothing runs here', async () => {
		const response = await GET(
			new Request('http://localhost/api/lab/quest/world?follow=1'),
		);
		expect(response.headers.get('content-type')).toContain('application/json');
	});
});

describe('POST', () => {
	it('streams start, the growing brief and done, then persists the world', async () => {
		fakeGeneration();
		const response = await post();
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/x-ndjson');
		expect(mocks.after).toHaveBeenCalledWith(expect.any(Promise));

		const stream = await events(response);
		expect(stream[0]).toMatchObject({ type: 'start', seed: expect.any(Number) });
		expect(stream.filter((event) => event.type === 'brief')).toHaveLength(briefs.length);
		const done = stream.at(-1);
		expect(done?.type).toBe('done');
		if (done?.type !== 'done') return;
		expect(done.world.brief).toEqual(final);
		expect(done.world.seed).toBe(stream[0].type === 'start' ? stream[0].seed : -1);
		expect(done.world.source).toBe('generated');

		const current = await state();
		expect(current.world.id).toBe(done.world.id);
		expect(current.nextGenerationAt).toBe(done.nextGenerationAt);
		expect(mocks.generateWorld).toHaveBeenCalledWith({
			previous: expect.objectContaining({ company: defaultBrief.company }),
			seed: expect.any(Number),
		});
	});

	it('enforces the global cooldown with 429 and a plain message', async () => {
		fakeGeneration();
		await events(await post());
		const response = await post();
		expect(response.status).toBe(429);
		const body = await response.json();
		expect(body.message).toMatch(/^The office can be redeployed in \d+ minutes\.$/);
		expect(Date.parse(body.nextGenerationAt)).toBeGreaterThan(Date.now());
		expect(response.headers.get('retry-after')).toMatch(/^\d+$/);
		expect(mocks.generateWorld).toHaveBeenCalledTimes(1);
	});

	it('is single-flight (409) and lets others follow the running generation', async () => {
		let open!: () => void;
		fakeGeneration({ gate: new Promise<void>((resolve) => (open = resolve)) });
		const first = await post();

		const second = await post();
		expect(second.status).toBe(409);
		expect((await second.json()).message).toMatch(/Another visitor/);
		expect((await state()).generating).toBe(true);

		const follower = await GET(
			new Request('http://localhost/api/lab/quest/world?follow=1'),
		);
		expect(follower.headers.get('content-type')).toContain('application/x-ndjson');

		open();
		const [mine, theirs] = await Promise.all([events(first), events(follower)]);
		// A late follower gets the start, the latest brief so far, then everything live.
		expect(theirs[0]).toEqual(mine[0]);
		expect(theirs.at(-1)).toEqual(mine.at(-1));
		expect(mine.slice(-theirs.length + 1)).toEqual(theirs.slice(1));
		expect(mocks.generateWorld).toHaveBeenCalledTimes(1);
	});

	it('keeps generating and persists after the visitor disconnects', async () => {
		let open!: () => void;
		fakeGeneration({ gate: new Promise<void>((resolve) => (open = resolve)) });
		const response = await post();
		const reader = response.body!.getReader();
		await reader.read();
		await reader.cancel();
		open();
		await currentJob()?.done;
		const current = await state();
		expect(current.world.source).toBe('generated');
		expect(current.generating).toBe(false);
	});

	it('reports failures, keeps the previous world and only holds retries back briefly', async () => {
		fakeGeneration({
			failWith: new WorldGenerationError('The forge produced too little.'),
		});
		const stream = await events(await post());
		const last = stream.at(-1);
		expect(last).toEqual({
			type: 'error',
			message:
				'The forge produced too little. The previous office stays; try again in 2 minutes.',
		});
		const current = await state();
		expect(current.world.source).toBe('default');
		expect(current.generating).toBe(false);
		const retryAt = Date.parse(current.nextGenerationAt!);
		expect(retryAt - Date.now()).toBeLessThanOrEqual(2 * 60_000);
		expect(retryAt - Date.now()).toBeGreaterThan(60_000);
	});

	it('hides unexpected error details from visitors', async () => {
		fakeGeneration({ failWith: new Error('secret stack detail') });
		const last = (await events(await post())).at(-1);
		expect(last?.type).toBe('error');
		expect(JSON.stringify(last)).not.toContain('secret');
	});

	it('limits attempts per visitor', async () => {
		vi.stubEnv('QUEST_WORLD_COOLDOWN_MINUTES', '0');
		fakeGeneration();
		const headers = { 'x-forwarded-for': '192.0.2.77' };
		for (let i = 0; i < 3; i++) {
			const response = await post(headers);
			expect(response.status).toBe(200);
			await events(response);
		}
		const limited = await post(headers);
		expect(limited.status).toBe(429);
		expect((await limited.json()).message).toMatch(
			/You have started a few redeploys already/,
		);
	});

	it('rejects cross-site requests', async () => {
		fakeGeneration();
		expect((await post({ 'sec-fetch-site': 'cross-site' })).status).toBe(403);
		expect(mocks.generateWorld).not.toHaveBeenCalled();
	});

	it('answers 503 when the forge state cannot be stored', async () => {
		setWorldStore({
			...createFileWorldStore(dir),
			readState: async () => {
				throw new Error('disk full');
			},
		});
		expect((await post()).status).toBe(503);
	});

	it('never reads the request body', async () => {
		fakeGeneration();
		const request = new Request('http://localhost/api/lab/quest/world', {
			method: 'POST',
			body: 'make a world about something else',
		});
		const response = await POST(request);
		expect(request.bodyUsed).toBe(false);
		await events(response);
		const stored = JSON.parse(await readFile(path.join(dir, 'current.json'), 'utf8'));
		expect(stored.brief).toEqual(final);
	});
});
