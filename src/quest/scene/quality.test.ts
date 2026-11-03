import { describe, expect, it } from 'vitest';
import { LOWEST_TIER, nextTier, tierSettings, type QualityTier } from './quality';

/** The tiers a visit passes through when every one of them struggles. */
function ladder(devicePixelRatio: number) {
	const tiers: QualityTier[] = [0];
	while (tiers[tiers.length - 1] !== LOWEST_TIER) tiers.push(nextTier(tiers[tiers.length - 1], devicePixelRatio));
	return tiers;
}

describe('quality ladder', () => {
	it('coarsens the occlusion, then the pixel ratio, then drops the occlusion', () => {
		expect(ladder(2)).toEqual([0, 1, 2, 3]);
		expect(ladder(1.25)).toEqual([0, 1, 2, 3]);
	});

	it('skips the pixel-ratio step on a screen at one pixel per CSS pixel', () => {
		expect(ladder(1)).toEqual([0, 1, 3]);
	});

	it('stays at the lowest tier', () => {
		expect(nextTier(LOWEST_TIER, 2)).toBe(LOWEST_TIER);
	});

	it('gives up one thing per step', () => {
		expect(tierSettings(0)).toEqual({ ao: true, aoScale: 0.7, dpr: [1, 1.5] });
		expect(tierSettings(1)).toEqual({ ao: true, aoScale: 0.5, dpr: [1, 1.5] });
		expect(tierSettings(2)).toEqual({ ao: true, aoScale: 0.5, dpr: 1 });
		expect(tierSettings(3)).toEqual({ ao: false, aoScale: 0.5, dpr: 1 });
	});
});
