import { defaultBrief } from '@/quest/world/default-world';
import { sanitizeBrief } from '@/quest/world/sanitize';
import {
	pickPremise,
	type GenerateWorldOptions,
	type GeneratedWorld,
} from '@/quest/world/generate.server';
import type { Brief } from '@/quest/world/schema';

/** Only wired into the dev build, for local stream/follow/persistence smoke tests. */
export async function* fakeGenerator({
	seed = 42,
	signal,
}: GenerateWorldOptions = {}): AsyncGenerator<Brief, GeneratedWorld> {
	const brief = sanitizeBrief({ ...defaultBrief, company: 'Local Forge Labs' });
	for (const count of [1, 3, brief.zones.length]) {
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(resolve, 1000);
			signal?.addEventListener(
				'abort',
				() => {
					clearTimeout(timer);
					reject(signal.reason);
				},
				{ once: true },
			);
		});
		yield { ...brief, zones: brief.zones.slice(0, count) };
	}
	return {
		brief,
		seed,
		model: 'local-fake',
		premise: pickPremise(seed),
		usage: null,
		finishReason: 'stop',
		durationMs: 3000,
		firstPartMs: 1000,
	};
}
