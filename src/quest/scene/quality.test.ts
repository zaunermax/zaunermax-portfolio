import { describe, expect, it } from 'vitest';
import {
	canvasPixels,
	closeUpAoScale,
	LOWEST_TIER,
	nextTier,
	shrankSinceStep,
	tierSettings,
	watchPixelRatio,
	type DensityWindow,
	type QualityTier,
} from './quality';

/** The tiers a visit passes through when every one of them struggles. */
function ladder(devicePixelRatio: number) {
	const tiers: QualityTier[] = [0];
	while (tiers[tiers.length - 1] !== LOWEST_TIER) tiers.push(nextTier(tiers[tiers.length - 1], devicePixelRatio));
	return tiers;
}

describe('quality ladder', () => {
	it('coarsens the occlusion, then the pixel ratio in two steps, then drops the occlusion', () => {
		expect(ladder(2)).toEqual([0, 1, 2, 3, 4]);
		expect(ladder(1.5)).toEqual([0, 1, 2, 3, 4]);
		expect(ladder(1.4)).toEqual([0, 1, 2, 3, 4]);
	});

	it('skips every pixel-ratio step that would not lower the ratio rendered', () => {
		expect(ladder(1)).toEqual([0, 1, 4]);
		expect(ladder(1.25)).toEqual([0, 1, 3, 4]);
		expect(ladder(1.1)).toEqual([0, 1, 3, 4]);
		// Below one, the canvas still renders a pixel per CSS pixel.
		expect(ladder(0.9)).toEqual([0, 1, 4]);
	});

	it('stays at the lowest tier', () => {
		expect(nextTier(LOWEST_TIER, 2)).toBe(LOWEST_TIER);
	});

	it('gives up one thing per step', () => {
		expect(tierSettings(0)).toEqual({ ao: true, aoScale: 0.7, dpr: [1, 1.5] });
		expect(tierSettings(1)).toEqual({ ao: true, aoScale: 0.5, dpr: [1, 1.5] });
		expect(tierSettings(2)).toEqual({ ao: true, aoScale: 0.5, dpr: [1, 1.25] });
		expect(tierSettings(3)).toEqual({ ao: true, aoScale: 0.5, dpr: 1 });
		expect(tierSettings(4)).toEqual({ ao: false, aoScale: 0.5, dpr: 1 });
	});
});

describe('canvasPixels', () => {
	it('counts the device pixels tier 0 renders', () => {
		expect(canvasPixels(3440, 1300, 1)).toBe(3440 * 1300);
		expect(canvasPixels(1000, 500, 2)).toBe(1000 * 500 * 2.25);
		expect(canvasPixels(1000, 500, 0.9)).toBe(1000 * 500);
	});
});

describe('shrankSinceStep', () => {
	const huge = canvasPixels(5000, 2500, 2);

	it('starts the ladder afresh once the canvas shrinks well below where it stepped down', () => {
		expect(shrankSinceStep(canvasPixels(3440, 1300, 2), huge)).toBe(true);
		// Dragged to a screen of lower density.
		expect(shrankSinceStep(canvasPixels(5000, 2500, 1), huge)).toBe(true);
	});

	it('keeps the tier for the same, a slightly smaller or a bigger canvas', () => {
		expect(shrankSinceStep(huge, huge)).toBe(false);
		expect(shrankSinceStep(canvasPixels(4500, 2400, 2), huge)).toBe(false);
		expect(shrankSinceStep(canvasPixels(6000, 3000, 2), huge)).toBe(false);
	});

	it('never restarts a ladder that has not stepped down', () => {
		expect(shrankSinceStep(1, Number.NaN)).toBe(false);
	});
});

describe('watchPixelRatio', () => {
	/** A window whose resolution queries can be fired by hand. */
	function fakeWindow(ratio: number) {
		const listeners = new Map<string, Set<() => void>>();
		const queries: string[] = [];
		const win = {
			devicePixelRatio: ratio,
			matchMedia(media: string) {
				queries.push(media);
				const set = listeners.get(media) ?? new Set();
				listeners.set(media, set);
				return {
					addEventListener: (_: string, fn: () => void) => set.add(fn),
					removeEventListener: (_: string, fn: () => void) => set.delete(fn),
				} as unknown as MediaQueryList;
			},
		};
		/** Moves the window to a screen of `next` pixels per CSS pixel. */
		const move = (next: number) => {
			const old = `(resolution: ${win.devicePixelRatio}dppx)`;
			win.devicePixelRatio = next;
			for (const fn of [...(listeners.get(old) ?? [])]) fn();
		};
		const active = () => [...listeners.values()].reduce((n, set) => n + set.size, 0);
		return { win: win as DensityWindow, move, queries, active };
	}

	it('reports every change of pixel ratio, re-armed for the new one', () => {
		const { win, move, queries, active } = fakeWindow(2);
		const seen: number[] = [];
		const stop = watchPixelRatio((r) => seen.push(r), win);
		move(1);
		move(2);
		expect(seen).toEqual([1, 2]);
		expect(queries).toEqual(['(resolution: 2dppx)', '(resolution: 1dppx)', '(resolution: 2dppx)']);
		expect(active()).toBe(1);
		stop();
		expect(active()).toBe(0);
		move(1);
		expect(seen).toEqual([1, 2]);
	});

	it('does nothing without matchMedia', () => {
		const stop = watchPixelRatio(() => {}, { devicePixelRatio: 1 } as DensityWindow);
		expect(stop).toBeTypeOf('function');
		stop();
	});
});

describe('closeUpAoScale', () => {
	it('keeps the tier scale at the default camera distance and beyond', () => {
		expect(closeUpAoScale(0.7, 19)).toBe(0.7);
		expect(closeUpAoScale(0.7, 30)).toBe(0.7);
		expect(closeUpAoScale(0.5, 50)).toBe(0.5);
	});

	it('keeps the tier scale before the camera has reported a distance', () => {
		expect(closeUpAoScale(0.7, Number.NaN)).toBe(0.7);
	});

	it('coarsens the occlusion with the distance up close', () => {
		// 0.7 * 13 / 19 = 0.479, in twentieths.
		expect(closeUpAoScale(0.7, 13)).toBe(0.5);
		expect(closeUpAoScale(0.7, 16)).toBe(0.6);
		expect(closeUpAoScale(0.5, 16)).toBe(0.4);
	});

	it('never goes below its floor or above the tier scale', () => {
		expect(closeUpAoScale(0.5, 13)).toBe(0.35);
		expect(closeUpAoScale(0.5, 6)).toBe(0.35);
		expect(closeUpAoScale(0.7, 18.9)).toBe(0.7);
	});

	it('changes in a few steps over the whole zoom range', () => {
		const scales = new Set<number>();
		for (let d = 13; d <= 19; d += 0.01) scales.add(closeUpAoScale(0.7, d));
		expect(scales.size).toBeLessThanOrEqual(5);
	});
});
