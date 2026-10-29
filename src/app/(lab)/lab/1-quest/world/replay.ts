import type { Brief } from './schema';

/**
 * Prefixes of a finished brief, in the order it would have streamed in: the empty shell, then
 * each zone, the landmarks and event, the cast two at a time, and finally everything. Used to
 * replay how an office was built when a visitor arrives.
 */
export function briefSteps(brief: Brief): Brief[] {
	const shell: Brief = {
		...brief,
		zones: [],
		landmarks: {},
		event: { kind: 'none', title: '', story: '' },
		cast: [],
		closing: '',
	};
	const steps: Brief[] = [shell];
	for (let i = 1; i <= brief.zones.length; i++) steps.push({ ...shell, zones: brief.zones.slice(0, i) });
	const furnished = { ...shell, zones: brief.zones, landmarks: brief.landmarks, event: brief.event };
	steps.push(furnished);
	for (let i = 2; i < brief.cast.length + 2; i += 2) steps.push({ ...furnished, cast: brief.cast.slice(0, i) });
	steps.push(brief);
	return steps;
}
