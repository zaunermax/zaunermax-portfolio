import { describe, expect, it } from 'vitest';
import { compileWorld } from '../world/compile';
import { defaultBrief, DEFAULT_SEED } from '../world/default-world';
import { briefSteps } from '../world/replay';
import { sanitizeBrief } from '../world/sanitize';
import { buildProgress } from './hud';

const progress = (brief = defaultBrief, live = true) =>
	buildProgress(brief, compileWorld(brief, DEFAULT_SEED, { partial: true }), live);

describe('buildProgress', () => {
	it('walks through every stage of a streamed brief in order', () => {
		const stages = briefSteps(defaultBrief).map((step) => progress(step).stage);
		expect([...new Set(stages)]).toEqual(['rooms', 'signs', 'staff', 'checks']);
		expect(stages.at(-1)).toBe('checks');
	});

	it('names what is arriving right now', () => {
		expect(progress(sanitizeBrief({ company: 'X' })).detail).toBe('Drawing up the floor plan');
		const zone = defaultBrief.zones[1];
		expect(progress({ ...defaultBrief, zones: defaultBrief.zones.slice(0, 2), landmarks: {}, event: { kind: 'none', title: '', story: '' }, cast: [], closing: '' }).detail).toBe(`Furnishing ${zone.name}`);
		const staffed = { ...defaultBrief, cast: defaultBrief.cast.slice(0, 1), closing: '' };
		expect(progress(staffed).detail).toMatch(new RegExp(`^${defaultBrief.cast[0].name} clocks in at `));
		expect(progress(staffed).staff).toBe(1);
	});

	it('moves on to the signs once every room is named', () => {
		const rooms = compileWorld(defaultBrief, DEFAULT_SEED).rooms.filter((r) => !r.hall).length;
		const named = {
			...defaultBrief,
			zones: defaultBrief.zones.slice(0, rooms),
			landmarks: {},
			event: { kind: 'none' as const, title: '', story: '' },
			cast: [],
			closing: '',
		};
		expect(named.zones).toHaveLength(rooms);
		expect(progress(named).stage).toBe('signs');
		expect(progress(named).steps).toEqual([1, null, 0, 0]);
	});

	it('keeps the signs going until the event or the first arrival settles', () => {
		const signs = { ...defaultBrief, event: { kind: 'none' as const, title: '', story: '' }, cast: [], closing: '' };
		expect(progress(signs).stage).toBe('signs');
		expect(progress({ ...signs, zones: signs.zones.slice(0, 3) }).stage).toBe('signs');
		expect(progress({ ...signs, event: defaultBrief.event }).stage).toBe('staff');
	});

	it('shows the rooms as busy before the first one appears', () => {
		expect(progress(sanitizeBrief({ company: 'X' })).steps).toEqual([null, 0, 0, 0]);
	});

	it('marks the running stage and everything before it', () => {
		const { steps } = progress({ ...defaultBrief, closing: '' });
		expect(steps).toEqual([1, 1, null, 0]);
		expect(progress(defaultBrief).steps).toEqual([1, 1, 1, null]);
	});

	it('opens a replayed office instead of inspecting it', () => {
		const done = progress(defaultBrief, false);
		expect(done.stage).toBe('open');
		expect(done.steps).toEqual([1, 1, 1, 1]);
	});
});
