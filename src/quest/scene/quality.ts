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

/** The camera distance the occlusion scales are set for: the default play view (controller.tsx). */
const AO_REFERENCE_DIST = 19;
/** The coarsest occlusion buffer a close camera brings, per CSS pixel. */
const AO_CLOSE_MIN = 0.35;
/** Occlusion scales come in twentieths, so a zoom resizes its buffers a few times, not every frame. */
const AO_STEPS = 20;

/**
 * The occlusion buffer's scale for a camera `dist` from its focus. The occlusion reaches a fixed
 * distance in the room, so a closer camera spreads it over more pixels, and every one of them
 * costs more. Scaling the buffer with the distance keeps the cost of the occlusion about the
 * same at any zoom. It looks the same too, since everything it shades has grown by the same
 * factor. Never finer than `scale`, the tier's own.
 */
export function closeUpAoScale(scale: number, dist: number) {
	if (!(dist < AO_REFERENCE_DIST)) return scale;
	const close = Math.round(((scale * dist) / AO_REFERENCE_DIST) * AO_STEPS) / AO_STEPS;
	return Math.min(scale, Math.max(AO_CLOSE_MIN, close));
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

/**
 * A canvas's size in the device pixels tier 0 would render on this screen, whatever the tier in
 * play: what the ladder compares across resizes and screens.
 */
export function canvasPixels(width: number, height: number, devicePixelRatio: number) {
	return width * height * effectiveDpr(0, devicePixelRatio) ** 2;
}

/** A canvas at most this share of the size at which the ladder last stepped down starts it afresh. */
const SHRUNK = 0.75;

/**
 * Whether a canvas of `pixels` is clearly smaller than the one at which the ladder last stepped
 * down (`steppedAt`, NaN if it never did), so tier 0 deserves another chance: a window that grew
 * huge, struggled and shrank back. Never on a time basis, so it cannot oscillate on its own.
 */
export function shrankSinceStep(pixels: number, steppedAt: number) {
	return pixels < steppedAt * SHRUNK;
}

/** What watchPixelRatio needs of the window. */
export type DensityWindow = Pick<Window, 'devicePixelRatio' | 'matchMedia'>;

/**
 * Calls `onChange` with the screen's new pixel ratio whenever it changes (a window dragged
 * between a Retina display and an external screen, or zoomed), even when nothing else about the
 * canvas does; returns the cleanup. A resolution query only reports leaving its own ratio, so it
 * is re-armed for the new one on every change.
 */
export function watchPixelRatio(onChange: (ratio: number) => void, win: DensityWindow = window) {
	if (typeof win.matchMedia !== 'function') return () => {};
	let query: MediaQueryList | null = null;
	const changed = () => {
		watch();
		onChange(win.devicePixelRatio);
	};
	const watch = () => {
		query?.removeEventListener('change', changed);
		query = win.matchMedia(`(resolution: ${win.devicePixelRatio}dppx)`);
		query.addEventListener('change', changed);
	};
	watch();
	return () => query?.removeEventListener('change', changed);
}
