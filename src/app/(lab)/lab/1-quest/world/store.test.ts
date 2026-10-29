import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn(async () => {}) }));

import type { StoredWorld } from './contract';
import {
	beginGeneration,
	checkGeneration,
	completeGeneration,
	cooldownMs,
	createFileWorldStore,
	DEFAULT_WORLD_ID,
	failGeneration,
	FAILURE_BACKOFF_MS,
	getWorldState,
	LOCK_TTL_MS,
	setWorldStore,
	type ForgeLock,
} from './store';

let dir: string;

const world = (id: string): StoredWorld => ({
	id,
	ops: [
		{
			type: 'meta',
			name: 'Test Vale',
			tagline: 'A test.',
			biome: 'winter',
			timeOfDay: 'night',
			weather: 'snow',
			story: 'Snow falls.',
		},
		{ type: 'hill', x: 99, y: 3, radius: 3, height: 2, story: 'A hill.' },
	],
	createdAt: new Date().toISOString(),
	source: 'generated',
	model: 'test-model',
});

async function started(now?: number): Promise<ForgeLock> {
	const result = await beginGeneration(now);
	if (result.status !== 'started')
		throw new Error(`expected start, got ${result.status}`);
	return result.lock;
}

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), 'quest-store-'));
	setWorldStore(createFileWorldStore(dir));
	vi.stubEnv('QUEST_WORLD_COOLDOWN_MINUTES', '60');
});

afterEach(async () => {
	setWorldStore(null);
	vi.unstubAllEnvs();
	vi.useRealTimers();
	await rm(dir, { recursive: true, force: true });
});

describe('cooldownMs', () => {
	it.each([
		['60', 60],
		['1', 1],
		['0', 0],
		['', 60],
		['abc', 60],
		['-5', 60],
		['99999', 24 * 60],
	])('QUEST_WORLD_COOLDOWN_MINUTES=%j -> %i minutes', (value, minutes) => {
		vi.stubEnv('QUEST_WORLD_COOLDOWN_MINUTES', value);
		expect(cooldownMs()).toBe(minutes * 60_000);
	});
});

describe('world store', () => {
	it('serves the sanitized default world when nothing is stored', async () => {
		const state = await getWorldState();
		expect(state.world.id).toBe(DEFAULT_WORLD_ID);
		expect(state.world.source).toBe('default');
		expect(state.world.ops[0].type).toBe('meta');
		expect(state).toMatchObject({ nextGenerationAt: null, generating: false });
	});

	it('falls back to the default world when current.json is corrupt or invalid', async () => {
		await writeFile(path.join(dir, 'current.json'), '{nope');
		expect((await getWorldState()).world.id).toBe(DEFAULT_WORLD_ID);
		await writeFile(
			path.join(dir, 'current.json'),
			JSON.stringify({ id: '../../etc', ops: [] }),
		);
		expect((await getWorldState()).world.id).toBe(DEFAULT_WORLD_ID);
	});

	it('runs a generation: lock, persist, cooldown from the start', async () => {
		const t0 = Date.now();
		const lock = await started(t0);
		expect(await checkGeneration(t0 + 1000)).toEqual({ status: 'busy' });
		expect((await getWorldState()).generating).toBe(true);

		const stored = world(lock.id);
		const { nextGenerationAt } = await completeGeneration(lock, stored, { usage: 42 });
		expect(Date.parse(nextGenerationAt)).toBe(t0 + 60 * 60_000);

		const state = await getWorldState();
		expect(state.generating).toBe(false);
		expect(state.world.id).toBe(lock.id);
		// Re-sanitized on read: x clamped to the grid.
		expect(state.world.ops[1]).toMatchObject({ type: 'hill', x: 39 });
		expect(state.nextGenerationAt).toBe(nextGenerationAt);

		const history = JSON.parse(
			await readFile(path.join(dir, 'history', `${lock.id}.json`), 'utf8'),
		);
		expect(history).toMatchObject({ id: lock.id, details: { usage: 42 } });
		const current = JSON.parse(await readFile(path.join(dir, 'current.json'), 'utf8'));
		expect(current.details).toBeUndefined();

		expect(await beginGeneration(Date.now())).toEqual({
			status: 'cooldown',
			nextGenerationAt,
		});
		expect((await beginGeneration(t0 + 60 * 60_000 + 1)).status).toBe('started');
	});

	it('does not burn the cooldown on failure, but holds retries back briefly', async () => {
		const t0 = Date.now();
		const lock = await started(t0);
		const { nextGenerationAt } = await failGeneration(lock, t0 + 5_000);
		expect(Date.parse(nextGenerationAt)).toBe(t0 + 5_000 + FAILURE_BACKOFF_MS);
		expect(await checkGeneration(t0 + 6_000)).toEqual({
			status: 'cooldown',
			nextGenerationAt,
		});
		expect((await getWorldState()).world.id).toBe(DEFAULT_WORLD_ID);
		expect((await beginGeneration(t0 + 5_000 + FAILURE_BACKOFF_MS + 1)).status).toBe(
			'started',
		);
	});

	it('lets an expired lock from a crashed run be taken over', async () => {
		const t0 = Date.now();
		await started(t0);
		expect((await beginGeneration(t0 + LOCK_TTL_MS - 1)).status).toBe('busy');
		const lock = await started(t0 + LOCK_TTL_MS + 1);
		expect(lock.startedAt).toBe(new Date(t0 + LOCK_TTL_MS + 1).toISOString());
	});

	it('a late finisher does not release a newer lock', async () => {
		const t0 = Date.now();
		const stale = await started(t0);
		const fresh = await started(t0 + LOCK_TTL_MS + 1);
		await failGeneration(stale, t0 + LOCK_TTL_MS + 2);
		const state = JSON.parse(await readFile(path.join(dir, 'state.json'), 'utf8'));
		expect(state.lock.id).toBe(fresh.id);
	});

	it('hands the lock to exactly one of many concurrent starts', async () => {
		const results = await Promise.all(
			Array.from({ length: 10 }, () => beginGeneration()),
		);
		expect(results.filter((result) => result.status === 'started')).toHaveLength(1);
		expect(results.filter((result) => result.status === 'busy')).toHaveLength(9);
	});

	it('rejects unsafe world ids', async () => {
		const lock = await started();
		await expect(completeGeneration(lock, world('../escape'))).rejects.toThrow();
	});
});
