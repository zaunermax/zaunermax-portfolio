import type { Brief } from './schema';

/** A world as persisted by the server and handed to the page. */
export type StoredWorld = {
	id: string;
	/** WORLD_VERSION; older formats fall back to the default world. */
	version: number;
	/** Drives the floorplan and every placement; compileWorld(brief, seed) is the office. */
	seed: number;
	/** Already sanitized. */
	brief: Brief;
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
 * `brief` events carry the whole settled brief so far (sanitized), so a late follower only
 * needs the latest one. A brief with a `closing` is the whole brief: the model is done and the
 * server is checking and moderating the office. The server persists the world before sending "done"; on "error" the
 * previous world stays.
 */
export type WorldStreamEvent =
	| { type: 'start'; id: string; createdAt: string; seed: number }
	| { type: 'brief'; brief: Brief }
	| { type: 'done'; world: StoredWorld; nextGenerationAt: string }
	| { type: 'error'; message: string };
