import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookFor } from '../room/presence';
import { assemblePerson, holdPerson } from './characters';
import type { PartsLibrary } from './kit';

afterEach(() => {
	vi.useRealTimers();
});

describe('holdPerson', () => {
	it('drops a visitor look from the cache once nobody has shown it for a while', () => {
		vi.useFakeTimers();
		const get = vi.fn(() => undefined);
		const library = { get } as unknown as PartsLibrary;
		const look = lookFor('aaaaaaaaaaaaaaaa');
		const releaseA = holdPerson(library, look, 1_000);
		const releaseB = holdPerson(library, look, 1_000);
		assemblePerson(library, look);
		assemblePerson(library, look);
		expect(get).toHaveBeenCalledTimes(1);

		// Still shown by the second holder: stays cached.
		releaseA();
		vi.advanceTimersByTime(2_000);
		assemblePerson(library, look);
		expect(get).toHaveBeenCalledTimes(1);

		// Shown again before the linger ends: stays cached.
		releaseB();
		const releaseC = holdPerson(library, look, 1_000);
		vi.advanceTimersByTime(2_000);
		assemblePerson(library, look);
		expect(get).toHaveBeenCalledTimes(1);

		releaseC();
		vi.advanceTimersByTime(2_000);
		assemblePerson(library, look);
		expect(get).toHaveBeenCalledTimes(2);
	});
});
