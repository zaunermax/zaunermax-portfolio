import { describe, expect, it } from 'vitest';
import { canvasPixels, LOWEST_TIER, nextTier, shrankSinceStep, tierSettings, type QualityTier } from './quality';

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
