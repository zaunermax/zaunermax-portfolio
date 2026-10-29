import type { StoredWorld } from '@/quest/world/contract';
import {
	EMPTY_STATE,
	parseState,
	type ForgeLock,
	type ForgeState,
	type WorldStore,
} from '@/quest/world/store.server';

export type SqlStorageAdapter = {
	sql: {
		exec<T extends Record<string, SqlStorageValue>>(
			query: string,
			...bindings: SqlStorageValue[]
		): { toArray(): T[] };
	};
	transactionSync<T>(closure: () => T): T;
};

/** All mutations run synchronously in one SQLite transaction inside QuestForge. */
export function createDurableWorldStore(storage: SqlStorageAdapter): WorldStore {
	const sql = storage.sql;
	sql.exec(
		'CREATE TABLE IF NOT EXISTS quest_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
	);
	sql.exec(
		'CREATE TABLE IF NOT EXISTS quest_history (id TEXT PRIMARY KEY, value TEXT NOT NULL)',
	);
	const read = (key: string): unknown => {
		const row = sql
			.exec<{ value: string }>('SELECT value FROM quest_state WHERE key = ?', key)
			.toArray()[0];
		return row ? JSON.parse(row.value) : null;
	};
	const write = (key: string, value: unknown) => {
		sql.exec(
			'INSERT OR REPLACE INTO quest_state (key, value) VALUES (?, ?)',
			key,
			JSON.stringify(value),
		);
	};
	const readState = () => parseState(read('forge'));
	return {
		async readCurrent() {
			return read('current');
		},
		async readState() {
			return readState();
		},
		async updateState(update) {
			return storage.transactionSync(() => {
				const { state, result } = update(readState());
				if (state) write('forge', state);
				return result;
			});
		},
		async commitWorld(lock, world, state, details) {
			return storage.transactionSync(() => {
				const current = readState();
				if (
					current.lock?.id !== lock.id ||
					Date.parse(current.lock.expiresAt) <= Date.now()
				)
					return false;
				sql.exec(
					'INSERT OR REPLACE INTO quest_history (id, value) VALUES (?, ?)',
					world.id,
					JSON.stringify({ ...world, ...(details && { details }) }),
				);
				write('current', world);
				write('forge', state);
				return true;
			});
		},
	};
}

/** The shared store contract exercised by Node domain/handler tests. */
export function createMemoryWorldStore(initial: unknown = null) {
	let current: unknown = initial;
	let state: ForgeState = structuredClone(EMPTY_STATE);
	const history = new Map<string, StoredWorld & { details?: Record<string, unknown> }>();
	return {
		history,
		setCurrent(value: unknown) {
			current = value;
		},
		async readCurrent() {
			return structuredClone(current);
		},
		async readState() {
			return structuredClone(state);
		},
		async updateState<T>(
			update: (state: ForgeState) => { state: ForgeState | null; result: T },
		) {
			const next = update(structuredClone(state));
			if (next.state) state = structuredClone(next.state);
			return next.result;
		},
		async commitWorld(
			lock: ForgeLock,
			world: StoredWorld,
			next: ForgeState,
			details?: Record<string, unknown>,
		) {
			if (state.lock?.id !== lock.id || Date.parse(state.lock.expiresAt) <= Date.now())
				return false;
			history.set(world.id, structuredClone({ ...world, ...(details && { details }) }));
			current = structuredClone(world);
			state = structuredClone(next);
			return true;
		},
	} satisfies WorldStore & { history: typeof history; setCurrent(value: unknown): void };
}
