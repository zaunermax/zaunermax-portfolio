import 'server-only';
import type { StoredWorld, WorldStreamEvent } from './contract';
import {
	generateWorld,
	newSeed,
	WorldGenerationError,
	type GenerateWorldOptions,
} from './generate';
import { WORLD_VERSION } from './schema';
import {
	beginGeneration,
	completeGeneration,
	failGeneration,
	getCurrentWorld,
	type ForgeLock,
} from './store';

/**
 * Runs a generation independently of any HTTP request and fans its events out to listeners:
 * the visitor who started it and anyone following along. The run keeps going and persists its
 * world when every listener has disconnected.
 *
 * The registry lives in process memory, so following only works on the instance that runs the
 * generation (fine for one Node server; serverless needs a pub/sub such as Redis streams).
 */

type Listener = (event: WorldStreamEvent) => void;

export type ForgeJob = {
	id: string;
	createdAt: string;
	/** The events so far, replayed to late followers (only the latest brief is kept). */
	readonly events: WorldStreamEvent[];
	seed: number;
	readonly listeners: Set<Listener>;
	finished: boolean;
	/** Settles when the run has persisted (or failed); never rejects. */
	done: Promise<void>;
};

const REGISTRY_KEY = Symbol.for('zaunermax.quest.forgeJob');
type Registry = { [REGISTRY_KEY]?: ForgeJob | null };

export function currentJob(): ForgeJob | null {
	return (globalThis as Registry)[REGISTRY_KEY] ?? null;
}

function emit(job: ForgeJob, event: WorldStreamEvent) {
	// A brief event carries the whole brief so far, so older ones are redundant.
	if (event.type === 'brief') {
		const stale = job.events.findIndex((e) => e.type === 'brief');
		if (stale >= 0) job.events.splice(stale, 1);
	}
	job.events.push(event);
	for (const listener of job.listeners) {
		try {
			listener(event);
		} catch (error) {
			console.error('[quest] forge listener failed', error);
		}
	}
}

/** "in 42 minutes": timezone-free, the client renders a local clock time itself. */
export function relativeTime(at: number, now = Date.now()) {
	const minutes = Math.ceil((at - now) / 60_000);
	if (minutes <= 1) return 'in a minute';
	if (minutes < 90) return `in ${minutes} minutes`;
	return `in ${Math.round(minutes / 60)} hours`;
}

async function run(
	job: ForgeJob,
	lock: ForgeLock,
	generate: (options: GenerateWorldOptions) => ReturnType<typeof generateWorld>,
) {
	emit(job, { type: 'start', id: job.id, createdAt: job.createdAt, seed: job.seed });
	try {
		const previous = (await getCurrentWorld()).brief;
		const generator = generate({ previous, seed: job.seed });
		let step = await generator.next();
		while (!step.done) {
			emit(job, { type: 'brief', brief: step.value });
			step = await generator.next();
		}
		const generated = step.value;
		const world: StoredWorld = {
			id: job.id,
			version: WORLD_VERSION,
			seed: generated.seed,
			brief: generated.brief,
			createdAt: job.createdAt,
			source: 'generated',
			model: generated.model,
		};
		const details = {
			premise: generated.premise,
			usage: generated.usage,
			finishReason: generated.finishReason,
			durationMs: generated.durationMs,
			firstPartMs: generated.firstPartMs,
		};
		const { nextGenerationAt } = await completeGeneration(lock, world, details);
		console.info(
			`[quest] deployed "${world.brief.company}"`,
			JSON.stringify({ id: job.id, seed: world.seed, model: world.model, ...details }),
		);
		emit(job, { type: 'done', world, nextGenerationAt });
	} catch (error) {
		console.error('[quest] world generation failed', error);
		let retry = 'in a few minutes';
		try {
			retry = relativeTime(Date.parse((await failGeneration(lock)).nextGenerationAt));
		} catch (stateError) {
			console.error('[quest] could not record the failed generation', stateError);
		}
		const reason =
			error instanceof WorldGenerationError
				? error.publicMessage
				: 'The redeploy failed unexpectedly.';
		emit(job, {
			type: 'error',
			message: `${reason} The previous office stays; try again ${retry}.`,
		});
	} finally {
		job.finished = true;
		job.listeners.clear();
		const registry = globalThis as Registry;
		if (registry[REGISTRY_KEY] === job) registry[REGISTRY_KEY] = null;
	}
}

export type StartForgeResult =
	| { status: 'started'; job: ForgeJob }
	| { status: 'busy' }
	| { status: 'cooldown'; nextGenerationAt: string };

/**
 * Takes the global lock and starts a generation in the background. The returned job's `done`
 * promise should be handed to `after()` so serverless platforms keep the function alive.
 */
export async function startForge(
	generate: (
		options: GenerateWorldOptions,
	) => ReturnType<typeof generateWorld> = generateWorld,
): Promise<StartForgeResult> {
	if (currentJob()) return { status: 'busy' };
	const begun = await beginGeneration();
	if (begun.status !== 'started') return begun;
	const job: ForgeJob = {
		id: begun.lock.id,
		createdAt: begun.lock.startedAt,
		events: [],
		seed: newSeed(),
		listeners: new Set(),
		finished: false,
		done: Promise.resolve(),
	};
	(globalThis as Registry)[REGISTRY_KEY] = job;
	job.done = run(job, begun.lock, generate);
	return { status: 'started', job };
}

/** NDJSON stream of a job: everything so far, then live events until `done` or `error`. */
export function streamJob(job: ForgeJob): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let listener: Listener | null = null;
	const unsubscribe = () => {
		if (listener) job.listeners.delete(listener);
		listener = null;
	};
	return new ReadableStream({
		start(controller) {
			let open = true;
			const send: Listener = (event) => {
				if (!open) return;
				controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				if (event.type === 'done' || event.type === 'error') {
					open = false;
					unsubscribe();
					controller.close();
				}
			};
			for (const event of job.events) send(event);
			if (open && job.finished) {
				// Finished without a terminal event (should not happen): end the stream cleanly.
				open = false;
				controller.close();
			}
			if (open) {
				listener = send;
				job.listeners.add(send);
			}
		},
		cancel() {
			// The visitor left; the generation carries on without them.
			unsubscribe();
		},
	});
}
