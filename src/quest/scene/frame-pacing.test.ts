import { describe, expect, it } from 'vitest';
import { FramePacer, QualityMonitor, median, vsyncDivisor } from './frame-pacing';

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

describe('median', () => {
	it('handles odd, even and empty lists', () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 3, 2])).toBe(2.5);
		expect(median([])).toBeNaN();
	});
});

describe('vsyncDivisor', () => {
	it('rounds the refresh rate to a whole multiple of the target', () => {
		expect(vsyncDivisor(1000 / 60)).toBe(1);
		expect(vsyncDivisor(1000 / 75)).toBe(1);
		expect(vsyncDivisor(1000 / 90)).toBe(2);
		expect(vsyncDivisor(1000 / 120)).toBe(2);
		expect(vsyncDivisor(1000 / 144)).toBe(2);
		expect(vsyncDivisor(1000 / 165)).toBe(3);
		expect(vsyncDivisor(1000 / 240)).toBe(4);
		expect(vsyncDivisor(1000 / 30)).toBe(1);
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

	it('ignores long stalls', () => {
		const m = new QualityMonitor();
		m.arm();
		let t = 0;
		let declined = false;
		for (let i = 0; i < 400; i++) {
			t += i % 2 ? 5000 : target;
			if (m.frame(t, target)) declined = true;
		}
		expect(declined).toBe(false);
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
