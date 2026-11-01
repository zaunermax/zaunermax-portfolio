import { describe, expect, it } from 'vitest';
import { SHADOW_IDLE_INTERVAL, ShadowSchedule } from './shadows';

describe('ShadowSchedule', () => {
	it('draws the first frame', () => {
		expect(new ShadowSchedule().due(0)).toBe(true);
	});

	it('refreshes at the idle rate while nothing moves', () => {
		const s = new ShadowSchedule();
		let draws = 0;
		for (let i = 0; i < 120; i++) if (s.due(i / 60)) draws++;
		expect(draws).toBeGreaterThanOrEqual(Math.floor(2 / SHADOW_IDLE_INTERVAL) - 1);
		expect(draws).toBeLessThanOrEqual(Math.ceil(2 / SHADOW_IDLE_INTERVAL) + 1);
	});

	it('redraws on the next frame once marked', () => {
		const s = new ShadowSchedule();
		s.due(0);
		expect(s.due(1 / 60)).toBe(false);
		s.mark();
		expect(s.due(2 / 60)).toBe(true);
		expect(s.due(3 / 60)).toBe(false);
	});

	it('redraws when the clock restarts', () => {
		const s = new ShadowSchedule();
		s.due(10);
		expect(s.due(0.01)).toBe(true);
	});
});
