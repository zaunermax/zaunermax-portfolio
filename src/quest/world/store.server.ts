import { randomBytes } from 'node:crypto';
import type { StoredWorld, WorldState } from './contract';
import { defaultBrief, DEFAULT_SEED } from './default-world';
import { sanitizeBrief } from './sanitize';
import { WORLD_VERSION } from './schema';

export type ForgeLock = { id: string; startedAt: string; expiresAt: string };

export type ForgeState = {
	/** Start of the last successful generation; the cooldown counts from here. */
	lastGeneratedAt: string | null;
	/** End of the last failed generation; failures only block for FAILURE_BACKOFF_MS. */
	lastFailedAt: string | null;
	/** Held while a generation runs; expires so a crashed run can't block forever. */
	lock: ForgeLock | null;
};

export interface WorldStore {
	/** The raw stored current world, or null. Callers validate it. */
	readCurrent(): Promise<unknown>;
	/** Writes the world to history and makes it current. `details` only go to history. */
	commitWorld(lock: ForgeLock, world: StoredWorld, state: ForgeState, details?: Record<string, unknown>): Promise<boolean>;
	readState(): Promise<ForgeState>;
	/**
	 * Atomic read-modify-write of the forge state: `update` sees the latest state and returns the
	 * state to write (or null to leave it) plus a result.
	 */
	updateState<T>(
		update: (state: ForgeState) => { state: ForgeState | null; result: T },
	): Promise<T>;
}

export const LOCK_TTL_MS = 3 * 60_000;
export const FAILURE_BACKOFF_MS = 2 * 60_000;
const DEFAULT_COOLDOWN_MINUTES = 60;

export function cooldownMs() {
	const minutes = Number(process.env.QUEST_WORLD_COOLDOWN_MINUTES);
	const valid =
		process.env.QUEST_WORLD_COOLDOWN_MINUTES?.trim() &&
		Number.isFinite(minutes) &&
		minutes >= 0;
	return Math.min(valid ? minutes : DEFAULT_COOLDOWN_MINUTES, 24 * 60) * 60_000;
}

export const EMPTY_STATE: ForgeState = { lastGeneratedAt: null, lastFailedAt: null, lock: null };
const WORLD_ID = /^[a-z0-9-]{1,64}$/;

function isoOrNull(value: unknown) {
	return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

export function parseState(raw: unknown): ForgeState {
	if (typeof raw !== 'object' || raw === null) return EMPTY_STATE;
	const value = raw as Record<string, unknown>;
	const lock = value.lock as Record<string, unknown> | null | undefined;
	const lockId = typeof lock?.id === 'string' ? lock.id : null;
	const startedAt = isoOrNull(lock?.startedAt);
	const expiresAt = isoOrNull(lock?.expiresAt);
	return {
		lastGeneratedAt: isoOrNull(value.lastGeneratedAt),
		lastFailedAt: isoOrNull(value.lastFailedAt),
		lock: lockId && startedAt && expiresAt ? { id: lockId, startedAt, expiresAt } : null,
	};
}


// ---------------------------------------------------------------------------------------------
// Worlds

export const DEFAULT_WORLD_ID = 'default';

export function defaultWorld(): StoredWorld {
	return {
		id: DEFAULT_WORLD_ID,
		version: WORLD_VERSION,
		seed: DEFAULT_SEED,
		brief: sanitizeBrief(defaultBrief),
		createdAt: new Date(0).toISOString(),
		source: 'default',
		model: null,
	};
}

/** A stored world of the current format, sanitized; anything else (old fantasy worlds) is null. */
export function parseWorld(raw: unknown): StoredWorld | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const value = raw as Record<string, unknown>;
	const createdAt = isoOrNull(value.createdAt);
	if (typeof value.id !== 'string' || !WORLD_ID.test(value.id) || !createdAt) return null;
	if (value.version !== WORLD_VERSION) return null;
	const seed = value.seed;
	if (typeof seed !== 'number' || !Number.isSafeInteger(seed) || seed < 0) return null;
	const brief = sanitizeBrief(value.brief);
	if (!brief.company) return null;
	return {
		id: value.id,
		version: WORLD_VERSION,
		seed,
		brief,
		createdAt,
		source: value.source === 'generated' ? 'generated' : 'default',
		model: typeof value.model === 'string' ? value.model : null,
	};
}

// ---------------------------------------------------------------------------------------------
// Forge state

/** Epoch ms when the next generation may start, or null when it may start now. */
export function nextGenerationTime(state: ForgeState, now: number): number | null {
	const blockedUntil = Math.max(
		state.lastGeneratedAt ? Date.parse(state.lastGeneratedAt) + cooldownMs() : -Infinity,
		state.lastFailedAt ? Date.parse(state.lastFailedAt) + FAILURE_BACKOFF_MS : -Infinity,
	);
	return blockedUntil > now ? blockedUntil : null;
}

function lockActive(state: ForgeState, now: number) {
	return state.lock !== null && Date.parse(state.lock.expiresAt) > now;
}

export type GenerationCheck =
	| { status: 'ready' }
	| { status: 'cooldown'; nextGenerationAt: string }
	| { status: 'busy' };

function check(state: ForgeState, now: number): GenerationCheck {
	// A running generation hasn't set lastGeneratedAt yet, so check the lock first.
	if (lockActive(state, now)) return { status: 'busy' };
	const next = nextGenerationTime(state, now);
	if (next !== null)
		return { status: 'cooldown', nextGenerationAt: new Date(next).toISOString() };
	return { status: 'ready' };
}


export type BeginResult =
	Exclude<GenerationCheck, { status: 'ready' }> | { status: 'started'; lock: ForgeLock };


export function createWorldService(store: WorldStore) {
	/** The world on display: the last generated one, or the default world. */
	async function getCurrentWorld(): Promise<StoredWorld> {
		try {
			return parseWorld(await store.readCurrent()) ?? defaultWorld();
		} catch (error) {
			console.error('[quest] could not read the current world', error);
			return defaultWorld();
		}
	}

	async function getWorldState(): Promise<WorldState> {
		const [world, state] = await Promise.all([
			getCurrentWorld(),
			store
				.readState()
				.catch((error) => {
					console.error('[quest] could not read the forge state', error);
					return EMPTY_STATE;
				}),
		]);
		const now = Date.now();
		const next = nextGenerationTime(state, now);
		return {
			world,
			nextGenerationAt: next === null ? null : new Date(next).toISOString(),
			generating: lockActive(state, now),
		};
	}

	/** Read-only pre-check, e.g. before spending a visitor's rate-limit budget. */
	async function checkGeneration(now = Date.now()): Promise<GenerationCheck> {
		return check(await store.readState(), now);
	}

	/** Atomically takes the generation lock if no generation runs and the cooldown has passed. */
	async function beginGeneration(now = Date.now()): Promise<BeginResult> {
		return store.updateState<BeginResult>((state) => {
			const result = check(state, now);
			if (result.status !== 'ready') return { state: null, result };
			const lock: ForgeLock = {
				id: `${now.toString(36)}-${randomBytes(4).toString('hex')}`,
				startedAt: new Date(now).toISOString(),
				expiresAt: new Date(now + LOCK_TTL_MS).toISOString(),
			};
			return { state: { ...state, lock }, result: { status: 'started', lock } };
		});
	}

	/** Persists the world, starts the cooldown from the generation's start and releases the lock. */
	async function completeGeneration(
		lock: ForgeLock,
		world: StoredWorld,
		details?: Record<string, unknown>,
	): Promise<{ nextGenerationAt: string }> {
		if (!WORLD_ID.test(world.id)) throw new Error(`Invalid world id: ${world.id}`);
		const committed = await store.commitWorld(lock, world, {
			lastGeneratedAt: lock.startedAt,
			lastFailedAt: null,
			lock: null,
		}, details);
		if (!committed) throw new Error('Generation lock is no longer owned');
		return {
			nextGenerationAt: new Date(Date.parse(lock.startedAt) + cooldownMs()).toISOString(),
		};
	}

	/** Releases the lock without starting the cooldown; retries are only briefly held back. */
	async function failGeneration(
		lock: ForgeLock,
		now = Date.now(),
	): Promise<{ nextGenerationAt: string }> {
		return store.updateState((state) => {
			if (state.lock?.id !== lock.id) return {
				state: null,
				result: { nextGenerationAt: new Date(nextGenerationTime(state, now) ?? now + FAILURE_BACKOFF_MS).toISOString() },
			};
			const next: ForgeState = {
				...state,
				lastFailedAt: new Date(now).toISOString(),
				lock: state.lock?.id === lock.id ? null : state.lock,
			};
			const at = nextGenerationTime(next, now) ?? now + FAILURE_BACKOFF_MS;
			return { state: next, result: { nextGenerationAt: new Date(at).toISOString() } };
		});
	}

	return { getCurrentWorld, getWorldState, checkGeneration, beginGeneration, completeGeneration, failGeneration };
}

export type WorldService = ReturnType<typeof createWorldService>;
