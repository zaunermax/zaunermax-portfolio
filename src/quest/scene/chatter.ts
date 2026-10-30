import type { Actor, CompiledWorld } from '../world/types';

/**
 * Office chatter as the visitor walks around: people mention Max as the visitor passes by,
 * and pairs of colleagues chat about him when the visitor comes close. Pure and clock-driven,
 * so the app polls it a few times a second and the tests can drive it.
 *
 * Fresh things come first: talks nobody has heard yet, then remarks about Max. After that the
 * office keeps chattering: talks play again a while after they ended, and people the visitor
 * passes now and then say their own line or their remark again. One line at a time, with a
 * pause after each, and nobody speaks twice within PERSON_REST_MS.
 */

/** The visitor is within this many cells of someone for a passing remark. */
export const REMARK_RANGE = 2.5;
/** A talk starts when the visitor is this close to either of its two people… */
export const TALK_RANGE = 3.5;
/** …and stops when the visitor is this far from both. */
const TALK_LEAVE = 6;
/** Quiet after a remark or talk before the next one, so it never turns into a wall of text. */
export const PAUSE_MS = 7000;
/** A talk can play again this long after it last ended. */
export const TALK_REPLAY_MS = 90_000;
/** Someone who just said something waits this long before chattering at the visitor again. */
export const PERSON_REST_MS = 30_000;
/** Once the fresh lines are used up, the chance per poll (about 4 a second) that someone speaks. */
const IDLE_CHANCE = 0.1;

/** A remark or greeting stays up while the visitor stands this close to whoever said it. */
export const HOLD_RANGE = 3;

export type ChatterLine = { actor: Actor; text: string; ms: number; kind: 'remark' | 'talk' };

/** Long enough to read: about a second per 17 characters, within 3.5 to 7 seconds. */
export const readMs = (text: string) => Math.min(7000, Math.max(3500, 1600 + text.length * 60));

type Pos = { x: number; y: number };

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
	let quietUntil = 0;

	const line = (actor: Actor, text: string, kind: ChatterLine['kind'], now: number): ChatterLine => {
		spoke.set(actor.id, { at: now, text });
		return { actor, text, ms: readMs(text), kind };
	};
	const rested = (id: string, now: number) => now - (spoke.get(id)?.at ?? -Infinity) >= PERSON_REST_MS;

	return {
		/**
		 * What to say now, if anything; call it often while the visitor can see the office.
		 * `goal` is whoever the visitor is walking up to: they greet the visitor on arrival instead.
		 */
		tick(now: number, player: Pos, at: (actor: Actor) => Pos, goal?: string): ChatterLine | null {
			const dist = (a: Actor) => {
				const p = at(a);
				return Math.hypot(p.x - player.x, p.y - player.y);
			};
			const near = (index: number) => {
				const t = talks[index];
				return Math.min(dist(byId.get(t.a)!), dist(byId.get(t.b)!));
			};
			/** The closest person in reach with a remark the visitor has not heard yet. */
			const unheard = () => {
				let best: Actor | null = null;
				let bestDist = REMARK_RANGE;
				for (const a of world.npcs) {
					if (!a.remark || heard.has(a.id) || a.id === goal) continue;
					const d = dist(a);
					if (d <= bestDist) {
						best = a;
						bestDist = d;
					}
				}
				return best;
			};
			if (!talk && now >= quietUntil) {
				const ready = (i: number) => {
					const t = talks[i];
					return t.a !== goal && t.b !== goal && near(i) <= TALK_RANGE;
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
				if (near(talk.index) > TALK_LEAVE) {
					talk = null;
					quietUntil = now + PAUSE_MS / 2;
					return null;
				}
				if (now < talk.next) return null;
				if (talk.step >= t.lines.length) {
					told.set(talk.index, now);
					talk = null;
					quietUntil = now + PAUSE_MS;
					return null;
				}
				const said = line(byId.get(talk.step % 2 === 0 ? t.a : t.b)!, t.lines[talk.step], 'talk', now);
				talk.step++;
				// The reply starts as the line before is ending, like people talking.
				talk.next = now + said.ms * 0.8;
				return said;
			}
			if (now < quietUntil) return null;
			const best = unheard();
			if (best?.remark) {
				heard.add(best.id);
				quietUntil = now + PAUSE_MS;
				return line(best, best.remark, 'remark', now);
			}
			// Nothing fresh nearby: now and then someone in reach chatters anyway.
			if (random() >= IDLE_CHANCE) return null;
			const idle = world.npcs.filter(
				(a) => (a.interactive || a.remark) && a.id !== goal && rested(a.id, now) && dist(a) <= REMARK_RANGE,
			);
			if (!idle.length) return null;
			const who = idle[Math.floor(random() * idle.length)];
			const said = [who.line, who.remark ?? ''].filter(Boolean);
			// Whatever they did not say last time, if they have a choice.
			const options = said.length > 1 ? said.filter((t) => t !== spoke.get(who.id)?.text) : said;
			if (!options.length) return null;
			quietUntil = now + PAUSE_MS;
			return line(who, options[Math.floor(random() * options.length)], 'remark', now);
		},

		/**
		 * What someone says when the visitor talks to them (F or a tap): their own line, and every
		 * other time what they know about Max, if they know something. Their remark is saved for
		 * that second time, and nothing ambient talks over the answer.
		 */
		greet(now: number, id: string, own: string): string {
			const remark = byId.get(id)?.remark;
			const text = !remark || !greeted.has(id) ? own : remark;
			if (text === own) greeted.add(id);
			else greeted.delete(id);
			heard.add(id);
			spoke.set(id, { at: now, text });
			if (talk && (talks[talk.index].a === id || talks[talk.index].b === id)) talk = null;
			quietUntil = Math.max(quietUntil, now + readMs(text));
			return text;
		},

		/** Talking to them again gets their remark about Max. */
		remarkNext(id: string) {
			return greeted.has(id) && !!byId.get(id)?.remark;
		},
	};
}

export type ChatterDirector = ReturnType<typeof createChatter>;
