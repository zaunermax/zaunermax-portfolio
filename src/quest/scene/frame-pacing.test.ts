import { describe, expect, it } from 'vitest';
import { FramePacer, QualityMonitor, lateInterval, median, refreshInterval, slowInterval, vsyncDivisor } from './frame-pacing';

/** Feeds `seconds` of rAF callbacks at `hz` and returns the rendered timestamps. */
function run(pacer: FramePacer, hz: number, seconds: number, fps?: number, start = 0, jitter = 0) {
	const rendered: number[] = [];
	const period = 1000 / hz;
	const n = Math.round(seconds * hz);
	for (let i = 0; i < n; i++) {
		const t = start + i * period + (jitter ? Math.sin(i * 12.9898) * jitter : 0);
		if (pacer.tick(t, fps)) rendered.push(t);
	}
	return rendered;
}

const intervals = (ts: number[]) => ts.slice(1).map((t, i) => t - ts[i]);

/** A small seeded PRNG, so jitter is the same on every run. */
function prng(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * rAF timestamps as Firefox gives them: whole milliseconds, with a little jitter (8/9 ms at
 * 120 Hz), or up to `jitter` ms either way.
 */
function firefoxTimes(hz: number, seconds: number, start = 0, seed = 1, jitter = 0.4) {
	const random = prng(seed);
	const period = 1000 / hz;
	return Array.from({ length: Math.round(seconds * hz) }, (_, i) =>
		Math.round(start + i * period + (random() - 0.5) * 2 * jitter),
	);
}

describe('median', () => {
	it('handles odd, even and empty lists', () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 3, 2])).toBe(2.5);
		expect(median([])).toBeNaN();
	});
});

describe('vsyncDivisor', () => {
	it('skips as many vsyncs as still keep up with the target', () => {
		expect(vsyncDivisor(1000 / 60)).toBe(1);
		expect(vsyncDivisor(1000 / 75)).toBe(1);
		expect(vsyncDivisor(1000 / 90)).toBe(1);
		expect(vsyncDivisor(1000 / 100)).toBe(1);
		expect(vsyncDivisor(1000 / 120)).toBe(2);
		// Measured a hair low.
		expect(vsyncDivisor(1000 / 118)).toBe(2);
		expect(vsyncDivisor(1000 / 144)).toBe(2);
		expect(vsyncDivisor(1000 / 165)).toBe(2);
		expect(vsyncDivisor(1000 / 240)).toBe(4);
		expect(vsyncDivisor(1000 / 30)).toBe(1);
	});

	it('never renders below the target on common screens', () => {
		for (const hz of [60, 75, 90, 100, 120, 144, 165, 240]) expect(hz / vsyncDivisor(1000 / hz)).toBeGreaterThanOrEqual(60);
	});

	it('halves again for the covered rate', () => {
		expect(vsyncDivisor(1000 / 60, 30)).toBe(2);
		expect(vsyncDivisor(1000 / 120, 30)).toBe(4);
	});

	it('falls back to every vsync without a measurement', () => {
		expect(vsyncDivisor(Number.NaN)).toBe(1);
		expect(vsyncDivisor(0)).toBe(1);
	});
});

describe('refreshInterval', () => {
	it('sees through timestamps rounded to whole milliseconds', () => {
		expect(refreshInterval([8, 9, 8, 9, 8, 8, 9, 8, 9, 8, 8, 9])).toBeCloseTo(1000 / 120, 0);
		expect(refreshInterval([11, 12, 11, 11, 12, 11, 11, 12, 11])).toBeCloseTo(1000 / 90, 0);
	});

	it('ignores vsyncs the browser skipped while busy', () => {
		expect(refreshInterval([8.3, 16.7, 8.3, 8.4, 16.6, 8.3, 8.3, 25, 8.3])).toBeCloseTo(8.33, 1);
	});
});

describe('FramePacer', () => {
	it('renders every vsync at 60 Hz', () => {
		const pacer = new FramePacer();
		const r = run(pacer, 60, 2);
		expect(r.length).toBeGreaterThanOrEqual(119);
	});

	it('renders every other vsync at 120 Hz, at an even cadence', () => {
		const pacer = new FramePacer();
		run(pacer, 120, 1);
		const r = run(pacer, 120, 2, undefined, 1000);
		expect(r.length).toBe(120);
		for (const dt of intervals(r)) expect(dt).toBeCloseTo(1000 / 60, 5);
	});

	it('holds a steady 72 fps at 144 Hz, even with timestamp jitter', () => {
		const pacer = new FramePacer();
		run(pacer, 144, 1, undefined, 0, 0.8);
		const r = run(pacer, 144, 2, undefined, 1000, 0.8);
		const steps = intervals(r).map((dt) => Math.round(dt / (1000 / 144)));
		expect(new Set(steps)).toEqual(new Set([2]));
	});

	it('drops to about 30 fps when asked', () => {
		const pacer = new FramePacer();
		run(pacer, 120, 1);
		const r = run(pacer, 120, 2, 30, 1000);
		expect(r.length).toBe(60);
	});

	it('renders every vsync for ?fps=max', () => {
		const pacer = new FramePacer();
		const r = run(pacer, 120, 1, Number.POSITIVE_INFINITY);
		expect(r.length).toBe(120);
	});

	it('keeps up when the browser itself skips vsyncs', () => {
		const pacer = new FramePacer();
		run(pacer, 120, 1);
		// A busy machine: callbacks only every third vsync (40 Hz). Each one should render.
		const r: number[] = [];
		for (let i = 0; i < 40; i++) {
			const t = 1000 + i * 25;
			if (pacer.tick(t)) r.push(t);
		}
		expect(r.length).toBe(40);
	});

	it('renders the first callback after a reset at once', () => {
		const pacer = new FramePacer();
		run(pacer, 120, 1);
		pacer.reset();
		expect(pacer.tick(5000)).toBe(true);
	});

	it('keeps one divisor at 90 Hz across re-estimates, with Firefox-style timestamps', () => {
		for (const seed of [1, 2, 3]) {
			const pacer = new FramePacer();
			const divisors = new Set<number>();
			const steps = new Set<number>();
			let last = Number.NaN;
			for (const t of firefoxTimes(90, 30, 0, seed)) {
				const rendered = pacer.tick(t);
				if (!Number.isNaN(pacer.vsync)) divisors.add(vsyncDivisor(pacer.vsync));
				if (rendered && t > 1000) {
					if (!Number.isNaN(last)) steps.add(Math.round((t - last) / (1000 / 90)));
					last = t;
				}
			}
			expect(divisors).toEqual(new Set([1]));
			expect(steps).toEqual(new Set([1]));
		}
	});

	it('renders every other vsync at 120 Hz with Firefox-style 8/9 ms timestamps', () => {
		const pacer = new FramePacer();
		const times = firefoxTimes(120, 10);
		for (const dt of intervals(times)) expect([7, 8, 9, 10]).toContain(dt);
		const r = times.filter((t) => pacer.tick(t) && t > 1000);
		expect(vsyncDivisor(pacer.vsync)).toBe(2);
		const steps = intervals(r).map((dt) => Math.round(dt / (1000 / 120)));
		expect(new Set(steps)).toEqual(new Set([2]));
		expect(r.length).toBeGreaterThanOrEqual(538);
		expect(r.length).toBeLessThanOrEqual(541);
	});

	it('picks the refresh rate back up promptly once a load that halved rAF passes', () => {
		for (const seed of [1, 2]) {
			const pacer = new FramePacer();
			const vsync = 1000 / 85;
			// Eight seconds of load: callbacks only every other vsync, long enough for the pacer
			// to take the screen for 42.5 Hz.
			for (const t of firefoxTimes(85, 8, 0, seed).filter((_, i) => i % 2 === 0)) pacer.tick(t);
			expect(pacer.vsync).toBeCloseTo(2 * vsync, 0);
			// Load gone: callbacks every vsync again. Within a quarter of a second the pacer renders
			// every one of them.
			const after = firefoxTimes(85, 3, 8000, seed);
			const rendered = after.filter((t) => pacer.tick(t) && t >= 8250);
			expect(pacer.vsync).toBeCloseTo(vsync, 0);
			expect(rendered.length).toBeGreaterThanOrEqual(after.filter((t) => t >= 8250).length - 1);
		}
	});

	it('keeps its estimate through a busy stretch with the odd quick callback', () => {
		const pacer = new FramePacer();
		run(pacer, 120, 2);
		// Callbacks at 40 Hz with every eighth one quick: never a run, so no re-estimate.
		let t = 2000;
		for (let i = 0; i < 400; i++) {
			t += i % 8 === 0 ? 8.3 : 25;
			pacer.tick(t);
		}
		expect(pacer.vsync).toBeGreaterThan(20);
	});

	it('re-measures the refresh rate when it changes', () => {
		const pacer = new FramePacer();
		run(pacer, 120, 2);
		expect(pacer.vsync).toBeCloseTo(1000 / 120, 3);
		run(pacer, 60, 6, undefined, 2000);
		expect(pacer.vsync).toBeCloseTo(1000 / 60, 3);
	});
});

describe('QualityMonitor', () => {
	const target = 1000 / 60;
	const late = lateInterval(target, target);
	const slow = slowInterval();
	const feed = (m: QualityMonitor, interval: number, frames: number, start = 0) => {
		let steps = 0;
		for (let i = 0; i <= frames; i++) if (m.frame(start + i * interval, late, slow)) steps++;
		return steps;
	};

	it('ignores frames until armed', () => {
		const m = new QualityMonitor();
		expect(feed(m, 40, 600)).toBe(0);
	});

	it('steps down on a sustained 36 fps', () => {
		const m = new QualityMonitor();
		m.arm();
		expect(feed(m, 1000 / 36, 400)).toBeGreaterThan(0);
	});

	it('judges a restarted cadence afresh', () => {
		const m = new QualityMonitor();
		m.arm();
		// One slow window, a deliberate restart (pause, cover), then one more slow window.
		expect(feed(m, 1000 / 36, 55)).toBe(0);
		m.restart();
		expect(feed(m, 1000 / 36, 55, 10_000)).toBe(0);
	});

	it('keeps quality at a steady 60 fps with the odd hitch', () => {
		const m = new QualityMonitor();
		m.arm();
		let t = 0;
		let steps = 0;
		for (let i = 0; i < 3000; i++) {
			t += i % 40 === 0 ? 120 : target;
			if (m.frame(t, late, slow)) steps++;
		}
		expect(steps).toBe(0);
	});

	it('steps down when a fifth of the frames slip a vsync, though the median stays at one', () => {
		const m = new QualityMonitor();
		m.arm();
		let t = 0;
		let at = Number.NaN;
		for (let i = 0; i < 1000 && Number.isNaN(at); i++) {
			t += i % 5 === 0 ? 2 * target : target;
			if (m.frame(t, late, slow)) at = t;
		}
		expect(at).toBeGreaterThanOrEqual(3000);
		expect(at).toBeLessThan(3500);
	});

	it('steps down at 42 fps even when the lateness bar follows a slow refresh estimate', () => {
		// The pacer read the slowed rAF (or a stale estimate) as a 42 Hz screen: no frame is late
		// against its cadence, but the median is too slow for 60 fps.
		const m = new QualityMonitor();
		m.arm();
		let steps = 0;
		for (let i = 0; i <= 200; i++) if (m.frame(i * (1000 / 42), lateInterval(1000 / 42, 1000 / 42), slow)) steps++;
		expect(steps).toBeGreaterThan(0);
	});

	it('shrugs off short bursts of judder', () => {
		const m = new QualityMonitor();
		m.arm();
		let t = 0;
		let steps = 0;
		// Three quarters of a second with every third frame slipping, then three steady seconds.
		for (let burst = 0; burst < 10; burst++)
			for (let i = 0; i < 225; i++) {
				t += i < 45 && i % 3 === 0 ? 2 * target : target;
				if (m.frame(t, late, slow)) steps++;
			}
		expect(steps).toBe(0);
	});

	it('shrugs off a single long stall', () => {
		for (const at of [1, 45, 89, 90, 91, 200]) {
			const m = new QualityMonitor();
			m.arm();
			let t = 0;
			let steps = 0;
			for (let i = 0; i < 600; i++) {
				t += i === at ? 5000 : target;
				if (m.frame(t, late, slow)) steps++;
			}
			expect(steps).toBe(0);
		}
	});

	/** Seconds from arming until the first step down at a steady `fps`, or Infinity. */
	const secondsToStep = (fps: number, limit = 60) => {
		const m = new QualityMonitor();
		m.arm();
		for (let t = 0; t <= limit * 1000; t += 1000 / fps) if (m.frame(t, late, slow)) return t / 1000;
		return Number.POSITIVE_INFINITY;
	};

	it('steps down within seconds however few frames arrive', () => {
		expect(secondsToStep(3)).toBeLessThanOrEqual(5);
		expect(secondsToStep(1)).toBeLessThanOrEqual(5);
		expect(secondsToStep(0.5)).toBeLessThanOrEqual(5);
		expect(secondsToStep(0.2, 120)).toBeLessThanOrEqual(11);
	});

	it('needs a fresh struggle for each step', () => {
		const m = new QualityMonitor();
		m.arm();
		let t = 0;
		const steps: number[] = [];
		for (let i = 0; i < 2000; i++) {
			t += 40;
			if (m.frame(t, late, slow)) steps.push(t);
		}
		// One step per two windows, never two at once.
		expect(steps.length).toBeGreaterThanOrEqual(2);
		for (const dt of intervals(steps)) expect(dt).toBeGreaterThanOrEqual(3000);
	});
});

describe('lateInterval', () => {
	it('counts a frame late once it slips by a vsync past the cadence aimed for', () => {
		// 85 Hz renders every vsync: a doubled vsync (23.5 ms) is late, 12 ms is not.
		expect(lateInterval(1000 / 85, 1000 / 85)).toBeCloseTo(1500 / 85);
		// 120 Hz renders every other vsync: three vsyncs (25 ms) are late.
		expect(lateInterval(1000 / 60, 1000 / 120)).toBeCloseTo(1000 / 60 + 500 / 120);
		expect(lateInterval(1000 / 60, 1000 / 60)).toBeCloseTo(25);
		expect(lateInterval(1000 / 30, 1000 / 60, 30)).toBeCloseTo(1000 / 30 + 500 / 60);
	});

	it('follows a slow screen, leaving the median to slowInterval', () => {
		expect(lateInterval(1000 / 48, 1000 / 48)).toBeCloseTo(1500 / 48);
	});

	it('falls back to slowInterval without a measurement', () => {
		expect(lateInterval(Number.NaN, Number.NaN)).toBeCloseTo(slowInterval());
		expect(lateInterval(1000 / 60, Number.NaN)).toBeCloseTo(25);
	});
});

describe('slowInterval', () => {
	it('sits a little under the target rate', () => {
		expect(slowInterval()).toBeCloseTo((1000 / 60) * 1.05 * 1.25);
		expect(slowInterval(30)).toBeCloseTo((1000 / 30) * 1.05 * 1.25);
		// Slower than the slowest healthy screens the pacer meets, quicker than 45 fps.
		expect(slowInterval()).toBeGreaterThan(1000 / 48);
		expect(slowInterval()).toBeLessThan(1000 / 45);
	});
});

describe('pacer and monitor together', () => {
	/** Feeds rAF timestamps through the pacer and the monitor, as FrameLoop does; the step count. */
	const play = (times: number[], fps = 60) => {
		const pacer = new FramePacer();
		const m = new QualityMonitor();
		let steps = 0;
		let armed = false;
		for (const t of times) {
			// Judged once the first estimate is in, as FrameLoop arms it once the scene settled.
			if (t > 3000 && !armed) {
				m.arm();
				armed = true;
			}
			if (pacer.tick(t, fps) && m.frame(t, lateInterval(pacer.targetInterval(fps), pacer.vsync, fps), slowInterval(fps))) steps++;
		}
		return steps;
	};

	it('never downgrades healthy rendering at the pacer\'s cadence, with Firefox-style timestamps', () => {
		for (const hz of [60, 75, 85, 90, 91, 93, 95, 100, 120, 144, 165, 240])
			for (const seed of [1, 2]) {
				expect(play(firefoxTimes(hz, 40, 0, seed))).toBe(0);
				expect(play(firefoxTimes(hz, 40, 0, seed), 30)).toBe(0);
			}
	});

	it('never downgrades a steady 57 Hz screen', () => {
		expect(play(firefoxTimes(57, 40))).toBe(0);
	});

	it('never downgrades a steady 48 or 50 Hz screen, even with 2 ms of jitter', () => {
		for (const hz of [48, 50])
			for (const seed of [1, 2, 3]) {
				expect(play(firefoxTimes(hz, 40, 0, seed, 2))).toBe(0);
				expect(play(firefoxTimes(hz, 40, 0, seed, 2), 30)).toBe(0);
			}
	});

	/**
	 * Callbacks at `hz` with Firefox-style timestamps, through the pacer and the monitor, where
	 * every `every`th rendered frame keeps the GPU busy long enough that the browser skips the
	 * next `divisor` vsyncs: the frame after it lands one vsync late. The step count.
	 */
	const judder = (hz: number, every: number, seconds = 30) => {
		const pacer = new FramePacer();
		const m = new QualityMonitor();
		let steps = 0;
		let frames = 0;
		let blocked = 0;
		let armed = false;
		for (const t of firefoxTimes(hz, seconds)) {
			if (blocked > 0) {
				blocked--;
				continue;
			}
			if (t > 3000 && !armed) {
				m.arm();
				armed = true;
			}
			if (!pacer.tick(t)) continue;
			if (m.frame(t, lateInterval(pacer.targetInterval(), pacer.vsync), slowInterval())) steps++;
			if (t > 2000 && ++frames % every === 0) blocked = vsyncDivisor(pacer.vsync);
		}
		return steps;
	};

	it('downgrades a big screen whose frames slip a vsync now and then, at 85 or 120 Hz', () => {
		// About a fifth of the frames: the median interval stays at the pacer's cadence.
		expect(judder(85, 5)).toBeGreaterThan(0);
		expect(judder(120, 6)).toBeGreaterThan(0);
	});

	/** Steps after a window is dragged from a `from` Hz screen to a `to` Hz one at `at` ms. */
	const switchScreens = (from: number, to: number, at: number, firefox = false, seed = 1) => {
		const random = prng(seed);
		const times: number[] = [];
		for (let t = 0; t < at + 8000; ) {
			t += 1000 / (t < at ? from : to);
			times.push(firefox ? Math.round(t + (random() - 0.5) * 0.8) : t);
		}
		return play(times);
	};

	it('never downgrades a window dragged to a slower screen', () => {
		for (const [from, to] of [
			[100, 60],
			[165, 60],
			[90, 60],
			[85, 50],
			[144, 48],
		])
			for (let at = 10000; at < 14000; at += 250) {
				expect(switchScreens(from, to, at), `${from} -> ${to} Hz at ${at} ms`).toBe(0);
				expect(switchScreens(from, to, at, true, at), `${from} -> ${to} Hz at ${at} ms, Firefox`).toBe(0);
			}
	});

	it('never downgrades a window dragged to a quicker screen', () => {
		for (const [from, to] of [
			[60, 120],
			[50, 85],
		])
			for (let at = 10000; at < 12000; at += 500) expect(switchScreens(from, to, at, true, at)).toBe(0);
	});

	it('still downgrades a GPU that slows rAF to a steady 42.5 fps on an 85 Hz screen', () => {
		// Healthy at first, then every callback lands two vsyncs apart: steady, so the pacer
		// re-estimates as for a slower screen, and the median catches it.
		const times = firefoxTimes(85, 30).filter((t, i) => t < 6000 || i % 2 === 0);
		expect(play(times)).toBeGreaterThan(0);
	});

	it('still downgrades a GPU that makes rAF stutter between two and three vsyncs at 120 Hz', () => {
		// About 55 fps: the median stays at two vsyncs, a third of the frames slip to three, and
		// the run is not steady enough to pass for a slower screen.
		const all = firefoxTimes(120, 30);
		const times: number[] = [];
		let k = 0;
		for (let i = 0; i < all.length; i += all[i] < 6000 ? 1 : k++ % 3 === 0 ? 3 : 2) times.push(all[i]);
		expect(play(times)).toBeGreaterThan(0);
	});

	it('keeps quality when only the odd frame slips', () => {
		expect(judder(85, 50)).toBe(0);
		expect(judder(120, 50)).toBe(0);
	});

	it('downgrades a machine that only manages 40 fps on a 90 Hz screen', () => {
		// Callbacks still arrive at 90 Hz, but each frame takes long enough to skip a vsync or two.
		const times = firefoxTimes(90, 30).filter((_, i) => i % 9 === 0 || i % 9 === 2 || i % 9 === 4 || i % 9 === 6);
		expect(play(times)).toBeGreaterThan(0);
	});

	it('downgrades a machine whose rAF itself runs at 42 fps', () => {
		expect(play(firefoxTimes(42, 30))).toBeGreaterThan(0);
	});
});
