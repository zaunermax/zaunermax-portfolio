import { z } from 'zod';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../world/schema';

/**
 * The live room: one WebSocket per visitor to the global QuestRoom Durable Object. Visitors see
 * each other walk around and wave; everyone connected hears when a redeploy starts or ends and
 * then follows it over the existing world stream (WORLD_API?follow=1).
 *
 * Players are anonymous. The server assigns a secret session id (kept by the client in
 * sessionStorage to resume after a reconnect) and broadcasts only a public id derived from it.
 * No IP, user agent or other identifying detail ever leaves the room.
 */

export const ROOM_API = '/api/lab/quest/room';

/** Query parameter carrying the session id to resume. */
export const SESSION_PARAM = 'session';

/** Hard cap on concurrent players; one more is closed with CLOSE_FULL. */
export const ROOM_CAP = 50;

/** Close codes the client acts on (4000-4999 is the application range). */
export const CLOSE_FULL = 4001;
/** The same session connected again, from a reconnect or a duplicated tab. */
export const CLOSE_REPLACED = 4002;
/** Multiplayer is switched off (QUEST_MULTIPLAYER). */
export const CLOSE_DISABLED = 4003;
/** No sign of life for STALE_MS. */
export const CLOSE_STALE = 4004;

/** Keepalive: the room answers PING with PONG without waking up (auto-response). */
export const PING = 'ping';
export const PONG = 'pong';
export const PING_EVERY_MS = 30_000;
/** A socket silent for this long (no message, no ping) is dropped. */
export const STALE_MS = 3 * 60_000;

/** Largest message the room accepts, in UTF-16 code units; larger ones are dropped. */
export const MAX_MESSAGE_LENGTH = 256;
/** Per-socket token bucket: excess messages are dropped. Clients send moves at 10 Hz at most. */
export const RATE_BURST = 20;
export const RATE_PER_SECOND = 15;
/** At most one wave per this many ms per player. */
export const EMOTE_COOLDOWN_MS = 1_500;

export const EMOTES = ['wave'] as const;
export type Emote = (typeof EMOTES)[number];

/** Server-issued session ids are UUIDs; anything else is ignored and a new one is issued. */
export const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Public ids are 16 lowercase hex characters. */
export const PUBLIC_ID = /^[0-9a-f]{16}$/;

/** A player's place: cell-space position, heading in radians (0 faces south), walking or not. */
export type Pose = { x: number; y: number; h: number; m: boolean };
export type PlayerState = Pose & { id: string };

// ---------------------------------------------------------------------------------------------
// Client -> room

const finite = z.number().finite();

export const clientMessage = z.discriminatedUnion('t', [
	z.object({ t: z.literal('move'), x: finite, y: finite, h: finite, m: z.boolean() }).strict(),
	z.object({ t: z.literal('emote'), e: z.enum(EMOTES) }).strict(),
]);
export type ClientMessage = z.infer<typeof clientMessage>;

// ---------------------------------------------------------------------------------------------
// Room -> client

export type ForgePhase = 'start' | 'done' | 'error';

export type ServerMessage =
	/** First message after joining. `players` are the others who have a position. */
	| { t: 'welcome'; you: string; session: string; players: PlayerState[] }
	/** Someone moved (or appeared: an unknown id is a new player). Never echoed to the mover. */
	| ({ t: 'move' } & PlayerState)
	| { t: 'leave'; id: string }
	| { t: 'emote'; id: string; e: Emote }
	/** A redeploy started, finished or failed; follow WORLD_API to watch or catch up. */
	| { t: 'forge'; phase: ForgePhase };

/** Lenient parse of what the room sends; anything unexpected is null. */
export function parseServerMessage(data: unknown): ServerMessage | null {
	if (typeof data !== 'string' || data.length > 64 * 1024) return null;
	let value: unknown;
	try {
		value = JSON.parse(data);
	} catch {
		return null;
	}
	const parsed = serverMessage.safeParse(value);
	return parsed.success ? (parsed.data as ServerMessage) : null;
}

const playerState = z.object({
	id: z.string().regex(PUBLIC_ID),
	x: finite,
	y: finite,
	h: finite,
	m: z.boolean(),
});

const serverMessage = z.discriminatedUnion('t', [
	z.object({
		t: z.literal('welcome'),
		you: z.string().regex(PUBLIC_ID),
		session: z.string().regex(SESSION_ID),
		players: z.array(playerState).max(ROOM_CAP),
	}),
	playerState.extend({ t: z.literal('move') }),
	z.object({ t: z.literal('leave'), id: z.string().regex(PUBLIC_ID) }),
	z.object({ t: z.literal('emote'), id: z.string().regex(PUBLIC_ID), e: z.enum(EMOTES) }),
	z.object({ t: z.literal('forge'), phase: z.enum(['start', 'done', 'error']) }),
]);

// ---------------------------------------------------------------------------------------------
// Shared helpers

/** Keeps a position inside the office grid and the heading in (-PI, PI], rounded for the wire. */
export function clampPose(pose: Pose): Pose {
	const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
	let h = pose.h % (Math.PI * 2);
	if (h > Math.PI) h -= Math.PI * 2;
	if (h <= -Math.PI) h += Math.PI * 2;
	const round = (v: number) => Math.round(v * 100) / 100;
	return {
		x: round(clamp(pose.x, WORLD_WIDTH)),
		y: round(clamp(pose.y, WORLD_HEIGHT)),
		h: round(h),
		m: pose.m,
	};
}
