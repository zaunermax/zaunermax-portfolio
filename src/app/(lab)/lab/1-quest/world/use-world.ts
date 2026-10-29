'use client';

import { useEffect, useReducer, useRef, type Dispatch, type RefObject } from 'react';
import {
	WORLD_API,
	type StoredWorld,
	type WorldState,
	type WorldStreamEvent,
} from './contract';
import type { WorldOp } from './schema';

export type WorldLogEntry = {
	id: string;
	kind: 'system' | 'story' | 'error';
	text: string;
};

export type UseWorld = {
	worldId: string;
	/** Ops of the world on screen. While generating, this starts empty and grows op by op. */
	ops: WorldOp[];
	status: 'ready' | 'generating' | 'error';
	error: string | null;
	/** Build narration and system messages for the chat log, oldest first. */
	log: WorldLogEntry[];
	nextGenerationAt: Date | null;
	/** False while cooling down or while any generation runs. */
	canGenerate: boolean;
	/** Starts a generation and streams ops into `ops`. */
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
	committed: { id: string; ops: WorldOp[] };
	ops: WorldOp[];
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
		committed: { id: initial.world.id, ops: initial.world.ops },
		ops: initial.world.ops,
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

function worldName(ops: WorldOp[]) {
	const meta = ops.find((op) => op.type === 'meta');
	return meta?.type === 'meta' ? meta.name : 'The new world';
}

function swapIn(state: State, world: StoredWorld): State {
	return append(
		{
			...state,
			committed: { id: world.id, ops: world.ops },
			ops: world.ops,
			status: 'ready',
			error: null,
			streaming: false,
		},
		'system',
		`${worldName(world.ops)} is ready.`,
	);
}

function fail(state: State, message: string): State {
	return append(
		{
			...state,
			ops: state.streaming ? state.committed.ops : state.ops,
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
							ops: [],
							status: 'generating',
							error: null,
							streaming: true,
							othersGenerating: false,
						},
						'system',
						action.origin === 'own'
							? 'The forge awakens. A new world takes shape…'
							: 'Another traveller is forging a new world. Watch it take shape…',
					);
				case 'op': {
					if (!state.streaming) return state;
					const next = { ...state, ops: [...state.ops, event.op] };
					return event.op.story ? append(next, 'story', event.op.story) : next;
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
			return typeof event.id === 'string';
		case 'op':
			return typeof event.op === 'object' && event.op !== null;
		case 'done':
			return Array.isArray((event.world as StoredWorld | undefined)?.ops);
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
	'Lost the connection to the forge. The new world will appear here once it is finished.';

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
					message: 'The forge could not be reached. Check your connection and try again.',
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
					? `Not yet: a new world can be forged at ${clockTime(nextGenerationAt)}.`
					: (serverMessage ?? 'The forge failed. Please try again later.'),
		});
	});
}

/** Streams a running generation when this instance has one, else applies the latest state. */
export function follow(runtime: Runtime) {
	return exclusive(runtime, async (signal) => {
		try {
			const response = await fetch(`${WORLD_API}?follow=1`, {
				signal,
				cache: 'no-store',
			});
			if (!response.ok) return;
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
		}
	});
}

// ---------------------------------------------------------------------------------------------
// Hook

export function useWorld(initial: WorldState): UseWorld {
	const [state, dispatch] = useReducer(reduceWorldState, initial, initWorldState);
	const busy = useRef(false);
	const active = useRef<AbortController | null>(null);
	const othersGenerating = useRef(state.othersGenerating);
	const wake = useRef<(() => void) | null>(null);

	useEffect(() => {
		othersGenerating.current = state.othersGenerating;
		if (state.othersGenerating) wake.current?.();
	}, [state.othersGenerating]);

	// Poll for other visitors' generations and new worlds; follow live when one runs.
	useEffect(() => {
		const runtime: Runtime = { dispatch, busy, active };
		let timer: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;
		const schedule = (ms: number) => {
			clearTimeout(timer);
			if (!stopped) timer = setTimeout(tick, ms);
		};
		async function tick() {
			if (!busy.current && document.visibilityState === 'visible') await follow(runtime);
			schedule(othersGenerating.current ? FOLLOW_POLL_MS : IDLE_POLL_MS);
		}
		wake.current = () => schedule(0);
		schedule(othersGenerating.current ? 0 : IDLE_POLL_MS);
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
		ops: state.ops,
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
