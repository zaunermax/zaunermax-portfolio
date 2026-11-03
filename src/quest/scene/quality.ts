/*
 * The office's quality ladder for high quality: what each tier renders, and which tier comes
 * next when frames keep coming late (frame-pacing.ts judges that).
 */

/**
 * From the least to the most noticeable sacrifice: 0 renders up to 1.5 device pixels per CSS
 * pixel with ambient occlusion at 0.7 of the CSS resolution, 1 runs the occlusion at half the CSS
 * resolution, 2 renders one pixel per CSS pixel, 3 drops the occlusion.
 */
export type QualityTier = 0 | 1 | 2 | 3;
export const LOWEST_TIER: QualityTier = 3;

/** Rendering stops at 1.5 device pixels per CSS pixel; a denser canvas would only be upscaled. */
const MAX_DPR = 1.5;

export type TierSettings = {
	/** Ambient occlusion on. */
	ao: boolean;
	/** Occlusion buffer size per CSS pixel, in each direction. */
	aoScale: number;
	/** The canvas's pixel ratio: a [min, max] range follows the screen. */
	dpr: number | [number, number];
};

export function tierSettings(tier: QualityTier): TierSettings {
	return {
		ao: tier < 3,
		aoScale: tier === 0 ? 0.7 : 0.5,
		dpr: tier >= 2 ? 1 : [1, MAX_DPR],
	};
}

/**
 * The tier below `tier`, skipping the pixel-ratio step on a screen that already renders one pixel
 * per CSS pixel (it would change nothing).
 */
export function nextTier(tier: QualityTier, devicePixelRatio: number): QualityTier {
	if (tier === 0) return 1;
	if (tier === 1 && devicePixelRatio > 1) return 2;
	return LOWEST_TIER;
}
