import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoredWorld, WorldState, WorldStreamEvent } from './contract';
import { defaultBrief } from './default-world';
import { sanitizeBrief } from './sanitize';
import { WORLD_VERSION, type Brief } from './schema';
import {
	follow,
	initWorldState,
	postGenerate,
	readNdjson,
	reduceWorldState,
	type Runtime,
} from './use-world';

function chunked(...chunks: (string | Uint8Array)[]) {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks)
				controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
			controller.close();
		},
	});
}

async function collect(stream: ReadableStream<Uint8Array>) {
	const values: unknown[] = [];
	for await (const value of readNdjson(stream)) values.push(value);
	return values;
}

describe('readNdjson', () => {
	it('reassembles lines split across chunks', async () => {
		expect(await collect(chunked('{"a":', '1}\n{"b"', ':2}\n', '{"c":3}\n'))).toEqual([
			{ a: 1 },
			{ b: 2 },
			{ c: 3 },
		]);
	});

	it('handles multi-byte characters split across chunks', async () => {
		const bytes = new TextEncoder().encode('{"t":"Grüße 🐸"}\n');
		const cut = bytes.indexOf(0xf0) + 2; // inside the frog emoji
		expect(
			await collect(chunked(bytes.slice(0, 7), bytes.slice(7, cut), bytes.slice(cut))),
		).toEqual([{ t: 'Grüße 🐸' }]);
	});

	it('parses a final line without a newline and skips blank or broken lines', async () => {
		expect(await collect(chunked('\n{"a":1}\n\n{broken\n  \n{"b":2}'))).toEqual([
			{ a: 1 },
			{ b: 2 },
		]);
	});
});

const brief = (company: string, zones = 0): Brief =>
	sanitizeBrief({
		company,
		opening: `${company} opens.`,
		zones: defaultBrief.zones.slice(0, zones),
	});
const oldWorld: StoredWorld = {
	id: 'default',
	version: WORLD_VERSION,
	seed: 1,
	brief: brief('Old Co'),
	createdAt: new Date(0).toISOString(),
	source: 'default',
	model: null,
};
const newWorld: StoredWorld = {
	...oldWorld,
	id: 'new-1',
	seed: 7,
	brief: brief('New Co', 2),
	source: 'generated',
};
const initial: WorldState = {
	world: oldWorld,
	nextGenerationAt: null,
	generating: false,
};
const START: WorldStreamEvent = { type: 'start', id: 'new-1', createdAt: '', seed: 7 };
const partial: WorldStreamEvent = { type: 'brief', brief: brief('New Co', 1) };

function run(events: WorldStreamEvent[], origin: 'own' | 'follow' = 'own') {
	return events.reduce(
		(state, event) => reduceWorldState(state, { type: 'event', event, origin }),
		initWorldState(initial),
	);
}

describe('reduceWorldState', () => {
	it('builds the office as the brief grows and switches to it when done', () => {
		const started = run([START]);
		expect(started).toMatchObject({ status: 'generating', seed: 7, streaming: true });
		expect(started.brief.zones).toEqual([]);

		const building = run([START, partial, { type: 'brief', brief: newWorld.brief }]);
		expect(building.brief).toEqual(newWorld.brief);
		expect(
			building.log.filter((entry) => entry.kind === 'story').map((entry) => entry.text),
		).toEqual(['New Co opens.', defaultBrief.zones[0].story, defaultBrief.zones[1].story]);
		expect(building.committed.id).toBe('default');

		const at = new Date(Date.now() + 3_600_000).toISOString();
		const done = reduceWorldState(building, {
			type: 'event',
			event: { type: 'done', world: newWorld, nextGenerationAt: at },
			origin: 'own',
		});
		expect(done).toMatchObject({
			status: 'ready',
			brief: newWorld.brief,
			seed: 7,
			nextGenerationAt: at,
		});
		expect(done.committed.id).toBe('new-1');
		expect(done.log.at(-1)).toMatchObject({ kind: 'system', text: 'New Co is open for business.' });
		expect(new Set(done.log.map((entry) => entry.id)).size).toBe(done.log.length);
	});

	it('restores the previous world when the stream fails', () => {
		const failed = run([
			START,
			partial,
			{ type: 'error', message: 'The forge sputtered.' },
		]);
		expect(failed).toMatchObject({
			status: 'error',
			error: 'The forge sputtered.',
			brief: oldWorld.brief,
			seed: oldWorld.seed,
			streaming: false,
		});
		expect(failed.log.at(-1)).toMatchObject({
			kind: 'error',
			text: 'The forge sputtered.',
		});
	});

	it('keeps the world on a rejection and remembers the cooldown or busy forge', () => {
		const at = new Date(Date.now() + 60_000).toISOString();
		const cooling = reduceWorldState(initWorldState(initial), {
			type: 'rejected',
			message: 'Not yet.',
			nextGenerationAt: at,
			busy: false,
		});
		expect(cooling).toMatchObject({
			brief: oldWorld.brief,
			nextGenerationAt: at,
			error: 'Not yet.',
		});
		const busy = reduceWorldState(initWorldState(initial), {
			type: 'rejected',
			message: 'Busy.',
			busy: true,
		});
		expect(busy.othersGenerating).toBe(true);
	});

	it('after losing the stream, restores the world and waits for the result', () => {
		const lost = reduceWorldState(
			run([START, partial]),
			{
				type: 'lost',
				message: 'Lost.',
			},
		);
		expect(lost).toMatchObject({
			brief: oldWorld.brief,
			othersGenerating: true,
			status: 'error',
		});
		const polled = reduceWorldState(lost, {
			type: 'polled',
			state: { world: newWorld, nextGenerationAt: null, generating: false },
		});
		expect(polled).toMatchObject({
			brief: newWorld.brief,
			seed: 7,
			status: 'ready',
			error: null,
			othersGenerating: false,
		});
		expect(polled.committed.id).toBe('new-1');
	});

	it('ignores polls while streaming and stray briefs while idle', () => {
		const streaming = run([START]);
		const polled = reduceWorldState(streaming, {
			type: 'polled',
			state: { world: newWorld, nextGenerationAt: null, generating: true },
		});
		expect(polled).toBe(streaming);
		const idle = initWorldState(initial);
		expect(
			reduceWorldState(idle, {
				type: 'event',
				event: partial,
				origin: 'follow',
			}),
		).toBe(idle);
	});

	it('marks a passed cooldown', () => {
		const at = new Date().toISOString();
		const state = reduceWorldState(initWorldState({ ...initial, nextGenerationAt: at }), {
			type: 'cooled',
			at,
		});
		expect(state.cooledFor).toBe(at);
	});
});

describe('network', () => {
	function runtime() {
		const actions: Parameters<Runtime['dispatch']>[0][] = [];
		const runtime: Runtime = {
			dispatch: (action) => actions.push(action),
			busy: { current: false },
			active: { current: null },
		};
		return { actions, runtime };
	}
	const ndjson = (...events: WorldStreamEvent[]) =>
		new Response(events.map((event) => JSON.stringify(event)).join('\n') + '\n', {
			headers: { 'content-type': 'application/x-ndjson' },
		});

	afterEach(() => vi.unstubAllGlobals());

	it('streams a generation into the state', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				ndjson(
					START,
					partial,
					{ type: 'done', world: newWorld, nextGenerationAt: new Date().toISOString() },
				),
			),
		);
		const { actions, runtime: rt } = runtime();
		expect(await postGenerate(rt)).toBe(true);
		expect(
			actions.map((action) =>
				action.type === 'event' ? action.event.type : action.type,
			),
		).toEqual(['start', 'brief', 'done']);
		expect(rt.busy.current).toBe(false);
	});

	it('turns a 429 into a local clock time', async () => {
		const at = '2030-01-01T14:32:00.000Z';
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({ message: 'in 5 minutes', nextGenerationAt: at }, { status: 429 }),
			),
		);
		const { actions, runtime: rt } = runtime();
		await postGenerate(rt);
		expect(actions[0]).toMatchObject({
			type: 'rejected',
			nextGenerationAt: at,
			busy: false,
		});
		expect((actions[0] as { message: string }).message).toMatch(
			/^Not yet: the office can be redeployed at .+\.$/,
		);
	});

	it('marks the forge busy on 409 and passes the message on', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ message: 'Another visitor…' }, { status: 409 })),
		);
		const { actions, runtime: rt } = runtime();
		await postGenerate(rt);
		expect(actions[0]).toMatchObject({
			type: 'rejected',
			busy: true,
			message: 'Another visitor…',
		});
	});

	it('reports network failures and streams that end without a result', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Promise.reject(new TypeError('offline'))),
		);
		const offline = runtime();
		await postGenerate(offline.runtime);
		expect(offline.actions[0]).toMatchObject({ type: 'rejected', busy: false });

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ndjson(START)),
		);
		const lost = runtime();
		await postGenerate(lost.runtime);
		expect(lost.actions.at(-1)).toMatchObject({ type: 'lost' });
	});

	it('runs one request at a time', async () => {
		const { runtime: rt } = runtime();
		rt.busy.current = true;
		vi.stubGlobal('fetch', vi.fn());
		expect(await postGenerate(rt)).toBe(false);
		expect(await follow(rt)).toBe(false);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('follow applies the JSON state when there is nothing to stream', async () => {
		const state: WorldState = {
			world: newWorld,
			nextGenerationAt: null,
			generating: false,
		};
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json(state)),
		);
		const { actions, runtime: rt } = runtime();
		await follow(rt);
		expect(fetch).toHaveBeenCalledWith(
			'/api/lab/quest/world?follow=1',
			expect.anything(),
		);
		expect(actions).toEqual([{ type: 'polled', state }]);
	});

	it('follow reports failures so a missed room event can be retried', async () => {
		const { runtime: rt } = runtime();
		const onFail = vi.fn();
		vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
		await follow(rt, onFail);
		vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
		await follow(rt, onFail);
		expect(onFail).toHaveBeenCalledTimes(2);
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ world: newWorld, nextGenerationAt: null, generating: false })));
		await follow(rt, onFail);
		expect(onFail).toHaveBeenCalledTimes(2);
	});
});
