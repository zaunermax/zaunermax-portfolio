import { defaultBrief } from '@/quest/world/default-world';
import { briefSteps } from '@/quest/world/replay';
import { sanitizeBrief } from '@/quest/world/sanitize';
import {
	pickPremise,
	type GenerateWorldOptions,
	type GeneratedWorld,
} from '@/quest/world/generate.server';
import type { Brief } from '@/quest/world/schema';

const STEP_MS = 600;
/** Stands in for the compile, check and moderation pass after the model is done. */
const CHECK_MS = 1500;

function wait(ms: number, signal?: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(signal.reason);
			},
			{ once: true },
		);
	});
}

/** Only wired into the dev build, for local stream/follow/persistence smoke tests. */
export async function* fakeGenerator({
	seed = 42,
	signal,
}: GenerateWorldOptions = {}): AsyncGenerator<Brief, GeneratedWorld> {
	const brief = sanitizeBrief({ ...defaultBrief, company: 'Local Forge Labs' });
	// Every stage the real stream goes through: zones, landmarks and event, cast, closing.
	for (const step of briefSteps(brief).slice(1)) {
		await wait(STEP_MS, signal);
		yield step;
	}
	await wait(CHECK_MS, signal);
	return {
		brief,
		seed,
		model: 'local-fake',
		premise: pickPremise(seed),
		usage: null,
		finishReason: 'stop',
		durationMs: STEP_MS * (briefSteps(brief).length - 1) + CHECK_MS,
		firstPartMs: STEP_MS,
	};
}
