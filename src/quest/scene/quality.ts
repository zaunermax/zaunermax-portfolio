/*
 * The office's quality ladder for high quality: what each tier renders, and which tier comes
 * next when frames keep coming late (frame-pacing.ts judges that).
 */

/**
 * From the least to the most noticeable sacrifice: 0 renders up to 1.5 device pixels per CSS
 * pixel with ambient occlusion at 0.7 of the CSS resolution, 1 runs the occlusion at half the CSS
 * resolution, 2 renders up to 1.25 device pixels per CSS pixel, 3 one, 4 drops the occlusion.
 */
export type QualityTier = 0 | 1 | 2 | 3 | 4;
export const LOWEST_TIER: QualityTier = 4;

/** The most device pixels per CSS pixel each tier renders. */
const MAX_DPR = [1.5, 1.5, 1.25, 1, 1] as const;

export type TierSettings = {
	/** Ambient occlusion on. */
	ao: boolean;
	/** Occlusion buffer size per CSS pixel, in each direction. */
	aoScale: number;
	/** The canvas's pixel ratio: a [min, max] range follows the screen. */
	dpr: number | [number, number];
};

export function tierSettings(tier: QualityTier): TierSettings {
	const max = MAX_DPR[tier];
	return {
		ao: tier < 4,
		aoScale: tier === 0 ? 0.7 : 0.5,
		dpr: max > 1 ? [1, max] : 1,
	};
}

/** The pixel ratio a tier actually renders at on a screen of `devicePixelRatio`. */
function effectiveDpr(tier: QualityTier, devicePixelRatio: number) {
	return Math.max(1, Math.min(devicePixelRatio, MAX_DPR[tier]));
}

/**
 * The tier below `tier`, skipping every rung that would change nothing on this screen: a
 * pixel-ratio step that does not lower the ratio actually rendered (1.25 on a screen at 1.25 or
 * less, 1 on a screen at 1).
 */
export function nextTier(tier: QualityTier, devicePixelRatio: number): QualityTier {
	const from = tierSettings(tier);
	let next = tier;
	while (next < LOWEST_TIER) {
		next = (next + 1) as QualityTier;
		const to = tierSettings(next);
		if (
			to.ao !== from.ao ||
			to.aoScale !== from.aoScale ||
			effectiveDpr(next, devicePixelRatio) < effectiveDpr(tier, devicePixelRatio)
		)
			return next;
	}
	return LOWEST_TIER;
}
