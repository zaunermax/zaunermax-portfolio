import 'server-only';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { connection } from 'next/server';
import type { StoredWorld, WorldState } from './contract';
import { defaultWorldOps } from './default-world';
import { sanitizeOps } from './sanitize';

/**
 * Persistence for the current world and the global forge state (cooldown + single-flight lock).
 *
 * Everything goes through the small WorldStore interface. The spike uses files under
 * `<repo>/.data/quest/`; production on serverless needs a shared adapter (Upstash Redis with
 * SET NX for the lock, Vercel Blob or Sanity for worlds) set via setWorldStore().
 */

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
	saveWorld(world: StoredWorld, details?: Record<string, unknown>): Promise<void>;
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

// ---------------------------------------------------------------------------------------------
// File adapter

const EMPTY_STATE: ForgeState = { lastGeneratedAt: null, lastFailedAt: null, lock: null };
const WORLD_ID = /^[a-z0-9-]{1,64}$/;

function isoOrNull(value: unknown) {
	return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function parseState(raw: unknown): ForgeState {
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

async function readJson(file: string): Promise<unknown> {
	let text: string;
	try {
		text = await readFile(file, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw error;
	}
	try {
		return JSON.parse(text);
	} catch {
		console.warn(`[quest] ignoring unreadable ${file}`);
		return null;
	}
}

/** Write to a temp file and rename, so readers never see half a file. */
async function writeJson(file: string, value: unknown) {
	await mkdir(path.dirname(file), { recursive: true });
	const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
	await writeFile(temp, JSON.stringify(value), 'utf8');
	await rename(temp, file);
}

/**
 * Serializes state updates within this process (the file adapter is single-instance anyway).
 * Kept on globalThis because the page and the route handler may load separate module copies.
 */
const QUEUES_KEY = Symbol.for('zaunermax.quest.stateQueues');
const queues: Map<string, Promise<unknown>> = ((globalThis as Record<symbol, unknown>)[
	QUEUES_KEY
] ??= new Map()) as Map<string, Promise<unknown>>;
function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
	const previous = queues.get(key) ?? Promise.resolve();
	const next = previous.then(task, task);
	queues.set(
		key,
		next.catch(() => {}),
	);
	return next;
}

export function createFileWorldStore(dir: string): WorldStore {
	const currentFile = path.join(dir, 'current.json');
	const stateFile = path.join(dir, 'state.json');
	const readState = async () => parseState(await readJson(stateFile));

	return {
		readCurrent: () => readJson(currentFile),
		async saveWorld(world, details) {
			if (!WORLD_ID.test(world.id)) throw new Error(`Invalid world id: ${world.id}`);
			await writeJson(path.join(dir, 'history', `${world.id}.json`), {
				...world,
				...(details && { details }),
			});
			await writeJson(currentFile, world);
		},
		readState,
		updateState: (update) =>
			serialize(stateFile, async () => {
				const { state, result } = update(await readState());
				if (state) await writeJson(stateFile, state);
				return result;
			}),
	};
}

const STORE_KEY = Symbol.for('zaunermax.quest.worldStore');
type StoreHolder = { [STORE_KEY]?: WorldStore | null };
let fileStore: WorldStore | null = null;

function store(): WorldStore {
	return (
		(globalThis as StoreHolder)[STORE_KEY] ??
		(fileStore ??= createFileWorldStore(path.join(process.cwd(), '.data', 'quest')))
	);
}

/** Swap the persistence adapter (tests, or a production adapter); null restores the file store. */
export function setWorldStore(next: WorldStore | null) {
	(globalThis as StoreHolder)[STORE_KEY] = next;
}

// ---------------------------------------------------------------------------------------------
// Worlds

export const DEFAULT_WORLD_ID = 'default';

export function defaultWorld(): StoredWorld {
	return {
		id: DEFAULT_WORLD_ID,
		ops: sanitizeOps(defaultWorldOps),
		createdAt: new Date(0).toISOString(),
		source: 'default',
		model: null,
	};
}

function parseWorld(raw: unknown): StoredWorld | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const value = raw as Record<string, unknown>;
	const ops = sanitizeOps(value.ops);
	const createdAt = isoOrNull(value.createdAt);
	if (typeof value.id !== 'string' || !WORLD_ID.test(value.id) || !createdAt) return null;
	if (ops[0]?.type !== 'meta') return null;
	return {
		id: value.id,
		ops,
		createdAt,
		source: value.source === 'generated' ? 'generated' : 'default',
		model: typeof value.model === 'string' ? value.model : null,
	};
}

/** The world on display: the last generated one, or the default world. */
export async function getCurrentWorld(): Promise<StoredWorld> {
	try {
		return parseWorld(await store().readCurrent()) ?? defaultWorld();
	} catch (error) {
		console.error('[quest] could not read the current world', error);
		return defaultWorld();
	}
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

export async function getWorldState(): Promise<WorldState> {
	// Live data: never prerender it into a static shell.
	await connection();
	const [world, state] = await Promise.all([
		getCurrentWorld(),
		store()
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

/** Read-only pre-check, e.g. before spending a visitor's rate-limit budget. */
export async function checkGeneration(now = Date.now()): Promise<GenerationCheck> {
	return check(await store().readState(), now);
}

export type BeginResult =
	Exclude<GenerationCheck, { status: 'ready' }> | { status: 'started'; lock: ForgeLock };

/** Atomically takes the generation lock if no generation runs and the cooldown has passed. */
export async function beginGeneration(now = Date.now()): Promise<BeginResult> {
	return store().updateState<BeginResult>((state) => {
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
export async function completeGeneration(
	lock: ForgeLock,
	world: StoredWorld,
	details?: Record<string, unknown>,
): Promise<{ nextGenerationAt: string }> {
	await store().saveWorld(world, details);
	await store().updateState((state) => ({
		state: {
			lastGeneratedAt: lock.startedAt,
			lastFailedAt: null,
			lock: state.lock?.id === lock.id ? null : state.lock,
		},
		result: undefined,
	}));
	return {
		nextGenerationAt: new Date(Date.parse(lock.startedAt) + cooldownMs()).toISOString(),
	};
}

/** Releases the lock without starting the cooldown; retries are only briefly held back. */
export async function failGeneration(
	lock: ForgeLock,
	now = Date.now(),
): Promise<{ nextGenerationAt: string }> {
	return store().updateState((state) => {
		const next: ForgeState = {
			...state,
			lastFailedAt: new Date(now).toISOString(),
			lock: state.lock?.id === lock.id ? null : state.lock,
		};
		const at = nextGenerationTime(next, now) ?? now + FAILURE_BACKOFF_MS;
		return { state: next, result: { nextGenerationAt: new Date(at).toISOString() } };
	});
}
