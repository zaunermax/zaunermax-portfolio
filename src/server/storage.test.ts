import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createWorldService,
	defaultWorld,
	LOCK_TTL_MS,
} from '@/quest/world/store.server';
import { createDurableWorldStore, type SqlStorageAdapter } from './world-store.server';
import { takeLimits } from './limits-store.server';

let db: DatabaseSync;
let storage: SqlStorageAdapter;

beforeEach(() => {
	db = new DatabaseSync(':memory:');
	storage = {
		sql: {
			exec<T extends Record<string, SqlStorageValue>>(
				query: string,
				...bindings: SqlStorageValue[]
			) {
				const rows = db
					.prepare(query)
					.all(
						...bindings.map((value) =>
							value instanceof ArrayBuffer ? new Uint8Array(value) : value,
						),
					);
				return { toArray: () => rows as T[] };
			},
		},
		transactionSync<T>(closure: () => T): T {
			db.exec('BEGIN');
			try {
				const result = closure();
				db.exec('COMMIT');
				return result;
			} catch (error) {
				db.exec('ROLLBACK');
				throw error;
			}
		},
	};
});

afterEach(() => {
	db.close();
	vi.useRealTimers();
});

describe('DO SQLite storage logic', () => {
	it('publishes history, current and cooldown together and survives adapter recreation', async () => {
		const service = createWorldService(createDurableWorldStore(storage));
		const started = await service.beginGeneration();
		if (started.status !== 'started') throw new Error('Expected lock');
		const world = { ...defaultWorld(), id: started.lock.id };
		await service.completeGeneration(started.lock, world, { tokens: 123 });
		const recreated = createWorldService(createDurableWorldStore(storage));
		expect((await recreated.getWorldState()).world).toEqual(world);
		expect((await recreated.checkGeneration()).status).toBe('cooldown');
		const row = db.prepare('SELECT value FROM quest_history WHERE id = ?').get(world.id)!;
		expect(JSON.parse(String(row.value))).toMatchObject({
			id: world.id,
			details: { tokens: 123 },
		});
	});

	it('fences stale completion before any SQLite writes', async () => {
		vi.useFakeTimers();
		const store = createDurableWorldStore(storage);
		const service = createWorldService(store);
		const stale = await service.beginGeneration();
		if (stale.status !== 'started') throw new Error('Expected lock');
		vi.advanceTimersByTime(LOCK_TTL_MS + 1);
		const fresh = await service.beginGeneration();
		if (fresh.status !== 'started') throw new Error('Expected replacement lock');
		await expect(
			service.completeGeneration(stale.lock, { ...defaultWorld(), id: stale.lock.id }),
		).rejects.toThrow(/no longer owned/);
		expect(await store.readCurrent()).toBeNull();
		expect((await store.readState()).lock).toEqual(fresh.lock);
		expect(db.prepare('SELECT * FROM quest_history').all()).toEqual([]);
	});

	it('takes multiple fixed-window limits atomically and prunes expired counters', () => {
		db.exec(
			'CREATE TABLE counters (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)',
		);
		const limits = [
			{ key: 'ip', limit: 2, windowMs: 60_000 },
			{ key: 'global', limit: 3, windowMs: 120_000 },
		];
		expect(takeLimits(storage, limits, 1000)).toEqual({ ok: true });
		expect(takeLimits(storage, limits, 2000)).toEqual({ ok: true });
		expect(takeLimits(storage, limits, 3000)).toEqual({
			ok: false,
			retryAfterSeconds: 58,
		});
		expect(
			db.prepare('SELECT count FROM counters WHERE key = ?').get('global')?.count,
		).toBe(2);
		expect(takeLimits(storage, limits, 61_000)).toEqual({ ok: true });
		expect(takeLimits(storage, limits, 62_000)).toEqual({
			ok: false,
			retryAfterSeconds: 59,
		});
		expect(db.prepare('SELECT count FROM counters WHERE key = ?').get('ip')?.count).toBe(
			1,
		);
		expect(takeLimits(storage, limits, 121_000)).toEqual({ ok: true });
	});
});
