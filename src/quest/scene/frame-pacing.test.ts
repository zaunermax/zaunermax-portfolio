import { describe, expect, it } from 'vitest';
import { FramePacer, QualityMonitor, judgedInterval, median, refreshInterval, vsyncDivisor } from './frame-pacing';

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

/** rAF timestamps as Firefox gives them: whole milliseconds, with a little jitter (8/9 ms at 120 Hz). */
function firefoxTimes(hz: number, seconds: number, start = 0, seed = 1) {
	const random = prng(seed);
	const period = 1000 / hz;
	return Array.from({ length: Math.round(seconds * hz) }, (_, i) => Math.round(start + i * period + (random() - 0.5) * 0.8));
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
	const feed = (m: QualityMonitor, interval: number, frames: number, start = 0) => {
		let declined = false;
		for (let i = 0; i <= frames; i++) if (m.frame(start + i * interval, target)) declined = true;
		return declined;
	};

	it('ignores frames until armed', () => {
		const m = new QualityMonitor();
		expect(feed(m, 40, 600)).toBe(false);
		expect(m.declined).toBe(false);
	});

	it('declines on a sustained 36 fps', () => {
		const m = new QualityMonitor();
		m.arm();
		expect(feed(m, 1000 / 36, 400)).toBe(true);
		expect(m.declined).toBe(true);
	});

	it('keeps quality at a steady 60 fps with the odd hitch', () => {
		const m = new QualityMonitor();
		m.arm();
		let t = 0;
		let declined = false;
		for (let i = 0; i < 1000; i++) {
			t += i % 40 === 0 ? 120 : target;
			if (m.frame(t, target)) declined = true;
		}
		expect(declined).toBe(false);
	});

	it('needs the slowness to last, not one bad window', () => {
		const m = new QualityMonitor();
		m.arm();
		let t = 0;
		let declined = false;
		// Slow and fast windows alternate: never two slow verdicts in a row.
		for (let w = 0; w < 10; w++)
			for (let i = 0; i < 90; i++) {
				t += w % 2 ? target : 30;
				if (m.frame(t, target)) declined = true;
			}
		expect(declined).toBe(false);
	});

	it('shrugs off a single long stall', () => {
		for (const at of [1, 45, 89, 90, 91, 200]) {
			const m = new QualityMonitor();
			m.arm();
			let t = 0;
			let declined = false;
			for (let i = 0; i < 600; i++) {
				t += i === at ? 5000 : target;
				if (m.frame(t, target)) declined = true;
			}
			expect(declined).toBe(false);
		}
	});

	/** Seconds from arming until the decline at a steady `fps`, or Infinity. */
	const secondsToDecline = (fps: number, limit = 60) => {
		const m = new QualityMonitor();
		m.arm();
		for (let t = 0; t <= limit * 1000; t += 1000 / fps) if (m.frame(t, target)) return t / 1000;
		return Number.POSITIVE_INFINITY;
	};

	it('declines within seconds however few frames arrive', () => {
		expect(secondsToDecline(3)).toBeLessThanOrEqual(5);
		expect(secondsToDecline(1)).toBeLessThanOrEqual(5);
		expect(secondsToDecline(0.5)).toBeLessThanOrEqual(5);
		expect(secondsToDecline(0.2, 120)).toBeLessThanOrEqual(11);
	});

	it('declines even when frames take a third of a second', () => {
		const m = new QualityMonitor();
		m.arm();
		expect(feed(m, 330, 400)).toBe(true);
	});

	it('stays declined and reports the decline once', () => {
		const m = new QualityMonitor();
		m.arm();
		let count = 0;
		for (let i = 0; i < 2000; i++) if (m.frame(i * 40, target)) count++;
		expect(count).toBe(1);
	});
});

describe('judgedInterval', () => {
	it('never asks for more than 60 fps, nor much less', () => {
		expect(judgedInterval(1000 / 90)).toBeCloseTo(1000 / 60);
		expect(judgedInterval(1000 / 72)).toBeCloseTo(1000 / 60);
		expect(judgedInterval(1000 / 60)).toBeCloseTo(1000 / 60);
		expect(judgedInterval(1000 / 58)).toBeCloseTo(1000 / 58);
		// A rAF slowed down by a struggling machine looks like a slow screen.
		expect(judgedInterval(1000 / 20)).toBeCloseTo(1050 / 60);
		expect(judgedInterval(1000 / 60, 30)).toBeCloseTo(1000 / 30);
	});
});

describe('pacer and monitor together', () => {
	/** Feeds Firefox-style rAF timestamps through the pacer and the monitor, as FrameLoop does. */
	const play = (times: number[], fps = 60) => {
		const pacer = new FramePacer();
		const m = new QualityMonitor();
		let declined = false;
		let armed = false;
		for (const t of times) {
			// Judged once the first estimate is in, as FrameLoop arms it once the scene settled.
			if (t > 3000 && !armed) {
				m.arm();
				armed = true;
			}
			if (pacer.tick(t, fps) && m.frame(t, judgedInterval(pacer.targetInterval(fps), fps))) declined = true;
		}
		return declined;
	};

	it('never downgrades healthy 90 to 95 Hz rendering', () => {
		for (const hz of [90, 91, 93, 95]) for (const seed of [1, 2]) expect(play(firefoxTimes(hz, 60, 0, seed))).toBe(false);
	});

	it('never downgrades healthy 60, 120 or 144 Hz rendering, nor the covered rate', () => {
		for (const hz of [60, 120, 144]) {
			expect(play(firefoxTimes(hz, 30))).toBe(false);
			expect(play(firefoxTimes(hz, 30), 30)).toBe(false);
		}
	});

	it('downgrades a machine that only manages 40 fps on a 90 Hz screen', () => {
		// Callbacks still arrive at 90 Hz, but each frame takes long enough to skip a vsync or two.
		const times = firefoxTimes(90, 30).filter((_, i) => i % 9 === 0 || i % 9 === 2 || i % 9 === 4 || i % 9 === 6);
		expect(play(times)).toBe(true);
	});
});
