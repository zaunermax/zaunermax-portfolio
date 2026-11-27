import { describe, expect, it } from 'vitest';
import { clampBelow, declutter, SETTLE_MS, type Candidate, type Placement } from './placement';

const box = (l: number, t: number, w = 100, h = 20) => ({ l, t, r: l + w, b: t + h });
const none = new Map<string, Placement>();

describe('declutter', () => {
	it('keeps the more important of two overlapping labels', () => {
		const out = declutter(
			[
				{ key: 'place', priority: 60, rect: box(0, 0) },
				{ key: 'name', priority: 80, rect: box(50, 10) },
				{ key: 'far', priority: 10, rect: box(400, 0) },
			],
			none,
			0,
		);
		expect(out.get('name')?.shown).toBe(true);
		expect(out.get('place')?.shown).toBe(false);
		expect(out.get('far')?.shown).toBe(true);
	});

	it('moves a bubble up a little rather than hiding it', () => {
		const out = declutter(
			[
				{ key: 'max', priority: 100, rect: box(0, 100) },
				{ key: 'bubble', priority: 90, rect: box(0, 110), nudge: 40 },
			],
			none,
			0,
		);
		expect(out.get('bubble')?.shown).toBe(true);
		expect(out.get('bubble')!.dy).toBeLessThanOrEqual(-32);
		expect(out.get('bubble')!.dy).toBeGreaterThanOrEqual(-40);
	});

	it('never moves a bubble up off the top of the screen', () => {
		const out = declutter(
			[
				{ key: 'name', priority: 80, rect: box(0, 25) },
				{ key: 'bubble', priority: 40, rect: box(0, 20), nudge: 36 },
			],
			none,
			0,
		);
		expect(out.get('bubble')?.shown).toBe(false);
	});

	it('always shows a label that must stay; whatever is in its way steps aside', () => {
		const out = declutter(
			[
				{ key: 'max', priority: 100, rect: box(0, 20) },
				{ key: 'name', priority: 80, rect: box(200, 20) },
				{ key: 'about-max', priority: 99, rect: box(50, 20, 200), keep: true, nudge: 6 },
			],
			none,
			0,
		);
		expect(out.get('about-max')?.shown).toBe(true);
		expect(out.get('max')?.shown).toBe(false);
		expect(out.get('name')?.shown).toBe(false);
	});

	it('moves the line about Max out of the way of Max’s sign when it can', () => {
		const out = declutter(
			[
				{ key: 'max', priority: 100, rect: box(0, 100) },
				{ key: 'about-max', priority: 99, rect: box(0, 110), keep: true, nudge: 40 },
			],
			none,
			0,
		);
		expect(out.get('max')?.shown).toBe(true);
		expect(out.get('about-max')?.shown).toBe(true);
	});

	it('lets a label back only after its spot has been free for a moment', () => {
		const a: Candidate = { key: 'a', priority: 80, rect: box(0, 0) };
		const b: Candidate = { key: 'b', priority: 50, rect: box(10, 0) };
		let state = declutter([a, b], none, 0);
		expect(state.get('b')?.shown).toBe(false);
		// a walks away: b's spot is free, but it waits…
		const moved = { ...a, rect: box(300, 0) };
		state = declutter([moved, b], state, 100);
		expect(state.get('b')?.shown).toBe(false);
		// …while nothing lower can take its place meanwhile.
		const c: Candidate = { key: 'c', priority: 10, rect: box(20, 0) };
		expect(declutter([moved, b, c], state, 100 + SETTLE_MS / 2).get('c')?.shown).toBe(false);
		state = declutter([moved, b], state, SETTLE_MS + 1);
		expect(state.get('b')?.shown).toBe(true);
	});

	it('keeps a nudged bubble where it was while that still fits', () => {
		const max: Candidate = { key: 'max', priority: 100, rect: box(0, 100) };
		const bubble: Candidate = { key: 'bubble', priority: 90, rect: box(0, 110), nudge: 40 };
		const first = declutter([max, bubble], none, 0);
		const dy = first.get('bubble')!.dy;
		// Max's sign moves down a touch: the bubble could sit lower now, but stays put.
		const next = declutter([{ ...max, rect: box(0, 104) }, bubble], first, 16);
		expect(next.get('bubble')!.dy).toBe(dy);
	});
});

describe('clampBelow', () => {
	const hud = [box(0, 0, 300, 80), box(0, 650, 1280, 70)];

	it('moves a label down below the panels at the top', () => {
		expect(clampBelow(box(100, 40), hud, 720)).toBe(80 + 6 - 40);
		expect(clampBelow(box(500, -10), hud, 720)).toBe(16);
		expect(clampBelow(box(500, 100), hud, 720)).toBe(0);
	});

	it('gives up where a panel lower down is in the way', () => {
		expect(clampBelow(box(500, 640), hud, 720)).toBeNull();
	});
});
