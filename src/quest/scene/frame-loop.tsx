'use client';

import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { COVERED_FPS, FramePacer, lateInterval, QualityMonitor, slowInterval, TARGET_FPS } from './frame-pacing';
import { canvasPixels, watchPixelRatio } from './quality';

/** Longest step the scene clock takes in one frame (s), so a long stall never jumps ahead. */
const MAX_STEP = 0.1;
/** The step of the first frame after a (re)start, as if the previous frame were 60 fps ago. */
const FIRST_STEP = 1 / 60;

/**
 * Drives the canvas (frameloop="never") from one rAF loop: renders every Nth vsync for about
 * 60 fps on any display (30 while a window covers the office, every vsync with ?fps=max), stops
 * while paused, and tells the quality monitor which frames arrive late.
 */
export function FrameLoop({
	paused,
	covered,
	uncapped,
	judge,
	onDecline,
	onResize,
}: {
	paused: boolean;
	/** A window and its backdrop cover the office: half the frame rate is plenty. */
	covered: boolean;
	/** Review aid (?fps=max): render on every vsync. */
	uncapped: boolean;
	/** Watch for frames too slow for this quality (only once the scene is up and compiled). */
	judge: boolean;
	/**
	 * Too many frames came late: drop a quality step (judging then starts afresh). `pixels` is the
	 * canvas's size (quality.ts canvasPixels).
	 */
	onDecline: (pixels: number) => void;
	/** The canvas changed size or pixel ratio, or the screen its density; `pixels` as for onDecline. */
	onResize: (pixels: number) => void;
}) {
	const advance = useThree((state) => state.advance);
	const size = useThree((state) => state.size);
	const dpr = useThree((state) => state.viewport.dpr);
	const [pacer] = useState(() => new FramePacer());
	const [monitor] = useState(() => new QualityMonitor());
	/** The scene clock (s): keeps counting across pauses, without the time spent paused. */
	const clock = useRef(0);
	const decline = useRef(onDecline);
	const resized = useRef(onResize);
	useEffect(() => {
		decline.current = onDecline;
		resized.current = onResize;
	}, [onDecline, onResize]);
	/** The canvas's size (quality.ts canvasPixels). */
	const pixels = useRef(0);
	// The screen's own pixel ratio, watched on its own: at one pixel per CSS pixel (the lower
	// tiers) a move from a Retina display to an external screen changes nothing R3F reports.
	const [density, setDensity] = useState(() => window.devicePixelRatio);
	useEffect(() => watchPixelRatio(setDensity), []);

	useEffect(() => {
		if (judge) monitor.arm();
	}, [judge, monitor]);

	// Resizing wipes the (opaque) drawing buffer. Redraw before the next paint, so a skipped
	// vsync, the covered rate or a pause never shows a black canvas.
	const sized = useRef(false);
	useLayoutEffect(() => {
		pixels.current = canvasPixels(size.width, size.height, density);
		if (!sized.current) {
			sized.current = true;
			return;
		}
		advance(clock.current);
		// A new canvas size (or a quality step's pixel ratio) costs a frame or two; judge after.
		monitor.restart();
		resized.current(pixels.current);
	}, [size, dpr, density, advance, monitor]);

	useEffect(() => {
		if (paused) return;
		pacer.reset();
		// The cadence changes on purpose here; judge the new one afresh.
		monitor.restart();
		const fps = uncapped ? Number.POSITIVE_INFINITY : covered ? COVERED_FPS : TARGET_FPS;
		// Frames count as missed when later than the pacer's own cadence, the capped one even
		// with ?fps=max, by half a vsync; their median must keep up with the rate (frame-pacing.ts).
		const rate = covered ? COVERED_FPS : TARGET_FPS;
		const slow = slowInterval(rate);
		let last = Number.NaN;
		let frame = 0;
		const tick = (t: number) => {
			frame = requestAnimationFrame(tick);
			if (!pacer.tick(t, fps)) return;
			const step = Number.isNaN(last) ? FIRST_STEP : Math.min(MAX_STEP, Math.max(0, (t - last) / 1000));
			last = t;
			clock.current += step;
			advance(clock.current);
			if (judge && monitor.frame(t, lateInterval(pacer.targetInterval(rate), pacer.vsync, rate), slow))
				decline.current(pixels.current);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [paused, covered, uncapped, judge, advance, pacer, monitor]);

	return null;
}
