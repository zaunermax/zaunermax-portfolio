/**
 * Where the labels over the office go: pure screen-space helpers for the label layer, so the
 * rules can be tested without a canvas. Everything is in label-layer pixels, y down.
 */

export type Rect = { l: number; t: number; r: number; b: number };

export const overlaps = (a: Rect, b: Rect, pad = 0) =>
	a.l < b.r + pad && a.r > b.l - pad && a.t < b.b + pad && a.b > b.t - pad;

/** A world point through a view-projection matrix to layer pixels; null behind the camera. */
export function project(m: ArrayLike<number>, a: { x: number; y: number; z: number }, w: number, h: number) {
	const cw = m[3] * a.x + m[7] * a.y + m[11] * a.z + m[15];
	if (cw <= 0.2) return null;
	return {
		x: ((m[0] * a.x + m[4] * a.y + m[8] * a.z + m[12]) / cw) * 0.5 * w + w / 2,
		y: (-(m[1] * a.x + m[5] * a.y + m[9] * a.z + m[13]) / cw) * 0.5 * h + h / 2,
	};
}

/** One label that wants a place on screen this frame. */
export type Candidate = {
	key: string;
	/** Higher wins the spot. */
	priority: number;
	rect: Rect;
	/** How far it may move up (px) to get out of the way; bubbles can, signs cannot. */
	nudge?: number;
	/** Shown whatever it overlaps (the line about Max being said); whatever it lands on steps aside. */
	keep?: boolean;
};

/** What became of a label: shown or not, how far it moved up, and when it last had to step aside. */
export type Placement = { shown: boolean; dy: number; blockedAt: number };

/** A label that had to step aside stays hidden this long after its spot frees up, so nothing flickers. */
export const SETTLE_MS = 300;
const STEP = 6;
const GAP = 2;

/**
 * Greedy placement by priority: each label takes its spot unless a more important one already
 * holds it; bubbles first try moving up a little. Whatever stays in the way hides. A label that
 * was shown keeps its offset while that still fits and wins ties, and a hidden one comes back
 * only after its spot has been free for SETTLE_MS (it holds the spot meanwhile), so labels
 * passing each other do not flicker. O(n²), fine for the few dozen labels in view.
 */
export function declutter(
	candidates: readonly Candidate[],
	prev: ReadonlyMap<string, Placement>,
	now: number,
	/** Nothing moves up past this line (the top of the screen). */
	top = 6,
): Map<string, Placement> {
	const order = candidates
		.map((c, i) => ({ c, i, rank: c.priority + (prev.get(c.key)?.shown ? 0.5 : 0) }))
		.sort((a, b) => b.rank - a.rank || a.i - b.i);
	const placed: (Rect & { key: string; keep: boolean })[] = [];
	const out = new Map<string, Placement>();
	for (const { c } of order) {
		const before = prev.get(c.key);
		const nudge = c.nudge ?? 0;
		const offsets = [0];
		for (let dy = STEP; dy <= nudge && c.rect.t - dy >= top; dy += STEP) offsets.push(-dy);
		if (before?.shown && before.dy < 0 && before.dy >= -nudge && c.rect.t + before.dy >= top) offsets.unshift(before.dy);
		let dy: number | null = null;
		for (const o of offsets) {
			const r = { l: c.rect.l, r: c.rect.r, t: c.rect.t + o, b: c.rect.b + o };
			if (!placed.some((p) => overlaps(r, p, GAP))) {
				dy = o;
				break;
			}
		}
		const blockedAt = dy === null && !c.keep ? now : (before?.blockedAt ?? -Infinity);
		let forced = false;
		if (dy === null && c.keep) {
			dy = before?.shown && offsets.includes(before.dy) ? before.dy : 0;
			forced = true;
		}
		if (dy === null) {
			out.set(c.key, { shown: false, dy: 0, blockedAt });
			continue;
		}
		const spot = { key: c.key, keep: !!c.keep, l: c.rect.l, r: c.rect.r, t: c.rect.t + dy, b: c.rect.b + dy };
		// No free spot for a label that must show: whatever already sits there makes way.
		if (forced)
			for (let i = placed.length - 1; i >= 0; i--) {
				const p = placed[i];
				if (p.keep || !overlaps(spot, p, GAP)) continue;
				out.set(p.key, { shown: false, dy: 0, blockedAt: now });
				placed.splice(i, 1);
			}
		placed.push(spot);
		out.set(c.key, { shown: c.keep || now - blockedAt >= SETTLE_MS, dy, blockedAt });
	}
	return out;
}

/**
 * How far to move a label down so it clears the panels along the top of the screen (and the
 * top edge), for the few labels that must not just vanish there. Null when even that does not
 * free it (a panel lower down is in the way).
 */
export function clampBelow(rect: Rect, hud: readonly Rect[], h: number, margin = 6): number | null {
	let down = Math.max(0, margin - rect.t);
	for (let pass = 0; pass < 3; pass++) {
		const moved = { ...rect, t: rect.t + down, b: rect.b + down };
		const top = hud.filter((p) => p.b < h / 2 && overlaps(moved, p));
		if (!top.length) break;
		down = Math.max(down, ...top.map((p) => p.b + margin - rect.t));
	}
	const moved = { ...rect, t: rect.t + down, b: rect.b + down };
	if (moved.b > h || hud.some((p) => overlaps(moved, p))) return null;
	return down;
}
