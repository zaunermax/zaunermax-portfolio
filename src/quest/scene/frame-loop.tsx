'use client';

import { useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { COVERED_FPS, FramePacer, judgedInterval, QualityMonitor, TARGET_FPS } from './frame-pacing';

/** Longest step the scene clock takes in one frame (s), so a long stall never jumps ahead. */
const MAX_STEP = 0.1;
/** The step of the first frame after a (re)start, as if the previous frame were 60 fps ago. */
const FIRST_STEP = 1 / 60;

/**
 * Drives the canvas (frameloop="never") from one rAF loop: renders every Nth vsync for about
 * 60 fps on any display (30 while a window covers the office, every vsync with ?fps=max), stops
 * while paused, and tells the quality monitor how steadily the frames arrive.
 */
export function FrameLoop({
	paused,
	covered,
	uncapped,
	judge,
	onDecline,
}: {
	paused: boolean;
	/** A window and its backdrop cover the office: half the frame rate is plenty. */
	covered: boolean;
	/** Review aid (?fps=max): render on every vsync. */
	uncapped: boolean;
	/** Watch for frames too slow for full quality (only once the scene is up and compiled). */
	judge: boolean;
	onDecline: () => void;
}) {
	const advance = useThree((state) => state.advance);
	const [pacer] = useState(() => new FramePacer());
	const [monitor] = useState(() => new QualityMonitor());
	/** The scene clock (s): keeps counting across pauses, without the time spent paused. */
	const clock = useRef(0);
	const decline = useRef(onDecline);
	useEffect(() => {
		decline.current = onDecline;
	}, [onDecline]);

	useEffect(() => {
		if (judge) monitor.arm();
	}, [judge, monitor]);

	useEffect(() => {
		if (paused) return;
		pacer.reset();
		// The cadence changes on purpose here; judge the new one afresh.
		monitor.restart();
		const fps = uncapped ? Number.POSITIVE_INFINITY : covered ? COVERED_FPS : TARGET_FPS;
		// Judged against the pacer's aim, held between 60 fps (or the covered rate) and a little
		// under it (frame-pacing.ts).
		const rate = covered ? COVERED_FPS : TARGET_FPS;
		let last = Number.NaN;
		let frame = 0;
		const tick = (t: number) => {
			frame = requestAnimationFrame(tick);
			if (!pacer.tick(t, fps)) return;
			const step = Number.isNaN(last) ? FIRST_STEP : Math.min(MAX_STEP, Math.max(0, (t - last) / 1000));
			last = t;
			clock.current += step;
			advance(clock.current);
			if (judge && monitor.frame(t, judgedInterval(pacer.targetInterval(fps), rate))) decline.current();
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [paused, covered, uncapped, judge, advance, pacer, monitor]);

	return null;
}
