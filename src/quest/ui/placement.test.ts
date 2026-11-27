import { describe, expect, it } from 'vitest';
import { clampBelow, declutter, labelRect, SETTLE_MS, type Candidate, type Placement } from './placement';

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

	it('slides the line about Max sideways off Max’s sign when there is no room above', () => {
		// Max's sign at 403–498, the bubble over it and a panel right above both.
		const out = declutter(
			[
				{ key: 'max', priority: 100, rect: { l: 403, t: 88, r: 498, b: 126 } },
				{ key: 'about-max', priority: 99, rect: { l: 433, t: 83, r: 703, b: 154 }, keep: true, nudge: 36, slide: 111 },
			],
			none,
			0,
			80,
			844,
		);
		expect(out.get('max')?.shown).toBe(true);
		expect(out.get('about-max')?.shown).toBe(true);
		expect(433 + out.get('about-max')!.dx).toBeGreaterThanOrEqual(498);
	});

	it('lets Max’s sign step aside for the line about Max rather than vanish', () => {
		const out = declutter(
			[
				{ key: 'max', priority: 100, rect: { l: 403, t: 88, r: 498, b: 126 }, nudge: 18, slide: 36 },
				{ key: 'about-max', priority: 99, rect: { l: 399, t: 127, r: 570, b: 177 }, keep: true, nudge: 36, slide: 61 },
			],
			none,
			0,
			80,
			844,
		);
		expect(out.get('about-max')).toMatchObject({ shown: true, dx: 0, dy: 0 });
		expect(out.get('max')?.shown).toBe(true);
		expect(out.get('max')!.dy).toBeLessThan(0);
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

describe('labelRect', () => {
	it('covers a sign hanging below its anchor, its tag above and its pointer below', () => {
		// Max's sign: drawn from the anchor point down (offsetTop 0), "tap to talk" 30 px above it,
		// the pointer 14 px under it.
		expect(labelRect(500, 200, 0, { w: 120, h: 24, top: 0, above: 30, below: 14 })).toEqual({ l: 440, r: 560, t: 170, b: 238 });
	});

	it('covers a bubble hanging above its anchor, tail included, slid in from an edge', () => {
		expect(labelRect(10, 300, 90, { w: 200, h: 60, top: -98, below: 10 })).toEqual({ l: 0, r: 200, t: 202, b: 272 });
	});
});
