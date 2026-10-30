'use client';

import { useEffect, useReducer, useRef, type Dispatch, type RefObject } from 'react';
import {
	WORLD_API,
	type StoredWorld,
	type WorldState,
	type WorldStreamEvent,
} from './contract';
import { DEFAULT_ZONE_NAMES, sanitizeBrief } from './sanitize';
import type { Brief } from './schema';

export type WorldLogEntry = {
	id: string;
	kind: 'system' | 'story' | 'error';
	text: string;
};

export type UseWorld = {
	worldId: string;
	/** Brief of the office on screen. While generating, this starts empty and grows. */
	brief: Brief;
	seed: number;
	status: 'ready' | 'generating' | 'error';
	error: string | null;
	/** Build narration and system messages for the chat log, oldest first. */
	log: WorldLogEntry[];
	nextGenerationAt: Date | null;
	/** False while cooling down or while any generation runs. */
	canGenerate: boolean;
	/** Starts a generation and streams the brief into `brief`. */
	generate: () => Promise<void>;
};

/** While someone else's generation runs and can't be streamed from this instance. */
const FOLLOW_POLL_MS = 4_000;
/** Notices other visitors' generations and new worlds while idle. */
const IDLE_POLL_MS = 20_000;

// ---------------------------------------------------------------------------------------------
// State

type State = {
	/** The persisted world, restored when a generation fails midway. */
	committed: { id: string; brief: Brief; seed: number };
	brief: Brief;
	seed: number;
	status: UseWorld['status'];
	error: string | null;
	log: WorldLogEntry[];
	logSeq: number;
	nextGenerationAt: string | null;
	/** The nextGenerationAt value whose moment has passed. */
	cooledFor: string | null;
	/** A stream's `start` arrived and its terminal event has not. */
	streaming: boolean;
	/** Another visitor's generation runs and we only learn about it by polling. */
	othersGenerating: boolean;
};

type Origin = 'own' | 'follow';

type Action =
	| { type: 'event'; event: WorldStreamEvent; origin: Origin }
	| { type: 'rejected'; message: string; nextGenerationAt?: string; busy: boolean }
	| { type: 'lost'; message: string }
	| { type: 'polled'; state: WorldState }
	| { type: 'cooled'; at: string };

/** Exported for tests. */
export function initWorldState(initial: WorldState): State {
	return {
		committed: { id: initial.world.id, brief: initial.world.brief, seed: initial.world.seed },
		brief: initial.world.brief,
		seed: initial.world.seed,
		status: 'ready',
		error: null,
		log: [],
		logSeq: 0,
		nextGenerationAt: initial.nextGenerationAt,
		cooledFor: null,
		streaming: false,
		othersGenerating: initial.generating,
	};
}

function append(state: State, kind: WorldLogEntry['kind'], text: string): State {
	const logSeq = state.logSeq + 1;
	return { ...state, logSeq, log: [...state.log, { id: `world-${logSeq}`, kind, text }] };
}

const EMPTY_BRIEF = sanitizeBrief({});

/** Build-log lines for what a newer brief adds: zones, the event, arrivals, the closing. */
export function briefStories(prev: Brief, next: Brief): string[] {
	const out: string[] = [];
	if (next.opening && !prev.opening) out.push(next.opening);
	for (const zone of next.zones.slice(prev.zones.length))
		out.push(zone.story || `${zone.name} opens its doors.`);
	if (next.event.kind !== 'none' && prev.event.kind === 'none')
		out.push(next.event.story || `Today: ${next.event.title}`);
	for (const member of next.cast.slice(prev.cast.length)) {
		const zone = next.zones.find((z) => z.kind === member.zone)?.name ?? DEFAULT_ZONE_NAMES[member.zone];
		const pet = member.character === 'office_dog' || member.character === 'office_cat';
		out.push(pet ? `${member.name} trots into ${zone}.` : `${member.name} clocks in at ${zone}.`);
	}
	if (next.closing && !prev.closing) out.push(next.closing);
	return out;
}

function swapIn(state: State, world: StoredWorld): State {
	return append(
		{
			...state,
			committed: { id: world.id, brief: world.brief, seed: world.seed },
			brief: world.brief,
			seed: world.seed,
			status: 'ready',
			error: null,
			streaming: false,
		},
		'system',
		`${world.brief.company || 'The new office'} is open for business.`,
	);
}

function fail(state: State, message: string): State {
	return append(
		{
			...state,
			brief: state.streaming ? state.committed.brief : state.brief,
			seed: state.streaming ? state.committed.seed : state.seed,
			status: 'error',
			error: message,
			streaming: false,
		},
		'error',
		message,
	);
}

/** Exported for tests. */
export function reduceWorldState(state: State, action: Action): State {
	switch (action.type) {
		case 'event': {
			const { event } = action;
			switch (event.type) {
				case 'start':
					return append(
						{
							...state,
							brief: EMPTY_BRIEF,
							seed: event.seed,
							status: 'generating',
							error: null,
							streaming: true,
							othersGenerating: false,
						},
						'system',
						action.origin === 'own'
							? 'Redeploying the office… watch it come together.'
							: 'Someone else is redeploying the office. Watch it come together…',
					);
				case 'brief': {
					if (!state.streaming) return state;
					return briefStories(state.brief, event.brief).reduce(
						(next, text) => append(next, 'story', text),
						{ ...state, brief: event.brief },
					);
				}
				case 'done':
					return {
						...swapIn(state, event.world),
						nextGenerationAt: event.nextGenerationAt,
					};
				case 'error':
					return fail(state, event.message);
			}
			return state;
		}
		case 'rejected':
			return fail(
				{
					...state,
					nextGenerationAt: action.nextGenerationAt ?? state.nextGenerationAt,
					othersGenerating: action.busy || state.othersGenerating,
				},
				action.message,
			);
		case 'lost':
			// The server keeps generating; poll for the result.
			return fail({ ...state, othersGenerating: true }, action.message);
		case 'polled': {
			if (state.streaming) return state;
			const { world, generating, nextGenerationAt } = action.state;
			const next = { ...state, nextGenerationAt, othersGenerating: generating };
			return world.id !== state.committed.id ? swapIn(next, world) : next;
		}
		case 'cooled':
			return { ...state, cooledFor: action.at };
	}
}

// ---------------------------------------------------------------------------------------------
// Network

/** Parses NDJSON robustly across chunk boundaries; malformed lines are skipped. */
export async function* readNdjson(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	try {
		for (;;) {
			const { value, done } = await reader.read();
			buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = done ? '' : (lines.pop() ?? '');
			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					yield JSON.parse(line);
				} catch {
					/* A broken line is skipped; the rest of the stream still counts. */
				}
			}
			if (done) return;
		}
	} finally {
		reader.cancel().catch(() => {});
	}
}

function isEvent(value: unknown): value is WorldStreamEvent {
	if (typeof value !== 'object' || value === null) return false;
	const event = value as Record<string, unknown>;
	switch (event.type) {
		case 'start':
			return typeof event.id === 'string' && Number.isSafeInteger(event.seed);
		case 'brief':
			return typeof event.brief === 'object' && event.brief !== null;
		case 'done': {
			const world = event.world as StoredWorld | undefined;
			return typeof world?.brief === 'object' && Number.isSafeInteger(world.seed);
		}
		case 'error':
			return typeof event.message === 'string';
		default:
			return false;
	}
}

export type Runtime = {
	dispatch: Dispatch<Action>;
	/** A POST or follow stream is in flight. */
	busy: RefObject<boolean>;
	active: RefObject<AbortController | null>;
};

const LOST_MESSAGE =
	'Lost the connection to the redeploy. The new office will appear here once it is finished.';

async function consume(
	runtime: Runtime,
	body: ReadableStream<Uint8Array>,
	origin: Origin,
	signal: AbortSignal,
) {
	let started = false;
	try {
		for await (const value of readNdjson(body)) {
			if (!isEvent(value)) continue;
			if (value.type === 'start') started = true;
			runtime.dispatch({ type: 'event', event: value, origin });
			if (value.type === 'done' || value.type === 'error') return;
		}
	} catch {
		/* Network failure mid-stream: handled below. */
	}
	if (signal.aborted) return;
	if (started || origin === 'own')
		runtime.dispatch({ type: 'lost', message: LOST_MESSAGE });
}

/** Runs one request at a time; returns false when another one is in flight. */
async function exclusive(runtime: Runtime, task: (signal: AbortSignal) => Promise<void>) {
	if (runtime.busy.current) return false;
	runtime.busy.current = true;
	const controller = new AbortController();
	runtime.active.current = controller;
	try {
		await task(controller.signal);
	} finally {
		runtime.busy.current = false;
		if (runtime.active.current === controller) runtime.active.current = null;
	}
	return true;
}

function clockTime(iso: string) {
	return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Starts a generation and streams it; every failure ends up as an error in the state. */
export function postGenerate(runtime: Runtime) {
	return exclusive(runtime, async (signal) => {
		let response: Response;
		try {
			response = await fetch(WORLD_API, { method: 'POST', signal, cache: 'no-store' });
		} catch {
			if (!signal.aborted)
				runtime.dispatch({
					type: 'rejected',
					busy: false,
					message: 'The deploy server could not be reached. Check your connection and try again.',
				});
			return;
		}
		if (response.ok && response.body)
			return consume(runtime, response.body, 'own', signal);

		const body = (await response.json().catch(() => null)) as {
			message?: unknown;
			nextGenerationAt?: unknown;
		} | null;
		const nextGenerationAt =
			typeof body?.nextGenerationAt === 'string' ? body.nextGenerationAt : undefined;
		const serverMessage = typeof body?.message === 'string' ? body.message : null;
		runtime.dispatch({
			type: 'rejected',
			busy: response.status === 409,
			nextGenerationAt,
			message:
				response.status === 429 && nextGenerationAt
					? `Not yet: the office can be redeployed at ${clockTime(nextGenerationAt)}.`
					: (serverMessage ?? 'The redeploy failed. Please try again later.'),
		});
	});
}

/**
 * Streams a running generation when this instance has one, else applies the latest state.
 * `onFail` hears when the server could not be reached or answered with an error.
 */
export function follow(runtime: Runtime, onFail?: () => void) {
	return exclusive(runtime, async (signal) => {
		try {
			const response = await fetch(`${WORLD_API}?follow=1`, {
				signal,
				cache: 'no-store',
			});
			if (!response.ok) {
				onFail?.();
				return;
			}
			if (response.headers.get('content-type')?.includes('ndjson') && response.body) {
				await consume(runtime, response.body, 'follow', signal);
			} else {
				runtime.dispatch({
					type: 'polled',
					state: (await response.json()) as WorldState,
				});
			}
		} catch {
			/* Offline or aborted: the next poll tries again. */
			if (!signal.aborted) onFail?.();
		}
	});
}

// ---------------------------------------------------------------------------------------------
// Hook

/**
 * The live room, when connected: it announces redeploys, so idle polling stops while `live`, and
 * every event (joining, a redeploy starting, finishing or failing) follows the world right away.
 */
export type WorldRoom = {
	live: boolean;
	subscribe: (listener: () => void) => () => void;
};

export function useWorld(initial: WorldState, room?: WorldRoom): UseWorld {
	const [state, dispatch] = useReducer(reduceWorldState, initial, initWorldState);
	const busy = useRef(false);
	const active = useRef<AbortController | null>(null);
	const othersGenerating = useRef(state.othersGenerating);
	const wake = useRef<((force?: boolean) => void) | null>(null);
	const live = useRef(room?.live ?? false);
	const roomLive = room?.live ?? false;
	const subscribeRoom = room?.subscribe;

	useEffect(() => {
		othersGenerating.current = state.othersGenerating;
		if (state.othersGenerating) wake.current?.();
	}, [state.othersGenerating]);

	// Back to polling as soon as the room is gone.
	useEffect(() => {
		live.current = roomLive;
		if (!roomLive) wake.current?.();
	}, [roomLive]);

	useEffect(() => subscribeRoom?.(() => wake.current?.(true)), [subscribeRoom]);

	// Poll for other visitors' generations and new worlds; follow live when one runs.
	useEffect(() => {
		const runtime: Runtime = { dispatch, busy, active };
		let timer: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;
		let forced = false;
		/** Failed forced follows in a row, for the retry backoff. */
		let retries = 0;
		const schedule = (ms: number | null) => {
			clearTimeout(timer);
			if (!stopped && ms !== null) timer = setTimeout(tick, ms);
		};
		/** Polls quickly while someone else's run is on, slowly while idle, never idle in the room. */
		const next = () =>
			othersGenerating.current ? FOLLOW_POLL_MS : live.current ? null : IDLE_POLL_MS;
		async function tick() {
			const force = forced;
			forced = false;
			const wanted =
				force ||
				(document.visibilityState === 'visible' &&
					(othersGenerating.current || !live.current));
			if (force && busy.current) {
				// A room event during another request: try again once it is done, rather than
				// miss the start of a redeploy.
				forced = true;
				schedule(500);
				return;
			}
			let failed = false;
			if (!busy.current && wanted) await follow(runtime, () => (failed = true));
			if (failed && force) {
				// The room will not announce this again: keep trying until the world is in sync.
				forced = true;
				schedule(Math.min(30_000, 2_000 * 2 ** retries++));
				return;
			}
			if (force) retries = 0;
			// A room event that arrived meanwhile still gets its own follow.
			schedule(forced ? 0 : next());
		}
		wake.current = (force = false) => {
			forced ||= force;
			schedule(0);
		};
		schedule(othersGenerating.current ? 0 : next());
		return () => {
			stopped = true;
			clearTimeout(timer);
			wake.current = null;
			// Deliberately the latest request (a POST or follow stream), not the one at mount.
			// eslint-disable-next-line react-hooks/exhaustive-deps
			active.current?.abort();
		};
	}, []);

	// Flip canGenerate when the cooldown ends.
	useEffect(() => {
		const at = state.nextGenerationAt;
		if (!at) return;
		const delay = Math.min(2 ** 31 - 1, Math.max(0, Date.parse(at) - Date.now()));
		const timer = setTimeout(() => dispatch({ type: 'cooled', at }), delay);
		return () => clearTimeout(timer);
	}, [state.nextGenerationAt]);

	const coolingDown =
		state.nextGenerationAt !== null && state.cooledFor !== state.nextGenerationAt;

	return {
		worldId: state.committed.id,
		brief: state.brief,
		seed: state.seed,
		status: state.status,
		error: state.error,
		log: state.log,
		nextGenerationAt: coolingDown ? new Date(state.nextGenerationAt!) : null,
		canGenerate: state.status !== 'generating' && !state.othersGenerating && !coolingDown,
		generate: async () => {
			const runtime: Runtime = { dispatch, busy, active };
			// Did nothing if a request was already in flight; otherwise re-sync right away
			// (follow a busy forge, pick up a failure's retry time).
			if (await postGenerate(runtime)) wake.current?.();
		},
	};
}
