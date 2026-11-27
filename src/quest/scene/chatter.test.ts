import { describe, expect, it } from 'vitest';
import type { CharacterId } from '../world/catalog';
import type { Actor } from '../world/types';
import {
	AMBIENT_GRACE_MS,
	AMBIENT_REST_MS,
	createChatter,
	OWN_REPEAT_MS,
	PAUSE_MS,
	PERSON_REST_MS,
	readMs,
	TALK_GAP_MS,
	TALK_REPLAY_MS,
	type ChatterLine,
	type ChatterScene,
} from './chatter';

const person = (id: string, x: number, y: number, remark?: string, character: CharacterId = 'intern'): Actor => ({
	id,
	name: id.toUpperCase(),
	character,
	x,
	y,
	heading: 0,
	pose: 'stand',
	elev: 0,
	sit: false,
	room: 0,
	line: `I am ${id}.`,
	wanders: false,
	radius: 0,
	interactive: true,
	appearance: null,
	...(remark ? { remark } : {}),
});

const npcs = [person('a', 2, 2, 'Max owns an ErgoDox.'), person('b', 3, 2), person('c', 20, 2, 'Max loves trains.')];
const talks = [{ a: 'a', b: 'b', lines: ['One.', 'Two.', 'Three.'] }];
const home = (a: Actor) => a;
const scene = (x: number, y: number, more: Partial<ChatterScene> = {}): ChatterScene => ({ player: { x, y }, at: home, ...more });
/** No idle chatter, so only the fresh lines play. */
const never = () => 0.99;
/** Idle chatter whenever it may happen, always picking the first option. */
const always = () => 0;

/** Polls like the app does (4 a second) and collects what is said, with when. */
function run(chatter: ReturnType<typeof createChatter>, from: number, to: number, at: ChatterScene | ((t: number) => ChatterScene)) {
	const said: (ChatterLine & { t: number })[] = [];
	for (let t = from; t < to; t += 250) {
		const line = chatter.tick(t, typeof at === 'function' ? at(t) : at);
		if (line) said.push({ ...line, t });
	}
	return said;
}

describe('createChatter', () => {
	it('plays a nearby talk line by line, one bubble after the other, then pauses', () => {
		const chatter = createChatter({ npcs, talks }, never);
		const said = run(chatter, 0, 60_000, scene(2, 4));
		expect(said.slice(0, 3).map((l) => `${l.actor.id}:${l.text}`)).toEqual(['a:One.', 'b:Two.', 'a:Three.']);
		for (const l of said.slice(0, 3)) expect(l.kind).toBe('about-max');
		// Strictly in turn: each reply waits for the line before to close.
		for (let i = 1; i < 3; i++) expect(said[i].t).toBeGreaterThanOrEqual(said[i - 1].t + said[i - 1].ms + TALK_GAP_MS);
		// Only the last line of the talk stays up while the visitor listens.
		expect(said.slice(0, 3).map((l) => l.hold)).toEqual([false, false, true]);
		// Each reply keeps the line before it in view; every line but the last waits for its reply.
		expect(said.slice(0, 3).map((l) => l.follows)).toEqual([undefined, 'a', 'b']);
		expect(said[0].linger).toBeGreaterThan(TALK_GAP_MS);
		expect(said[2].linger).toBeUndefined();
		// The talk is done: a's remark waits for the pause, then comes once.
		expect(said[3].text).toBe('Max owns an ErgoDox.');
		expect(said[3].kind).toBe('about-max');
		expect(said[3].t).toBeGreaterThanOrEqual(said[2].t + said[2].ms + PAUSE_MS);
		expect(said).toHaveLength(4);
	});

	it('gives lines about Max more time to read than anything else', () => {
		expect(readMs('Hi.', 'about-max')).toBe(4500);
		expect(readMs('x'.repeat(400), 'about-max')).toBe(9000);
		expect(readMs('Hi.', 'own')).toBe(3500);
		expect(readMs('*bonk* Recalculating route… *bonk*', 'ambient')).toBeLessThanOrEqual(3500);
	});

	it('only speaks to a visitor nearby, and a talk they leave starts over later', () => {
		const chatter = createChatter({ npcs, talks }, never);
		expect(chatter.tick(0, scene(10, 10))).toBeNull();
		expect(chatter.tick(0, scene(2, 4))?.text).toBe('One.');
		expect(chatter.tick(100, scene(15, 15))).toBeNull();
		const again = run(chatter, 200, 30_000, scene(2, 4));
		expect(again[0].text).toBe('One.');
	});

	it('starts nothing while a bubble is up, and waits a moment after it closes', () => {
		const chatter = createChatter({ npcs, talks: [] }, never);
		const speaking = scene(20, 3, { speaking: ['someone'] });
		for (let t = 0; t < 20_000; t += 250) expect(chatter.tick(t, speaking)).toBeNull();
		expect(chatter.tick(20_000, scene(20, 3))).toBeNull();
		expect(chatter.tick(20_000 + PAUSE_MS, scene(20, 3))?.text).toBe('Max loves trains.');
	});

	it('holds a talk while another bubble is up, without skipping a line', () => {
		const chatter = createChatter({ npcs, talks }, never);
		expect(chatter.tick(0, scene(2, 4))?.text).toBe('One.');
		// Someone else's bubble stays up well past the first line.
		for (let t = 250; t < 30_000; t += 250) expect(chatter.tick(t, scene(2, 4, { speaking: ['c'] }))).toBeNull();
		const rest = run(chatter, 30_000, 60_000, scene(2, 4));
		expect(rest[0].text).toBe('Two.');
		expect(rest[0].t).toBeGreaterThanOrEqual(30_000 + TALK_GAP_MS - 250);
	});

	it('never spends a talk or a remark the visitor cannot see', () => {
		const chatter = createChatter({ npcs, talks }, never);
		const hidden = scene(2, 4, { visible: (a) => a.id !== 'b' });
		const said = run(chatter, 0, 30_000, hidden);
		// b's reply cannot be read, so the talk stops at the first line and waits.
		expect(said.map((l) => l.text)).toEqual(['One.']);
		const later = run(chatter, 30_000, 60_000, scene(2, 4));
		expect(later.map((l) => l.text).slice(0, 2)).toEqual(['Two.', 'Three.']);

		// A remark nobody could read is not marked heard.
		const remarks = createChatter({ npcs, talks: [] }, never);
		expect(run(remarks, 0, 20_000, scene(20, 3, { visible: () => false }))).toEqual([]);
		expect(remarks.tick(20_000, scene(20, 3))?.text).toBe('Max loves trains.');
	});

	it('says a passing remark once, with a pause before the next', () => {
		const chatter = createChatter({ npcs, talks: [] }, never);
		const first = chatter.tick(0, scene(20, 3));
		expect(first?.text).toBe('Max loves trains.');
		expect(first?.hold).toBe(true);
		expect(chatter.tick(100, scene(2, 3))).toBeNull();
		const next = run(chatter, 250, 30_000, scene(2, 3));
		expect(next.map((l) => l.text)).toEqual(['Max owns an ErgoDox.']);
		expect(next[0].t).toBeGreaterThanOrEqual(first!.ms + PAUSE_MS);
		expect(run(chatter, 30_000, 60_000, scene(20, 3))).toEqual([]);
	});

	it('leaves the remark to whoever the visitor is walking up to', () => {
		const chatter = createChatter({ npcs, talks: [] }, never);
		expect(chatter.tick(0, scene(20, 3, { goal: 'c' }))).toBeNull();
		expect(chatter.tick(0, scene(20, 3))?.text).toBe('Max loves trains.');
	});

	it('replays a talk once it ended long enough ago', () => {
		const chatter = createChatter({ npcs, talks }, never);
		const firsts = run(chatter, 0, TALK_REPLAY_MS * 2.2, scene(2, 4))
			.filter((l) => l.text === 'One.')
			.map((l) => l.t);
		expect(firsts.length).toBe(2);
		expect(firsts[1] - firsts[0]).toBeGreaterThanOrEqual(TALK_REPLAY_MS);
	});

	it('tells an unheard remark before replaying a talk', () => {
		// The talk ends and a's remark is heard while d is away; d comes back as the talk could replay.
		const d = person('d', 3, 4, 'Max owns a keyboard with two halves.');
		const replay = createChatter({ npcs: [...npcs, d], talks }, never);
		run(replay, 0, 60_000, scene(2, 4, { at: (a) => (a.id === 'd' ? { x: 50, y: 50 } : a) }));
		const said = run(replay, TALK_REPLAY_MS + 60_000, TALK_REPLAY_MS + 90_000, scene(2, 4));
		expect(said[0].text).toBe('Max owns a keyboard with two halves.');
	});

	it('keeps chattering once the fresh lines are used up, nobody twice within their rest', () => {
		const chatter = createChatter({ npcs, talks: [] }, always);
		expect(chatter.tick(0, scene(20, 3))?.text).toBe('Max loves trains.');
		const later = run(chatter, 250, TALK_REPLAY_MS * 3, scene(20, 3));
		// c's own line comes round, resting in between; their remark only long after, and once.
		expect(later[0]).toMatchObject({ text: 'I am c.', kind: 'own', hold: false });
		expect(later[0].t).toBeGreaterThanOrEqual(PERSON_REST_MS);
		for (let i = 1; i < later.length; i++) expect(later[i].t - later[i - 1].t).toBeGreaterThanOrEqual(PERSON_REST_MS);
		// The very same own line only every couple of minutes.
		const own = later.filter((l) => l.text === 'I am c.');
		for (let i = 1; i < own.length; i++) expect(own[i].t - own[i - 1].t).toBeGreaterThanOrEqual(OWN_REPEAT_MS);
		const again = later.filter((l) => l.text === 'Max loves trains.');
		expect(again).toHaveLength(1);
		expect(again[0]).toMatchObject({ kind: 'about-max', hold: true });
		expect(again[0].t).toBeGreaterThanOrEqual(TALK_REPLAY_MS);
		// Nobody in reach: nothing.
		expect(chatter.tick(TALK_REPLAY_MS * 10, scene(40, 40))).toBeNull();
	});

	it('replays a talk once a visit at most', () => {
		const chatter = createChatter({ npcs, talks }, never);
		const firsts = run(chatter, 0, TALK_REPLAY_MS * 6, scene(2, 4)).filter((l) => l.text === 'One.');
		expect(firsts).toHaveLength(2);
	});

	it('says nothing old while a talk nobody has heard yet waits nearby', () => {
		// The talk's people are out of view; c could repeat their remark, but the fresh talk waits.
		const near = [person('a', 2, 2), person('b', 3, 2), person('c', 2.5, 4, 'Max loves trains.')];
		const chatter = createChatter({ npcs: near, talks }, always);
		const hidden = scene(2.5, 4.5, { visible: (a) => a.id === 'c' });
		const said = run(chatter, 0, TALK_REPLAY_MS * 2, hidden);
		expect(said.map((l) => l.text)).toEqual(['Max loves trains.']);
		// In view at last: the talk.
		expect(run(chatter, TALK_REPLAY_MS * 2, TALK_REPLAY_MS * 2 + 10_000, scene(2.5, 4.5))[0].text).toBe('One.');
	});

	it('asks the scene about the exact line it is about to say', () => {
		const asked: string[] = [];
		const chatter = createChatter({ npcs, talks }, never);
		run(chatter, 0, 30_000, scene(2, 4, { visible: (_, text) => (asked.push(text), true) }));
		expect(asked).toContain('One.');
		expect(asked).toContain('Two.');
		expect(asked).toContain('Max owns an ErgoDox.');
	});

	it('lets robots and pets chime in rarely, briefly, about once a visit, and never over people', () => {
		const bot = person('bot', 30, 30, undefined, 'robo_vacuum');
		const dog = person('dog', 31, 30, undefined, 'office_dog');
		const chatter = createChatter({ npcs: [...npcs, bot, dog], talks: [] }, always);
		const said = run(chatter, 0, AMBIENT_REST_MS - 1000, scene(30.5, 31));
		expect(said.map((l) => l.actor.id).sort()).toEqual(['bot', 'dog']);
		for (const l of said) {
			expect(l.kind).toBe('ambient');
			expect(l.hold).toBe(false);
			expect(l.ms).toBeLessThanOrEqual(3500);
		}
		// Far apart, even when both could.
		expect(said[1].t - said[0].t).toBeGreaterThanOrEqual(60_000);
		// A robot next to a person with something to say waits its turn, and for their bubble to close.
		const busy = createChatter({ npcs: [person('e', 30, 31, 'Max fixed the build.'), bot], talks: [] }, always);
		const first = busy.tick(0, scene(30.5, 31));
		expect(first?.actor.id).toBe('e');
		const beep = run(busy, 250, 60_000, scene(30.5, 31)).find((l) => l.actor.id === 'bot');
		expect(beep?.t).toBeGreaterThanOrEqual(first!.ms + PAUSE_MS);
	});

	it('lets the talk go on while its own line before is still up, but nobody else’s', () => {
		const chatter = createChatter({ npcs, talks }, never);
		const first = chatter.tick(0, scene(2, 4));
		expect(first?.text).toBe('One.');
		// a's bubble lingers into the reply; that does not hold up b.
		const t = first!.ms + TALK_GAP_MS;
		expect(chatter.tick(t, scene(2, 4, { speaking: ['a'] }))?.text).toBe('Two.');
		// Someone else's bubble does.
		expect(chatter.tick(t + 30_000, scene(2, 4, { speaking: ['c'] }))).toBeNull();
	});

	it('keeps robots and pets quiet until the visitor has heard about Max, or a while has passed', () => {
		const bot = person('bot', 30, 30, undefined, 'robo_vacuum');
		const quiet = createChatter({ npcs: [bot], talks: [] }, always);
		const said = run(quiet, 0, AMBIENT_GRACE_MS * 2, scene(30, 31));
		expect(said).toHaveLength(1);
		expect(said[0].t).toBeGreaterThanOrEqual(AMBIENT_GRACE_MS);
		// After a line about Max, no need to wait.
		const told = createChatter({ npcs: [person('e', 50, 50, 'Max likes trains.'), bot], talks: [] }, always);
		expect(told.tick(0, scene(50, 51))?.kind).toBe('about-max');
		const beep = run(told, 250, AMBIENT_GRACE_MS, scene(30, 31));
		expect(beep.map((l) => l.actor.id)).toEqual(['bot']);
	});

	it('picks the robot line rarely when the roll is ordinary', () => {
		const bot = person('bot', 30, 30, undefined, 'robo_vacuum');
		// A typical idle roll for people is far too high for a robot.
		const chatter = createChatter({ npcs: [bot], talks: [] }, () => 0.05);
		expect(run(chatter, 0, 120_000, scene(30, 31))).toEqual([]);
	});

	it('follows people who walk around', () => {
		const chatter = createChatter({ npcs, talks: [] }, never);
		expect(chatter.tick(0, scene(10, 10, { at: (a) => (a.id === 'c' ? { x: 10, y: 11 } : a) }))?.actor.id).toBe('c');
	});

	it('answers a visitor who talks to someone with their own line, then their remark', () => {
		const chatter = createChatter({ npcs, talks: [] }, never);
		expect(chatter.remarkNext('a')).toBe(false);
		expect(chatter.greet(0, 'a', 'I am a.')).toMatchObject({ text: 'I am a.', kind: 'own' });
		expect(chatter.remarkNext('a')).toBe(true);
		expect(chatter.greet(0, 'a', 'I am a.')).toMatchObject({ text: 'Max owns an ErgoDox.', kind: 'about-max' });
		expect(chatter.remarkNext('a')).toBe(false);
		expect(chatter.greet(0, 'a', 'I am a.').text).toBe('I am a.');
		expect(chatter.greet(0, 'b', 'I am b.').text).toBe('I am b.');
		expect(chatter.remarkNext('b')).toBe(false);
		expect(chatter.greet(0, 'b', 'I am b.').text).toBe('I am b.');
		// a's remark was heard, so walking by stays quiet.
		expect(run(chatter, PAUSE_MS * 4, PAUSE_MS * 8, scene(2, 3))).toEqual([]);
	});

	it('gives a robot the visitor talks to its line as ambient, with time to read it', () => {
		const bot = person('bot', 30, 30, undefined, 'robo_vacuum');
		const chatter = createChatter({ npcs: [bot], talks: [] }, never);
		const reply = chatter.greet(0, 'bot', 'I am bot.');
		expect(reply.kind).toBe('ambient');
		expect(reply.ms).toBe(readMs('I am bot.', 'own'));
	});

	it('never talks over the answer to a greeting, and saves the remark for the second time', () => {
		const chatter = createChatter({ npcs, talks: [] }, never);
		expect(chatter.greet(0, 'c', 'I am c.').text).toBe('I am c.');
		expect(chatter.tick(250, scene(20, 3))).toBeNull();
		expect(chatter.tick(PAUSE_MS * 2, scene(20, 3))).toBeNull();
		expect(chatter.greet(PAUSE_MS * 2, 'c', 'I am c.').text).toBe('Max loves trains.');
	});

	it('drops a talk when the visitor greets one of its people, and skips the walk target', () => {
		// Walking up to b: no talk, a's own remark instead.
		expect(createChatter({ npcs, talks }, never).tick(0, scene(2, 4, { goal: 'b' }))?.text).toBe('Max owns an ErgoDox.');
		const chatter = createChatter({ npcs, talks }, never);
		expect(chatter.tick(0, scene(2, 4))?.text).toBe('One.');
		chatter.greet(100, 'b', 'I am b.');
		expect(run(chatter, 350, 3500, scene(2, 4))).toEqual([]);
	});
});
