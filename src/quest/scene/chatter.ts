import type { Actor, CompiledWorld } from '../world/types';

/**
 * Office chatter as the visitor walks around: people mention Max as the visitor passes by,
 * and pairs of colleagues chat about him when the visitor comes close. Pure and clock-driven,
 * so the app polls it a few times a second and the tests can drive it.
 *
 * It stays sparse on purpose: one line at a time, a pause after every remark or talk, each
 * remark once per visit and each talk once (a talk the visitor walks away from can start over).
 */

/** The visitor is within this many cells of someone for a passing remark. */
export const REMARK_RANGE = 2.5;
/** A talk starts when the visitor is this close to either of its two people… */
export const TALK_RANGE = 3.5;
/** …and stops when the visitor is this far from both. */
const TALK_LEAVE = 6;
/** Quiet after a remark or talk before the next one, so it never turns into a wall of text. */
export const PAUSE_MS = 7000;

export type ChatterLine = { actor: Actor; text: string; ms: number };

/** Long enough to read: about a second per 17 characters, within 3.5 to 7 seconds. */
export const readMs = (text: string) => Math.min(7000, Math.max(3500, 1600 + text.length * 60));

type Pos = { x: number; y: number };

export function createChatter(world: Pick<CompiledWorld, 'npcs' | 'talks'>) {
	const byId = new Map(world.npcs.map((a) => [a.id, a]));
	const talks = world.talks.filter((t) => byId.has(t.a) && byId.has(t.b));
	const heard = new Set<string>();
	const told = new Set<number>();
	/** Who got their own line last time the visitor talked to them (F), so the next is the remark. */
	const greeted = new Set<string>();
	let talk: { index: number; step: number; next: number } | null = null;
	let quietUntil = 0;

	const line = (actor: Actor, text: string): ChatterLine => ({ actor, text, ms: readMs(text) });

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
			if (!talk && now >= quietUntil) {
				const index = talks.findIndex((_, i) => !told.has(i) && near(i) <= TALK_RANGE);
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
					told.add(talk.index);
					talk = null;
					quietUntil = now + PAUSE_MS;
					return null;
				}
				const said = line(byId.get(talk.step % 2 === 0 ? t.a : t.b)!, t.lines[talk.step]);
				talk.step++;
				// The reply starts as the line before is ending, like people talking.
				talk.next = now + said.ms * 0.8;
				return said;
			}
			if (now < quietUntil) return null;
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
			if (!best?.remark) return null;
			heard.add(best.id);
			quietUntil = now + PAUSE_MS;
			return line(best, best.remark);
		},

		/**
		 * What someone says when the visitor talks to them (F or a tap): their own line, and every
		 * other time what they know about Max, if they know something.
		 */
		greet(id: string, own: string): string {
			const remark = byId.get(id)?.remark;
			if (!remark || !greeted.has(id)) {
				greeted.add(id);
				return own;
			}
			greeted.delete(id);
			heard.add(id);
			return remark;
		},

		/** Talking to them again gets their remark about Max. */
		remarkNext(id: string) {
			return greeted.has(id) && !!byId.get(id)?.remark;
		},
	};
}

export type ChatterDirector = ReturnType<typeof createChatter>;
