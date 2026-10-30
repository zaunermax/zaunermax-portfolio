import { afterEach, describe, expect, it, vi } from 'vitest';
import { createForge } from './forge.server';
import { createWorldService } from './store.server';
import { createMemoryWorldStore } from '@/server/world-store.server';
import { defaultBrief } from './default-world';
import type { generateWorld } from './generate.server';

vi.mock('@/server/openai-client.server', () => ({ aiOpenAI: {}, openai: {} }));
afterEach(() => vi.restoreAllMocks());

describe('forge room notifications', () => {
	it.each([false, true])(
		'notifies start then the terminal phase (failure=%s)',
		async (failure) => {
			vi.spyOn(console, 'info').mockImplementation(() => {});
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const notify = vi.fn();
			const forge = createForge(createWorldService(createMemoryWorldStore()), { notify });
			const generate: typeof generateWorld = async function* ({ seed = 1 } = {}) {
				yield defaultBrief;
				if (failure) throw new Error('generation failed');
				return {
					brief: defaultBrief,
					seed,
					model: 'test',
					premise: {
						premise: 'test office',
						vibe: defaultBrief.vibe,
						timeOfDay: defaultBrief.timeOfDay,
						optionalZones: 0,
					},
					usage: null,
					finishReason: 'stop',
					durationMs: 1,
					firstPartMs: 0,
				};
			};
			const result = await forge.startForge(generate);
			if (result.status !== 'started') throw new Error(result.status);
			await result.job.done;
			expect(notify.mock.calls).toEqual([['start'], [failure ? 'error' : 'done']]);
		},
	);

	it('continues and persists the world when the notifier throws', async () => {
		vi.spyOn(console, 'info').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const world = createWorldService(createMemoryWorldStore());
		const notify = vi.fn(() => {
			throw new Error('room unavailable');
		});
		const forge = createForge(world, { notify });
		const result = await forge.startForge(async function* ({ seed = 1 } = {}) {
			yield defaultBrief;
			return {
				brief: defaultBrief,
				seed,
				model: 'test',
				premise: {
					premise: 'test office',
					vibe: defaultBrief.vibe,
					timeOfDay: defaultBrief.timeOfDay,
					optionalZones: 0,
				},
				usage: null,
				finishReason: 'stop',
				durationMs: 1,
				firstPartMs: 0,
			};
		});
		if (result.status !== 'started') throw new Error(result.status);
		await result.job.done;
		expect(result.job.events.at(-1)?.type).toBe('done');
		expect((await world.getCurrentWorld()).id).toBe(result.job.id);
		expect(notify.mock.calls).toEqual([['start'], ['done']]);
	});
});
