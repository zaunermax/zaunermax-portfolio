/*
 * Frame pacing for the office: render every Nth vsync so motion runs at about 60 fps whatever
 * the display's refresh rate, and judge quality by how many of those frames arrive late.
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

/** Slack on the slowest cadence vsyncDivisor picks on purpose before a frame counts as late. */
const LATE_SLACK = 1.25;

/**
 * How long a rendered frame may take before it counts as missed: half a vsync past the cadence
 * the pacer aims for (`aimMs`), so a frame that slipped by one whole vsync counts (85 Hz: 23.5
 * against 11.8 ms; 120 Hz: 25 against 16.7 ms) while timestamp jitter, even Firefox's whole
 * milliseconds, never does. A struggling machine slows its rAF down too, which the pacer reads
 * as a slower screen, so the bar also stays under `fps` with a little slack (21.9 ms for 60):
 * it must not be able to talk the bar down.
 */
export function lateInterval(aimMs: number, vsyncMs: number, fps: number = TARGET_FPS) {
	const cap = (1000 / fps) * 1.05 * LATE_SLACK;
	if (!(aimMs > 0)) return cap;
	const vsync = vsyncMs > 0 ? Math.min(vsyncMs, aimMs) : aimMs;
	return Math.min(aimMs + Math.max(vsync / 2, 2), cap);
}

/** A verdict is due once this much time has passed, however few frames it saw. */
const QUALITY_WINDOW_MS = 1500;
/** Share of missed frames in a window that counts as struggling. */
const QUALITY_MISSED = 0.1;
/** Verdicts in a row that must say "struggling" before quality drops a step. */
const QUALITY_STRIKES = 2;

/**
 * Decides when the office should drop a quality step: when more than a tenth of the rendered
 * frames come later than the pacer's own cadence (lateInterval) for two windows of 1.5 s in a
 * row. Missed frames rather than the median: a GPU that misses every fifth vsync keeps the
 * median at one vsync, yet judders visibly. One-off hitches, however long, fill one window at
 * most; only frames after `arm()` count, so loading and shader compiles never trigger it, and
 * pauses (hidden tab, phone windows), resizes and each step restart it.
 */
export class QualityMonitor {
	private armed = false;
	private frames = 0;
	private missed = 0;
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
		this.frames = 0;
		this.missed = 0;
		this.span = 0;
		this.last = Number.NaN;
		this.strikes = 0;
	}

	/**
	 * Feed the timestamp of a rendered frame and the interval past which it counts as missed
	 * (lateInterval); true when quality should drop a step. Judging then starts afresh, so the
	 * next step needs a struggle of its own.
	 */
	frame(t: number, lateMs: number) {
		if (!this.armed) return false;
		const dt = t - this.last;
		this.last = t;
		if (!(dt > 0)) return false;
		this.frames++;
		if (dt > lateMs) this.missed++;
		this.span += dt;
		if (this.span < QUALITY_WINDOW_MS) return false;
		const slow = this.missed > this.frames * QUALITY_MISSED;
		this.frames = 0;
		this.missed = 0;
		this.span = 0;
		this.strikes = slow ? this.strikes + 1 : 0;
		if (this.strikes < QUALITY_STRIKES) return false;
		this.restart();
		return true;
	}
}
