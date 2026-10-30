import { describe, expect, it } from 'vitest';
import { lookFor, Presence } from './presence';
import { clampPose, parseServerMessage, ROOM_CAP } from './protocol';
import { poseChanged, retryDelay } from './use-room';

const A = 'aaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbb';
const ME = 'cccccccccccccccc';
const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('Presence', () => {
	it('loads the welcome snapshot without the visitor themself', () => {
		const presence = new Presence();
		let changes = 0;
		presence.subscribe(() => changes++);
		presence.apply(
			{
				t: 'welcome',
				you: ME,
				session: SESSION,
				players: [
					{ id: A, x: 1, y: 2, h: 0, m: false },
					{ id: ME, x: 5, y: 5, h: 0, m: false },
				],
			},
			0,
		);
		expect(presence.you).toBe(ME);
		expect(presence.getIds()).toEqual([A]);
		expect(changes).toBe(1);
	});

	it('adds on first move, updates in place, removes on leave', () => {
		const presence = new Presence();
		presence.apply({ t: 'welcome', you: ME, session: SESSION, players: [] }, 0);
		const before = presence.getIds();
		presence.apply({ t: 'move', id: B, x: 3, y: 4, h: 1, m: true }, 1);
		const added = presence.getIds();
		expect(added).toEqual([B]);
		expect(added).not.toBe(before);
		presence.apply({ t: 'move', id: B, x: 6, y: 7, h: 2, m: false }, 2);
		// Moves of known visitors do not re-render the list.
		expect(presence.getIds()).toBe(added);
		expect(presence.get(B)).toMatchObject({ x: 6, y: 7, h: 2, m: false });
		presence.apply({ t: 'leave', id: B }, 3);
		expect(presence.getIds()).toEqual([]);
		presence.apply({ t: 'leave', id: B }, 3);
	});

	it('records waves and ignores its own echo', () => {
		const presence = new Presence();
		presence.apply({ t: 'welcome', you: ME, session: SESSION, players: [{ id: A, x: 1, y: 1, h: 0, m: false }] }, 0);
		presence.apply({ t: 'emote', id: A, e: 'wave' }, 42);
		expect(presence.get(A)?.waveAt).toBe(42);
		presence.apply({ t: 'move', id: ME, x: 1, y: 1, h: 0, m: false }, 1);
		expect(presence.get(ME)).toBeUndefined();
	});

	it('never tracks more than the cap and forgets everyone on reset', () => {
		const presence = new Presence();
		for (let i = 0; i < ROOM_CAP + 5; i++)
			presence.apply({ t: 'move', id: i.toString(16).padStart(16, '0'), x: 1, y: 1, h: 0, m: false }, 0);
		expect(presence.getIds()).toHaveLength(ROOM_CAP);
		presence.reset();
		expect(presence.getIds()).toEqual([]);
		expect(presence.you).toBeNull();
	});
});

describe('lookFor', () => {
	it('gives the same id the same look everywhere, and different ids variety', () => {
		expect(lookFor(A)).toEqual(lookFor(A));
		const looks = new Set(
			Array.from({ length: 20 }, (_, i) => JSON.stringify(lookFor(i.toString(16).padStart(16, 'f')))),
		);
		expect(looks.size).toBeGreaterThan(15);
	});
});

describe('client helpers', () => {
	it('backs off slowly for a full room and quickly for errors, capped', () => {
		const mid = () => 0.5;
		expect(retryDelay('full', 0, mid)).toBe(30_000);
		expect(retryDelay('full', 1, mid)).toBe(60_000);
		expect(retryDelay('full', 20, mid)).toBe(300_000);
		expect(retryDelay('error', 0, mid)).toBe(1_000);
		expect(retryDelay('error', 20, mid)).toBe(30_000);
		expect(retryDelay('error', 0, () => 0)).toBe(800);
		expect(retryDelay('error', 0, () => 0.999)).toBeLessThanOrEqual(1_200);
	});

	it('sends only meaningful pose changes', () => {
		const pose = { x: 5, y: 5, h: 0, m: false };
		expect(poseChanged(null, pose)).toBe(true);
		expect(poseChanged(pose, { ...pose, x: 5.01 })).toBe(false);
		expect(poseChanged(pose, { ...pose, x: 5.05 })).toBe(true);
		expect(poseChanged(pose, { ...pose, m: true })).toBe(true);
		expect(poseChanged(pose, { ...pose, h: 0.1 })).toBe(true);
		// Headings either side of ±PI are close, not a full turn apart.
		expect(poseChanged({ ...pose, h: 3.14 }, { ...pose, h: -3.14 })).toBe(false);
	});

	it('clamps poses into the office and normalises headings', () => {
		expect(clampPose({ x: -3, y: 999, h: 7, m: true })).toEqual({ x: 0, y: 22, h: 0.72, m: true });
	});

	it('parses only well-formed room messages', () => {
		expect(parseServerMessage('{"t":"forge","phase":"start"}')).toEqual({ t: 'forge', phase: 'start' });
		expect(parseServerMessage('{"t":"leave","id":"nope"}')).toBeNull();
		expect(parseServerMessage('pong')).toBeNull();
		expect(parseServerMessage(new ArrayBuffer(4))).toBeNull();
		expect(parseServerMessage('{"t":"move","id":"aaaaaaaaaaaaaaaa","x":1,"y":2,"h":0,"m":"yes"}')).toBeNull();
	});
});
