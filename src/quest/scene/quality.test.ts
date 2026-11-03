import { describe, expect, it } from 'vitest';
import { LOWEST_TIER, nextTier, tierSettings, type QualityTier } from './quality';

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
