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
	const near = nearMedian(intervals);
	return near.length ? near.reduce((a, b) => a + b, 0) / near.length : median(intervals);
}

/** The intervals refreshInterval averages: those within half the median either way. */
function nearMedian(intervals: readonly number[]) {
	const mid = median(intervals);
	return intervals.filter((dt) => dt > mid * 0.5 && dt < mid * 1.5);
}

/** Allowance for timestamps rounded to whole milliseconds (Firefox), in ms. */
const ROUNDING = 1;
/** Widest spread (longest / shortest) a run of intervals may have to come from one cadence. */
const STEADY = 1.2;

/**
 * The intervals come from one steady cadence, give or take whole-millisecond rounding, and not
 * from a mix of two: a GPU that keeps rAF two and three vsyncs apart in turn spreads them by
 * 1.5, Firefox's rounding of a 60 Hz screen (16 and 17 ms) by about 1.1. The rounding allowance
 * (a millisecond either end) is added once, not scaled, so at 240 Hz, where a whole vsync is
 * barely more than it, 8.3 and 12.5 ms still read as two cadences while 3 to 5 ms reads as one.
 */
export function steady(intervals: readonly number[]) {
	if (!intervals.length) return false;
	const shortest = Math.min(...intervals);
	return Math.max(...intervals) - shortest < shortest * (STEADY - 1) + 2 * ROUNDING;
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
 * Callbacks in a row clearly quicker than the estimate (under QUICK of it) that re-estimate
 * from them at once: a load that slowed rAF down has passed, and waiting for the next periodic
 * estimate would skip healthy vsyncs for seconds. The same run clearly slower (over 1 / QUICK
 * of it, less the rounding allowance: 11 ms callbacks of an 85 or 90 Hz screen after 120 Hz)
 * and steady does too: the window moved to a slower screen, where a stale, quick estimate
 * would count every frame as late. Only a steady run, so a GPU that makes rAF stutter between
 * two and three vsyncs keeps being judged against the real refresh rate; one that slows rAF to
 * a steady crawl is still caught by slowInterval.
 */
const QUICK_RUN = 12;
const QUICK = 0.75;

/**
 * Measures the display's vsync interval from rAF timestamps (refreshInterval, re-measured now
 * and then, so a window dragged to another screen picks up its rate, and at once when callbacks
 * keep coming clearly quicker or steadily slower than the estimate) and decides which callbacks
 * render. A re-measure that finds a mix of two cadences (steady) keeps the estimate it has: such
 * a mix is a stuttering GPU, not a screen, and averaging it would hide the stutter.
 */
export class FramePacer {
	/** Estimated vsync interval in ms; NaN until measured. */
	vsync = Number.NaN;
	private intervals: number[] = [];
	private lastTick = Number.NaN;
	private lastRender = Number.NaN;
	private untilEstimate = REFRESH_FIRST;
	private quick = 0;
	private slow = 0;

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
			this.quick = dt < this.vsync * QUICK ? this.quick + 1 : 0;
			this.slow = dt > this.vsync / QUICK - ROUNDING ? this.slow + 1 : 0;
			if (this.quick >= QUICK_RUN || (this.slow >= QUICK_RUN && steady(this.intervals.slice(-QUICK_RUN)))) {
				this.intervals = this.intervals.slice(-QUICK_RUN);
				this.untilEstimate = 0;
				this.quick = 0;
				this.slow = 0;
			}
		}
		if (--this.untilEstimate <= 0 && this.intervals.length) {
			if (Number.isNaN(this.vsync) || steady(nearMedian(this.intervals))) this.vsync = refreshInterval(this.intervals);
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
 * How long a rendered frame may take before it counts as missed: a millisecond short of half a
 * vsync past the cadence the pacer aims for (`aimMs`), at least 2 ms, so a frame that slipped by
 * one whole vsync counts (85 Hz: 23.5 against 16.6 ms; 120 Hz: 25 against 19.8 ms) while
 * timestamp jitter, even Firefox's whole milliseconds, never does. Short of half a vsync: when
 * runs of two-vsync callbacks pass for a slower screen (60 Hz on a 120 Hz one, a GPU keeping rAF
 * two or three vsyncs apart), a three-vsync frame is exactly 1.5 of that cadence and must not be
 * left to rounding. Without a measurement yet, falls back to slowInterval.
 */
export function lateInterval(aimMs: number, vsyncMs: number, fps: number = TARGET_FPS) {
	if (!(aimMs > 0)) return slowInterval(fps);
	const vsync = vsyncMs > 0 ? Math.min(vsyncMs, aimMs) : aimMs;
	return aimMs + Math.max(vsync / 2 - ROUNDING, 2);
}

/**
 * The slowest typical interval between rendered frames that still meets `fps`: a little under
 * it (as slow as the slowest cadence vsyncDivisor picks on purpose, 57 Hz for 60) with some slack,
 * 21.9 ms for 60. A struggling machine slows its rAF down too, which the pacer reads as a slower
 * screen and lateInterval then follows, so the median interval must also stay under this: a
 * slowed rAF must not be able to talk the bar down. The median, not each frame, so 48 and 50 Hz
 * screens with jittery timestamps pass.
 */
export function slowInterval(fps: number = TARGET_FPS) {
	return (1000 / fps) * 1.05 * 1.25;
}

/** A verdict is due once this much time has passed, however few frames it saw. */
const QUALITY_WINDOW_MS = 1500;
/** Share of missed frames in a window that counts as struggling. */
const QUALITY_MISSED = 0.1;
/** Verdicts in a row that must say "struggling" before quality drops a step. */
const QUALITY_STRIKES = 2;

/**
 * Decides when the office should drop a quality step: when, for two windows of 1.5 s in a row,
 * more than a tenth of the rendered frames come later than the pacer's own cadence
 * (lateInterval) or the median interval is too slow for the target (slowInterval). Missed
 * frames catch a GPU that misses every fifth vsync, which keeps the median at one vsync yet
 * judders visibly; the median catches a machine whose rAF itself slowed down, or a pacer still
 * aiming at a stale, slow refresh rate. One-off hitches, however long, fill one window at most;
 * only frames after `arm()` count, so loading and shader compiles never trigger it, and pauses
 * (hidden tab, phone windows), resizes and each step restart it.
 */
export class QualityMonitor {
	private armed = false;
	private intervals: number[] = [];
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
		this.intervals = [];
		this.missed = 0;
		this.span = 0;
		this.last = Number.NaN;
		this.strikes = 0;
	}

	/**
	 * Feed the timestamp of a rendered frame, the interval past which it counts as missed
	 * (lateInterval) and the slowest median interval that still keeps up (slowInterval); true
	 * when quality should drop a step. Judging then starts afresh, so the next step needs a
	 * struggle of its own.
	 */
	frame(t: number, lateMs: number, slowMs: number) {
		if (!this.armed) return false;
		const dt = t - this.last;
		this.last = t;
		if (!(dt > 0)) return false;
		this.intervals.push(dt);
		if (dt > lateMs) this.missed++;
		this.span += dt;
		if (this.span < QUALITY_WINDOW_MS) return false;
		const slow = this.missed > this.intervals.length * QUALITY_MISSED || median(this.intervals) > slowMs;
		this.intervals = [];
		this.missed = 0;
		this.span = 0;
		this.strikes = slow ? this.strikes + 1 : 0;
		if (this.strikes < QUALITY_STRIKES) return false;
		this.restart();
		return true;
	}
}
