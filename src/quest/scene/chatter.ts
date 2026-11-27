import { CHARACTERS } from '../world/catalog';
import type { Actor, CompiledWorld } from '../world/types';

/**
 * Office chatter as the visitor walks around: people mention Max as the visitor passes by,
 * and pairs of colleagues chat about him when the visitor comes close. Pure and clock-driven,
 * so the app polls it a few times a second and the tests can drive it.
 *
 * Lines come in three kinds, most important first: what people know about Max (talks and
 * remarks), people's own lines, and ambient flavour from the robots and pets. Fresh things about
 * Max come first: talks nobody has heard yet, then remarks. After that the office keeps
 * chattering: talks play again a while after they ended, people the visitor passes now and then
 * say their own line or their remark again, and once in a long while a robot or a pet chimes in.
 *
 * One bubble at a time: nothing starts while another bubble is up, a talk's next line waits for
 * the one before to close, and nothing is said where the visitor could not read it.
 */

/** The visitor is within this many cells of someone for a passing remark. */
export const REMARK_RANGE = 2.5;
/** A talk starts when the visitor is this close to either of its two people… */
export const TALK_RANGE = 3.5;
/** …and stops when the visitor is this far from both. */
const TALK_LEAVE = 6;
/** Quiet after a bubble closes before anything new starts, so it never turns into a wall of text. */
export const PAUSE_MS = 4000;
/** In a talk, the reply starts this long after the line before has closed. */
export const TALK_GAP_MS = 700;
/** A talk can play again this long after it last ended. */
export const TALK_REPLAY_MS = 90_000;
/** Someone who just said something waits this long before chattering at the visitor again. */
export const PERSON_REST_MS = 30_000;
/** Once the fresh lines are used up, the chance per poll (about 4 a second) that someone speaks. */
const IDLE_CHANCE = 0.1;
/** The chance per poll that a robot or pet nearby chimes in, when no person has anything to say. */
const AMBIENT_CHANCE = 0.012;
/** At least this long between two ambient lines, whoever says them. */
export const AMBIENT_GAP_MS = 60_000;
/** A robot or pet speaks up on its own at most once in this long: in practice once per visit. */
export const AMBIENT_REST_MS = 10 * 60_000;

/** A line about Max or a greeting stays up while the visitor stands this close to whoever said it. */
export const HOLD_RANGE = 3;

/**
 * - `about-max`: a talk or remark about Max, the content of the office.
 * - `own`: a person's own line, colour.
 * - `ambient`: a robot or pet, flavour.
 */
export type ChatterKind = 'about-max' | 'own' | 'ambient';

export type ChatterLine = {
	actor: Actor;
	text: string;
	ms: number;
	kind: ChatterKind;
	/** Keep the bubble open while the visitor stays near (things about Max, greetings). */
	hold: boolean;
};

/** What the chatter needs to know about the scene on each poll. */
export type ChatterScene = {
	player: Pos;
	/** Where someone is now (people walk around). */
	at: (actor: Actor) => Pos;
	/** Whoever the visitor is walking up to: they greet the visitor on arrival instead. */
	goal?: string;
	/** Whether a bubble over this actor could be read now (on screen, not under the HUD, close enough). */
	visible?: (actor: Actor) => boolean;
	/** Some bubble is up right now (including one held open). */
	speaking?: boolean;
};

/** People have a human rig; the robots, pets, the drone and the parrot do not. */
export const isPerson = (actor: Pick<Actor, 'character'>) => CHARACTERS[actor.character] === 'human';

/** Which kind a line someone says is. */
export function kindOf(actor: Actor, text: string): ChatterKind {
	if (!isPerson(actor)) return 'ambient';
	return actor.remark && text === actor.remark ? 'about-max' : 'own';
}

const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));

/**
 * Long enough to read: about a second per 15 characters for lines about Max (4.5 to 9 seconds),
 * a little quicker for people's own lines (3.5 to 7), and a short moment for ambient flavour.
 */
export function readMs(text: string, kind: ChatterKind = 'own') {
	if (kind === 'about-max') return clamp(4500, 9000, 2000 + text.length * 65);
	if (kind === 'ambient') return clamp(3000, 3500, 1800 + text.length * 40);
	return clamp(3500, 7000, 1600 + text.length * 60);
}

type Pos = { x: number; y: number };

const always = () => true;

export function createChatter(world: Pick<CompiledWorld, 'npcs' | 'talks'>, random: () => number = Math.random) {
	const byId = new Map(world.npcs.map((a) => [a.id, a]));
	const talks = world.talks.filter((t) => byId.has(t.a) && byId.has(t.b));
	const heard = new Set<string>();
	/** When each talk last ended. */
	const told = new Map<number, number>();
	/** When each person last said something, and what. */
	const spoke = new Map<string, { at: number; text: string }>();
	/** Who got their own line last time the visitor talked to them (F), so the next is the remark. */
	const greeted = new Set<string>();
	let talk: { index: number; step: number; next: number } | null = null;
	/** Nothing new starts before this. */
	let freeAt = 0;
	/** When the last ambient line was said. */
	let ambientAt = -Infinity;

	const line = (actor: Actor, text: string, kind: ChatterKind, now: number, hold: boolean): ChatterLine => {
		spoke.set(actor.id, { at: now, text });
		const ms = readMs(text, kind);
		freeAt = now + ms + PAUSE_MS;
		return { actor, text, ms, kind, hold };
	};
	const rested = (id: string, now: number, rest: number) => now - (spoke.get(id)?.at ?? -Infinity) >= rest;

	return {
		/** What to say now, if anything; call it often while the visitor can see the office. */
		tick(now: number, scene: ChatterScene): ChatterLine | null {
			const { player, at, goal } = scene;
			const visible = scene.visible ?? always;
			const dist = (a: Actor) => {
				const p = at(a);
				return Math.hypot(p.x - player.x, p.y - player.y);
			};
			const near = (index: number) => {
				const t = talks[index];
				return Math.min(dist(byId.get(t.a)!), dist(byId.get(t.b)!));
			};
			// Walking away ends a talk at once, even mid-line.
			if (talk && near(talk.index) > TALK_LEAVE) {
				talk = null;
				freeAt = Math.max(freeAt, now + PAUSE_MS / 2);
			}
			// Something is on screen: wait until it has closed, and a moment longer.
			if (scene.speaking) {
				freeAt = Math.max(freeAt, now + PAUSE_MS);
				if (talk) talk.next = Math.max(talk.next, now + TALK_GAP_MS);
				return null;
			}
			/** The closest person in reach, in view, with a remark the visitor has not heard yet. */
			const unheard = () => {
				let best: Actor | null = null;
				let bestDist = REMARK_RANGE;
				for (const a of world.npcs) {
					if (!a.remark || heard.has(a.id) || a.id === goal || !isPerson(a)) continue;
					const d = dist(a);
					if (d <= bestDist && visible(a)) {
						best = a;
						bestDist = d;
					}
				}
				return best;
			};
			if (!talk && now >= freeAt) {
				const ready = (i: number) => {
					const t = talks[i];
					return t.a !== goal && t.b !== goal && near(i) <= TALK_RANGE && visible(byId.get(t.a)!);
				};
				// A talk nobody has heard yet first, else (after any unheard remark) one that ended
				// long enough ago.
				let index = talks.findIndex((_, i) => !told.has(i) && ready(i));
				if (index < 0 && !unheard())
					index = talks.findIndex((_, i) => now - (told.get(i) ?? now) >= TALK_REPLAY_MS && ready(i));
				if (index >= 0) talk = { index, step: 0, next: now };
			}
			if (talk) {
				const t = talks[talk.index];
				if (now < talk.next) return null;
				if (talk.step >= t.lines.length) {
					told.set(talk.index, now);
					talk = null;
					return null;
				}
				const speaker = byId.get(talk.step % 2 === 0 ? t.a : t.b)!;
				// Nobody could read it now (off screen, under a panel): the talk waits, unspent.
				if (!visible(speaker)) return null;
				const last = talk.step === t.lines.length - 1;
				const said = line(speaker, t.lines[talk.step], 'about-max', now, last);
				talk.step++;
				// One after the other: the reply waits for this bubble to close.
				talk.next = now + said.ms + TALK_GAP_MS;
				return said;
			}
			if (now < freeAt) return null;
			const best = unheard();
			if (best?.remark) {
				heard.add(best.id);
				return line(best, best.remark, 'about-max', now, true);
			}
			// Nothing fresh nearby: now and then someone in reach chatters anyway, people first.
			const roll = random();
			if (roll >= IDLE_CHANCE) return null;
			const idle = world.npcs.filter(
				(a) =>
					isPerson(a) &&
					(a.interactive || a.remark) &&
					a.id !== goal &&
					rested(a.id, now, PERSON_REST_MS) &&
					dist(a) <= REMARK_RANGE &&
					visible(a),
			);
			if (idle.length) {
				const who = idle[Math.floor(random() * idle.length)];
				const said = [who.line, who.remark ?? ''].filter(Boolean);
				// Whatever they did not say last time, if they have a choice.
				const options = said.length > 1 ? said.filter((t) => t !== spoke.get(who.id)?.text) : said;
				if (!options.length) return null;
				const text = options[Math.floor(random() * options.length)];
				const kind = kindOf(who, text);
				return line(who, text, kind, now, kind === 'about-max');
			}
			// Robots and pets: rarely, briefly, and each about once a visit.
			if (roll >= AMBIENT_CHANCE || now - ambientAt < AMBIENT_GAP_MS) return null;
			const critters = world.npcs.filter(
				(a) =>
					!isPerson(a) &&
					a.interactive &&
					a.line &&
					a.id !== goal &&
					rested(a.id, now, AMBIENT_REST_MS) &&
					dist(a) <= REMARK_RANGE &&
					visible(a),
			);
			if (!critters.length) return null;
			const who = critters[Math.floor(random() * critters.length)];
			ambientAt = now;
			return line(who, who.line, 'ambient', now, false);
		},

		/**
		 * What someone says when the visitor talks to them (F or a tap): their own line, and every
		 * other time what they know about Max, if they know something. Their remark is saved for
		 * that second time, and nothing ambient talks over the answer.
		 */
		greet(now: number, id: string, own: string): { text: string; ms: number; kind: ChatterKind } {
			const actor = byId.get(id);
			const remark = actor?.remark;
			const text = !remark || !greeted.has(id) ? own : remark;
			if (text === own) greeted.add(id);
			else greeted.delete(id);
			heard.add(id);
			spoke.set(id, { at: now, text });
			if (talk && (talks[talk.index].a === id || talks[talk.index].b === id)) talk = null;
			const kind = actor ? kindOf(actor, text) : 'own';
			// The visitor asked: even a robot gets a person's reading time.
			const ms = readMs(text, kind === 'ambient' ? 'own' : kind);
			freeAt = Math.max(freeAt, now + ms + PAUSE_MS);
			return { text, ms, kind };
		},

		/** Talking to them again gets their remark about Max. */
		remarkNext(id: string) {
			return greeted.has(id) && !!byId.get(id)?.remark;
		},
	};
}

export type ChatterDirector = ReturnType<typeof createChatter>;
