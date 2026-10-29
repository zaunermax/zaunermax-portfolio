import { hashString } from '../world/random';

/**
 * Remembers when each entity id first appeared, so new blocks can pop in with a little
 * grow-and-settle while existing ones stay put. Ids come from the compiler and are stable
 * while a brief streams in.
 */

export type Puff = { x: number; y: number; z: number; t0: number; size: number };

export const now = () => performance.now() / 1000;

export class Spawns {
	private born = new Map<string, number>();
	/** When false, unseen ids appear instantly (first load, reduced motion). */
	animate = false;
	puffs: Puff[] = [];

	register(id: string, x: number, y: number, z: number, size = 1, puff = true, delay = 0) {
		if (this.born.has(id)) return;
		if (!this.animate) {
			this.born.set(id, -1e9);
			return;
		}
		// A small, stable stagger so a room fills piece by piece rather than all at once.
		const t0 = now() + delay + (hashString(id) % 450) / 1000;
		this.born.set(id, t0);
		if (puff) this.puffs.push({ x, y, z, t0, size });
	}

	/** 0 → hidden, 1 → settled. Unknown ids are hidden until registered. */
	progress(id: string, t: number, duration = 0.75) {
		const b = this.born.get(id);
		if (b === undefined) return 0;
		return Math.max(0, Math.min(1, (t - b) / duration));
	}

	setAnimate(on: boolean) {
		this.animate = on;
	}

	/** Drops finished dust puffs; returns the live ones. */
	prune(t: number) {
		this.puffs = this.puffs.filter((p) => t - p.t0 < 1);
		return this.puffs;
	}

	clear() {
		this.born.clear();
		this.puffs = [];
	}
}

/** Grow with a soft overshoot, then settle. */
export function popScale(t: number) {
	if (t <= 0) return 0.0001;
	if (t >= 1) return 1;
	const c1 = 2.2;
	const c3 = c1 + 1;
	const u = t - 1;
	return 1 + c3 * u * u * u + c1 * u * u;
}

export function dropOffset(t: number) {
	if (t >= 1) return 0;
	return (1 - t) * (1 - t) * 1.6;
}
