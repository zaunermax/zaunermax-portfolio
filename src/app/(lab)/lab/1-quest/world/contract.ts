import type { WorldOp } from './schema';

/** A world as persisted by the server and handed to the page. */
export type StoredWorld = {
	id: string;
	/** Already sanitized: clamped, truncated, within LIMITS. */
	ops: WorldOp[];
	createdAt: string;
	source: 'default' | 'generated';
	/** Model id for generated worlds. */
	model: string | null;
};

export type WorldState = {
	world: StoredWorld;
	/** When the next generation may start; null when it may start now. */
	nextGenerationAt: string | null;
	/** Another visitor's generation is running right now. */
	generating: boolean;
};

export const WORLD_API = '/api/lab/quest/world';

/**
 * GET  WORLD_API -> WorldState (JSON)
 * POST WORLD_API -> 429 { message, nextGenerationAt } while cooling down,
 *                   409 { message } while another generation runs,
 *                   200 application/x-ndjson stream of WorldStreamEvent, one JSON object per line.
 * The server persists the world before sending "done"; on "error" the previous world stays.
 */
export type WorldStreamEvent =
	| { type: 'start'; id: string; createdAt: string }
	| { type: 'op'; op: WorldOp }
	| { type: 'done'; world: StoredWorld; nextGenerationAt: string }
	| { type: 'error'; message: string };
