/*
 * Frame pacing for the office: render every Nth vsync so motion runs at about 60 fps whatever
 * the display's refresh rate, and judge quality by how steadily those frames arrive.
 *
 * Pure logic, driven by rAF timestamps (ms), so it can be unit tested without a browser.
 */

/** The frame rate the office aims for. */
export const TARGET_FPS = 60;
/** While a window and its backdrop cover the office. */
export const COVERED_FPS = 30;

export function median(values: readonly number[]) {
	if (!values.length) return Number.NaN;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * How many vsyncs make one rendered frame: the most that still keep up with the target (a little
 * slack for a refresh rate measured a hair low), at least 1. 60, 90 and 100 Hz → 1, 120 and
 * 144 Hz → 2 (72 fps, steady, rather than juddering between 2 and 3 vsyncs), 165 Hz → 2,
 * 240 Hz → 4. Never below the target, so 90 Hz renders every vsync rather than at 45 fps.
 */
export function vsyncDivisor(vsyncMs: number, fps = TARGET_FPS) {
	if (!(vsyncMs > 0)) return 1;
	return Math.max(1, Math.floor(1000 / vsyncMs / fps + 0.1));
}

/**
 * The vsync interval behind a run of rAF intervals: the mean of those near the median. The mean
 * sees through timestamps rounded to whole milliseconds (Firefox gives 8 and 9 ms at 120 Hz, 11
 * and 12 ms at 90 Hz, where the median alone flips between the two); staying near the median
 * keeps vsyncs the browser skipped while busy from passing for a slower screen.
 */
export function refreshInterval(intervals: readonly number[]) {
	const mid = median(intervals);
	let sum = 0;
	let n = 0;
	for (const dt of intervals)
		if (dt > mid * 0.5 && dt < mid * 1.5) {
			sum += dt;
			n++;
		}
	return n ? sum / n : mid;
}

/** Intervals longer than this are a stall or a hidden tab, not a refresh rate. */
const MAX_VSYNC_MS = 100;
/** rAF intervals kept for the refresh-rate estimate. */
const REFRESH_WINDOW = 120;
/** Callbacks between re-estimates once the first estimate is in. */
const REFRESH_EVERY = 240;
/** Callbacks before the first estimate. */
const REFRESH_FIRST = 20;

/**
 * Measures the display's vsync interval from rAF timestamps (refreshInterval, re-measured now
 * and then, so a window dragged to another screen picks up its rate) and decides which
 * callbacks render.
 */
export class FramePacer {
	/** Estimated vsync interval in ms; NaN until measured. */
	vsync = Number.NaN;
	private intervals: number[] = [];
	private lastTick = Number.NaN;
	private lastRender = Number.NaN;
	private untilEstimate = REFRESH_FIRST;

	/** Forget timing after a pause, so the first callback afterwards renders at once. */
	reset() {
		this.lastTick = Number.NaN;
		this.lastRender = Number.NaN;
	}

	/**
	 * Feed one rAF timestamp; true when this callback should render. `fps` is the frame rate to
	 * aim for, or Infinity to render on every vsync.
	 */
	tick(t: number, fps: number = TARGET_FPS) {
		const dt = t - this.lastTick;
		this.lastTick = t;
		if (dt > 0 && dt < MAX_VSYNC_MS) {
			this.intervals.push(dt);
			if (this.intervals.length > REFRESH_WINDOW) this.intervals.shift();
		}
		if (--this.untilEstimate <= 0 && this.intervals.length) {
			this.vsync = refreshInterval(this.intervals);
			this.untilEstimate = REFRESH_EVERY;
		}
		if (!Number.isFinite(fps) || Number.isNaN(this.vsync) || Number.isNaN(this.lastRender)) {
			this.lastRender = t;
			return true;
		}
		// Whole vsyncs since the last rendered frame; rounding absorbs timestamp jitter, so the
		// cadence stays an exact multiple of the refresh rate instead of a millisecond threshold.
		const elapsed = Math.round((t - this.lastRender) / this.vsync);
		if (elapsed < vsyncDivisor(this.vsync, fps)) return false;
		this.lastRender = t;
		return true;
	}

	/** The interval between rendered frames the pacer aims for, in ms. */
	targetInterval(fps: number = TARGET_FPS) {
		if (Number.isNaN(this.vsync)) return 1000 / fps;
		if (!Number.isFinite(fps)) return this.vsync;
		return this.vsync * vsyncDivisor(this.vsync, fps);
	}
}

/**
 * The interval the quality monitor judges against: the cadence the pacer aims for, but never
 * quicker than `fps` (a 90 Hz screen renders every vsync, and 60 fps there is healthy) and no
 * slower than the slowest cadence vsyncDivisor picks on purpose (a 57 Hz screen, say). A
 * struggling machine slows its rAF down too, so it must not be able to talk the bar down.
 */
export function judgedInterval(aimMs: number, fps: number = TARGET_FPS) {
	const bar = 1000 / fps;
	return Math.min(Math.max(aimMs, bar), bar * 1.05);
}

/** Rendered frames per verdict at most. */
const QUALITY_WINDOW = 90;
/**
 * A verdict is also due once this much time has passed, however few frames it saw, so a
 * machine drawing a frame or two a second declines within seconds too.
 */
const QUALITY_WINDOW_MS = 2000;
/** Slower than this multiple of the target interval counts as struggling. */
const QUALITY_SLACK = 1.25;
/** Verdicts in a row that must say "struggling" before quality drops. */
const QUALITY_STRIKES = 2;

/**
 * Decides when the office should drop to lite quality: when the median interval between rendered
 * frames stays well above what the pacer aims for. The median ignores one-off hitches, however
 * long, unless the next window is slow as well; the target follows the cap (and the covered
 * rate); only frames after `arm()` count, so loading and shader compiles never trigger it, and
 * pauses (hidden tab, phone windows) restart it. Once it declines it stays declined.
 */
export class QualityMonitor {
	declined = false;
	private armed = false;
	private intervals: number[] = [];
	private targets: number[] = [];
	private last = Number.NaN;
	private span = 0;
	private strikes = 0;

	/** Start judging (after the first frames and shader compiles are behind us). */
	arm() {
		this.armed = true;
		this.restart();
	}

	/** Drop the current window: the cadence changed on purpose (pause, cover, resize). */
	restart() {
		this.intervals = [];
		this.targets = [];
		this.span = 0;
		this.last = Number.NaN;
	}

	/** Feed the timestamp of a rendered frame and the interval aimed for; true on the decline. */
	frame(t: number, targetMs: number) {
		if (!this.armed || this.declined) return false;
		const dt = t - this.last;
		this.last = t;
		if (!(dt > 0)) return false;
		this.intervals.push(dt);
		this.targets.push(targetMs);
		this.span += dt;
		if (this.intervals.length < QUALITY_WINDOW && this.span < QUALITY_WINDOW_MS) return false;
		const slow = median(this.intervals) > median(this.targets) * QUALITY_SLACK;
		this.intervals = [];
		this.targets = [];
		this.span = 0;
		this.strikes = slow ? this.strikes + 1 : 0;
		if (this.strikes < QUALITY_STRIKES) return false;
		this.declined = true;
		return true;
	}
}
