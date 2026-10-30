import { randomLook, type Appearance } from '../world/appearance';
import { SKIN } from '../world/character-parts';
import { hashString } from '../world/random';
import { ROOM_CAP, type Pose, type ServerMessage } from './protocol';

/**
 * Who else is in the office, as the room last reported them. The scene reads targets every frame
 * and smooths towards them; React only re-renders when someone arrives or leaves.
 */

export type Visitor = Pose & {
	id: string;
	/** When this visitor last waved, in `now()` seconds (scene/spawn.ts). */
	waveAt: number;
};

type Listener = () => void;

const EMPTY: readonly string[] = [];

/** Fixed seed so a public id always gets the same look, on every screen. */
const LOOK_SEED = 0x5157;

/** A visitor's look: randomLook keyed by their public id, with a skin tone from the same id. */
export function lookFor(id: string): Appearance {
	return { ...randomLook(LOOK_SEED, id), skin: hashString(`skin:${id}`) % SKIN.length };
}

/** Label anchor id of a remote visitor. */
export const visitorAnchor = (id: string) => `visitor-${id}`;

export class Presence {
	/** This tab's own public id while connected. */
	you: string | null = null;
	private visitors = new Map<string, Visitor>();
	private ids: readonly string[] = EMPTY;
	private listeners = new Set<Listener>();

	/** Applies a room message; `t` is the current `now()` time in seconds. */
	apply(message: ServerMessage, t: number) {
		switch (message.t) {
			case 'welcome':
				this.you = message.you;
				this.visitors.clear();
				for (const p of message.players) this.upsert(p, t);
				this.changed();
				return;
			case 'move': {
				const known = this.visitors.has(message.id);
				this.upsert(message, t);
				if (!known && this.visitors.has(message.id)) this.changed();
				return;
			}
			case 'leave':
				if (this.visitors.delete(message.id)) this.changed();
				return;
			case 'emote': {
				const v = this.visitors.get(message.id);
				if (v && message.e === 'wave') v.waveAt = t;
				return;
			}
		}
	}

	/** Forgets everyone (disconnected). */
	reset() {
		this.you = null;
		if (!this.visitors.size) return;
		this.visitors.clear();
		this.changed();
	}

	get(id: string) {
		return this.visitors.get(id);
	}

	getIds = () => this.ids;
	subscribe = (l: Listener) => {
		this.listeners.add(l);
		return () => {
			this.listeners.delete(l);
		};
	};

	private upsert(p: Pose & { id: string }, t: number) {
		if (p.id === this.you) return;
		const v = this.visitors.get(p.id);
		if (v) {
			v.x = p.x;
			v.y = p.y;
			v.h = p.h;
			v.m = p.m;
		} else if (this.visitors.size < ROOM_CAP) {
			this.visitors.set(p.id, { id: p.id, x: p.x, y: p.y, h: p.h, m: p.m, waveAt: t - 10 });
		}
	}

	private changed() {
		this.ids = this.visitors.size ? [...this.visitors.keys()] : EMPTY;
		for (const l of this.listeners) l();
	}
}
