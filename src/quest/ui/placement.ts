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

/**
 * How a label draws around its anchor point, measured from the DOM once: its size, where its
 * top sits relative to the point (offsetTop: negative above it), and what hangs off it (Max's
 * "tap to talk" tag above, a bubble's tail or Max's pointer below).
 */
export type LabelBox = { w: number; h: number; top: number; above?: number; below?: number };

/** The screen box a label covers when its anchor projects to x, y and it slides dx sideways. */
export function labelRect(x: number, y: number, dx: number, box: LabelBox): Rect {
	const l = x - box.w / 2 + dx;
	return { l, r: l + box.w, t: y + box.top - (box.above ?? 0), b: y + box.top + box.h + (box.below ?? 0) };
}

/** One label that wants a place on screen this frame. */
export type Candidate = {
	key: string;
	/** Higher wins the spot. */
	priority: number;
	rect: Rect;
	/** How far it may move up (px) to get out of the way; bubbles can, signs cannot. */
	nudge?: number;
	/** How far it may slide sideways (px) either way; a bubble's tail keeps pointing at its owner. */
	slide?: number;
	/** Shown whatever it overlaps (the line about Max being said); whatever it lands on steps aside. */
	keep?: boolean;
};

/** What became of a label: shown or not, how far it moved, and when it last had to step aside. */
export type Placement = { shown: boolean; dx: number; dy: number; blockedAt: number };

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
	/** …or sideways past these (the screen's width). */
	width = Infinity,
): Map<string, Placement> {
	const order = candidates
		.map((c, i) => ({ c, i, rank: c.priority + (prev.get(c.key)?.shown ? 0.5 : 0) }))
		.sort((a, b) => b.rank - a.rank || a.i - b.i);
	const placed: (Rect & { c: Candidate })[] = [];
	const out = new Map<string, Placement>();
	const at = (c: Candidate, o: Offset) => ({ c, l: c.rect.l + o.dx, r: c.rect.r + o.dx, t: c.rect.t + o.dy, b: c.rect.b + o.dy });
	/** The smallest move (up a little first, then sideways too) that frees the label, if any. */
	const find = (c: Candidate, offsets: Offset[]) => offsets.find((o) => !placed.some((p) => overlaps(at(c, o), p, GAP))) ?? null;
	for (const { c } of order) {
		const before = prev.get(c.key);
		const offsets = offsetsFor(c, top, width);
		const was = before?.shown ? offsets.find((o) => o.dx === before.dx && o.dy === before.dy) : undefined;
		if (was) offsets.unshift(was);
		let spotAt = find(c, offsets);
		const blockedAt = spotAt === null && !c.keep ? now : (before?.blockedAt ?? -Infinity);
		const forced = spotAt === null && !!c.keep;
		if (forced) spotAt = was ?? { dx: 0, dy: 0 };
		if (spotAt === null) {
			out.set(c.key, { shown: false, dx: 0, dy: 0, blockedAt });
			continue;
		}
		const spot = at(c, spotAt);
		// No free spot for a label that must show: whatever already sits there moves if it can,
		// or makes way.
		const evicted = forced ? placed.filter((p) => !p.c.keep && overlaps(spot, p, GAP)) : [];
		for (const p of evicted) placed.splice(placed.indexOf(p), 1);
		placed.push(spot);
		out.set(c.key, { shown: c.keep || now - blockedAt >= SETTLE_MS, ...spotAt, blockedAt });
		for (const { c: e } of evicted) {
			const moved = find(e, offsetsFor(e, top, width));
			if (moved) placed.push(at(e, moved));
			const shownBefore = out.get(e.key)?.shown ?? false;
			out.set(e.key, moved ? { shown: shownBefore, ...moved, blockedAt: out.get(e.key)!.blockedAt } : { shown: false, dx: 0, dy: 0, blockedAt: now });
		}
	}
	return out;
}

type Offset = { dx: number; dy: number };

/** Where a label may go: up to `nudge` up and `slide` either way, smallest moves first, on screen. */
function offsetsFor(c: Candidate, top: number, width: number): Offset[] {
	const nudge = c.nudge ?? 0;
	const slide = c.slide ?? 0;
	const offsets: Offset[] = [];
	for (let dy = 0; dy <= nudge && c.rect.t - dy >= top; dy += STEP)
		for (let dx = 0; dx <= slide; dx += STEP * 2)
			for (const sx of dx ? [dx, -dx] : [0])
				if (c.rect.l + sx >= 0 && c.rect.r + sx <= width) offsets.push({ dx: sx, dy: -dy });
	offsets.sort((a, b) => Math.abs(a.dx) + Math.abs(a.dy) * 1.5 - (Math.abs(b.dx) + Math.abs(b.dy) * 1.5));
	if (!offsets.length) offsets.push({ dx: 0, dy: 0 });
	return offsets;
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
