/*
 * The sun's shadow map is cached: it is redrawn when something that casts a shadow moves (the
 * walls easing down, furniture popping in, the visitor walking, Max swivelling, a new light) and
 * otherwise only a dozen times a second, so idle bobbing and typing hands still show.
 */

/** Seconds between redraws while nothing marks the map dirty. */
export const SHADOW_IDLE_INTERVAL = 1 / 12;

export class ShadowSchedule {
	private dirty = true;
	private last = Number.NEGATIVE_INFINITY;

	/** Something that casts a shadow moved: redraw on the next frame. */
	mark() {
		this.dirty = true;
	}

	/** Whether to redraw the shadow map in the frame rendered at `t` (seconds). */
	due(t: number) {
		// A clock that went backwards (a fresh canvas) counts as due.
		// The slack keeps a 60 fps clock on every fifth frame despite rounding.
		if (!this.dirty && t - this.last < SHADOW_IDLE_INTERVAL - 1e-4 && t >= this.last) return false;
		this.dirty = false;
		this.last = t;
		return true;
	}
}

export const shadowSchedule = new ShadowSchedule();

export function markShadows() {
	shadowSchedule.mark();
}
