import { describe, expect, it } from 'vitest';
import { turn } from './actors';
import { easeHeight } from './office';
import { SHADOW_IDLE_INTERVAL, ShadowSchedule, moved } from './shadows';

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

describe('a settled scene', () => {
	const dt = 1 / 60;

	it('stops easing walls once they reach a height a Float32Array cannot hold exactly', () => {
		const heights = new Float32Array([0.375]);
		const k = 1 - Math.exp(-dt * 7);
		let lastChange = -1;
		for (let i = 0; i < 600; i++) if (easeHeight(heights, 0, 1.9, k)) lastChange = i;
		expect(heights[0]).toBe(Math.fround(1.9));
		expect(lastChange).toBeGreaterThan(0);
		expect(lastChange).toBeLessThan(120);
	});

	it('stops counting a swivel as movement soon after it eases in', () => {
		let heading = 0;
		let drawn = Number.NaN;
		let lastMark = -1;
		for (let i = 0; i < 600; i++) {
			heading = turn(heading, 0.95, dt * 4);
			if (moved(drawn, heading)) {
				drawn = heading;
				lastMark = i;
			}
		}
		// The exact comparison kept marking for about eight seconds.
		expect(lastMark).toBeLessThan(150);
		expect(Math.abs(drawn - 0.95)).toBeLessThan(1e-3);
	});

	it('redraws idle shadows at about 12 Hz under a 60 Hz clock once nothing moves', () => {
		const s = new ShadowSchedule();
		const heights = new Float32Array([0.375, 2.6]);
		const k = 1 - Math.exp(-dt * 7);
		let heading = 0;
		let drawn = Number.NaN;
		let draws = 0;
		const frames = 600;
		for (let i = 0; i < frames * 2; i++) {
			// What the walls and Max do every frame (office.tsx, actors.tsx).
			if (easeHeight(heights, 0, 1.9, k) || easeHeight(heights, 1, 0.375, k)) s.mark();
			heading = turn(heading, -0.6, dt * 4);
			if (moved(drawn, heading)) {
				drawn = heading;
				s.mark();
			}
			// Count the second half, once the swivel and the walls have settled.
			if (s.due(i * dt) && i >= frames) draws++;
		}
		expect(draws).toBeGreaterThanOrEqual(Math.floor(10 / SHADOW_IDLE_INTERVAL) - 1);
		expect(draws).toBeLessThanOrEqual(Math.ceil(10 / SHADOW_IDLE_INTERVAL) + 1);
	});
});
