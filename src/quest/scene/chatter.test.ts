import { describe, expect, it } from 'vitest';
import type { Actor } from '../world/types';
import { createChatter, PAUSE_MS } from './chatter';

const person = (id: string, x: number, y: number, remark?: string): Actor => ({
	id,
	name: id.toUpperCase(),
	character: 'intern',
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

describe('createChatter', () => {
	it('plays a nearby talk line by line, alternating speakers, then pauses', () => {
		const chatter = createChatter({ npcs, talks });
		const at = { x: 2, y: 4 };
		const said: string[] = [];
		let t = 0;
		for (; t < 60_000 && said.length < 3; t += 250) {
			const line = chatter.tick(t, at, home);
			if (line) said.push(`${line.actor.id}:${line.text}`);
			if (line) expect(line.kind).toBe('talk');
		}
		expect(said).toEqual(['a:One.', 'b:Two.', 'a:Three.']);
		// The talk is done: a's remark waits for the pause, then comes once.
		let next = null;
		for (t += 250; !next && t < 60_000; t += 250) next = chatter.tick(t, at, home);
		expect(next?.text).toBe('Max owns an ErgoDox.');
		expect(next?.kind).toBe('remark');
		for (let k = 0; k < 200; k++, t += 250) expect(chatter.tick(t, at, home)).toBeNull();
	});

	it('only speaks to a visitor nearby, and a talk they leave starts over later', () => {
		const chatter = createChatter({ npcs, talks });
		expect(chatter.tick(0, { x: 10, y: 10 }, home)).toBeNull();
		expect(chatter.tick(0, { x: 2, y: 4 }, home)?.text).toBe('One.');
		expect(chatter.tick(100, { x: 15, y: 15 }, home)).toBeNull();
		expect(chatter.tick(PAUSE_MS, { x: 2, y: 4 }, home)?.text).toBe('One.');
	});

	it('says a passing remark once, with a pause before the next', () => {
		const chatter = createChatter({ npcs, talks: [] });
		expect(chatter.tick(0, { x: 20, y: 3 }, home)?.text).toBe('Max loves trains.');
		expect(chatter.tick(100, { x: 2, y: 3 }, home)).toBeNull();
		expect(chatter.tick(PAUSE_MS, { x: 2, y: 3 }, home)?.text).toBe('Max owns an ErgoDox.');
		expect(chatter.tick(PAUSE_MS * 3, { x: 20, y: 3 }, home)).toBeNull();
	});

	it('leaves the remark to whoever the visitor is walking up to', () => {
		const chatter = createChatter({ npcs, talks: [] });
		expect(chatter.tick(0, { x: 20, y: 3 }, home, 'c')).toBeNull();
		expect(chatter.tick(0, { x: 20, y: 3 }, home)?.text).toBe('Max loves trains.');
	});

	it('follows people who walk around', () => {
		const chatter = createChatter({ npcs, talks: [] });
		expect(chatter.tick(0, { x: 10, y: 10 }, (a) => (a.id === 'c' ? { x: 10, y: 11 } : a))?.actor.id).toBe('c');
	});

	it('answers a visitor who talks to someone with their own line, then their remark', () => {
		const chatter = createChatter({ npcs, talks: [] });
		expect(chatter.remarkNext('a')).toBe(false);
		expect(chatter.greet(0, 'a', 'I am a.')).toBe('I am a.');
		expect(chatter.remarkNext('a')).toBe(true);
		expect(chatter.greet(0, 'a', 'I am a.')).toBe('Max owns an ErgoDox.');
		expect(chatter.remarkNext('a')).toBe(false);
		expect(chatter.greet(0, 'a', 'I am a.')).toBe('I am a.');
		expect(chatter.greet(0, 'b', 'I am b.')).toBe('I am b.');
		expect(chatter.remarkNext('b')).toBe(false);
		expect(chatter.greet(0, 'b', 'I am b.')).toBe('I am b.');
		// a's remark was heard, so walking by stays quiet.
		expect(chatter.tick(PAUSE_MS * 2, { x: 2, y: 3 }, home)).toBeNull();
	});

	it('never talks over the answer to a greeting, and saves the remark for the second time', () => {
		const chatter = createChatter({ npcs, talks: [] });
		expect(chatter.greet(0, 'c', 'I am c.')).toBe('I am c.');
		expect(chatter.tick(250, { x: 20, y: 3 }, home)).toBeNull();
		expect(chatter.tick(PAUSE_MS * 2, { x: 20, y: 3 }, home)).toBeNull();
		expect(chatter.greet(PAUSE_MS * 2, 'c', 'I am c.')).toBe('Max loves trains.');
	});

	it('drops a talk when the visitor greets one of its people, and skips the walk target', () => {
		// Walking up to b: no talk, a's own remark instead.
		expect(createChatter({ npcs, talks }).tick(0, { x: 2, y: 4 }, home, 'b')?.text).toBe('Max owns an ErgoDox.');
		const chatter = createChatter({ npcs, talks });
		expect(chatter.tick(0, { x: 2, y: 4 }, home)?.text).toBe('One.');
		chatter.greet(100, 'b', 'I am b.');
		let said = null;
		for (let t = 350; !said && t < 3500; t += 250) said = chatter.tick(t, { x: 2, y: 4 }, home);
		expect(said).toBeNull();
	});
});
