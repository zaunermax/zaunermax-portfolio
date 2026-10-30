import { useEffect, useSyncExternalStore } from 'react';

/**
 * How far the office has loaded, for the veil's bar: real milestones (the page's data, the
 * kit files' bytes, the first frames) weighted roughly by how long each takes, plus a slow
 * creep so a stage without byte counts never looks stuck. It lives at module level, so the bar
 * carries on when the route's pending screen hands over to the app, and it only moves forward.
 */
const WEIGHTS = { page: 12, office: 46, characters: 12, parts: 10, scene: 20 } as const;
/** Stages reported from outside; `scene` (the first frames) only completes with the veil. */
export type LoadStage = keyof typeof WEIGHTS;

const TOTAL = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
/** The HTML has arrived, which is worth a cell before any script runs. */
const START = 0.05;
/** How far the creep may run ahead of the real figure, and never past this. */
const CREEP_LEAD = 0.12;
const CREEP_MAX = 0.94;
const TICK_MS = 100;

const STAGES = Object.keys(WEIGHTS) as LoadStage[];
const fraction = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<LoadStage, number>;
let shown = START;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function actual() {
	return STAGES.reduce((sum, s) => sum + WEIGHTS[s] * fraction[s], 0) / TOTAL;
}

function emit() {
	for (const listener of listeners) listener();
}

function tick() {
	const real = actual();
	if (real >= 1) shown = 1;
	else if (shown < real) shown += Math.max((real - shown) * 0.25, 0.005);
	else shown += (Math.min(real + CREEP_LEAD, CREEP_MAX) - shown) * 0.03;
	shown = Math.min(Math.max(shown, START), 1);
	emit();
	if (shown >= 1) stop();
}

function start() {
	if (timer === null && shown < 1 && listeners.size > 0) timer = setInterval(tick, TICK_MS);
}

function stop() {
	if (timer !== null) clearInterval(timer);
	timer = null;
}

/** Reports how much of a stage is done (0 to 1); a stage never goes backwards. */
export function reportLoad(stage: LoadStage, done: number) {
	fraction[stage] = Math.max(fraction[stage], Math.min(Math.max(done, 0), 1));
}

/** Everything is in (or given up on): the veil lifts on a full bar. */
function finishLoad() {
	for (const s of STAGES) fraction[s] = 1;
	tick();
}

/** Starts the bar over, if the last load finished (coming back to the office, say). */
export function restartLoad() {
	if (shown < 1) return;
	for (const s of STAGES) fraction[s] = 0;
	shown = START;
	emit();
	start();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	start();
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0) stop();
	};
}

const getShown = () => shown;
const getServerShown = () => START;

/** The bar's value (0 to 1). Marks the load finished when `ready`, starts it over otherwise. */
export function useLoadProgress(ready: boolean) {
	useEffect(() => {
		if (ready) finishLoad();
		else restartLoad();
	}, [ready]);
	return useSyncExternalStore(subscribe, getShown, getServerShown);
}
