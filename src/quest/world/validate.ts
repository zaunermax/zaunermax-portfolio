import { ASSETS } from './catalog';
import { cellIndex, FACE, hIndex, vIndex } from './furnish';
import { isOpenCell, reachable } from './compile';
import { landmarkIds } from './schema';
import { EDGE, type CompiledWorld } from './types';

/**
 * Invariants of a compiled office. The generator refuses to persist a world that breaks one,
 * and the tests run them over many seeds. Returns human-readable problems, [] when all is well.
 */
export function checkWorld(world: CompiledWorld): string[] {
	const problems: string[] = [];
	const { width: W, height: H } = world;

	// No two blocking pieces share a cell, and everything stays inside its own room.
	const owner = new Map<number, string>();
	for (const f of world.furniture) {
		for (let y = f.y; y < f.y + f.d; y++)
			for (let x = f.x; x < f.x + f.w; x++) {
				if (x < 0 || y < 0 || x >= W || y >= H) problems.push(`${f.id} is off the grid`);
				else if (world.roomAt[cellIndex(x, y)] !== f.room) problems.push(`${f.id} leaves its room`);
				if (!f.blocks) continue;
				const i = cellIndex(x, y);
				const other = owner.get(i);
				if (other) problems.push(`${f.id} overlaps ${other}`);
				owner.set(i, f.id);
			}
	}

	const spawn = world.spawn;
	if (!isOpenCell(world, spawn.x, spawn.y)) problems.push('spawn is blocked');
	const reach = reachable(world, spawn);
	const reached = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && reach[cellIndex(x, y)] === 1;

	if (!world.partial)
		for (const id of landmarkIds) {
			const l = world.landmark[id];
			if (!l) problems.push(`landmark ${id} is missing`);
			else if (!reached(l.interact.x, l.interact.y)) problems.push(`landmark ${id} is unreachable`);
		}

	// Every doorway is open on both sides and reachable.
	const doors = (array: Uint8Array, axis: 'h' | 'v') =>
		array.forEach((kind, i) => {
			if (kind !== EDGE.door && kind !== EDGE.glassdoor) return;
			const [x, y] = axis === 'h' ? [i % W, Math.floor(i / W)] : [i % (W + 1), Math.floor(i / (W + 1))];
			const [ax, ay] = axis === 'h' ? [x, y - 1] : [x - 1, y];
			if (!reached(x, y) || !reached(ax, ay)) problems.push(`door ${axis}${x},${y} is blocked or unreachable`);
		});
	doors(world.hEdge, 'h');
	doors(world.vEdge, 'v');

	// Interactive people can be walked up to.
	for (const n of world.npcs) {
		const cx = Math.floor(n.x);
		const cy = Math.floor(n.y);
		const near = [{ x: 0, y: 0 }, ...FACE].some((f) => reached(cx + f.x, cy + f.y));
		if (n.interactive && !near) problems.push(`${n.id} cannot be reached`);
	}

	// Chairs face something to sit at, when they are part of a desk or table group.
	const at = new Map<number, string>();
	for (const f of world.furniture)
		for (let y = f.y; y < f.y + f.d; y++) for (let x = f.x; x < f.x + f.w; x++) at.set(cellIndex(x, y), f.asset);
	for (const f of world.furniture) {
		if (f.asset !== 'office_chair') continue;
		const face = FACE[f.rot];
		const target = at.get(cellIndex(f.x + face.x, f.y + face.y)) ?? '';
		if (!/^(desk_|meeting_)/.test(target)) problems.push(`${f.id} faces ${target || 'nothing'}`);
	}

	// Walls sit only on room boundaries.
	for (let y = 1; y < H; y++)
		for (let x = 0; x < W; x++) {
			const kind = world.hEdge[hIndex(x, y)];
			const same = world.roomAt[cellIndex(x, y - 1)] === world.roomAt[cellIndex(x, y)];
			if (same && kind !== EDGE.none && kind !== EDGE.glass) problems.push(`stray wall h${x},${y}`);
		}
	for (let y = 0; y < H; y++)
		for (let x = 1; x < W; x++) {
			const kind = world.vEdge[vIndex(x, y)];
			const same = world.roomAt[cellIndex(x - 1, y)] === world.roomAt[cellIndex(x, y)];
			// Phone booths put glass partitions inside their room.
			if (same && kind !== EDGE.none && kind !== EDGE.glass) problems.push(`stray wall v${x},${y}`);
		}

	for (const d of world.decor) if (!(d.asset in ASSETS)) problems.push(`unknown asset ${d.asset}`);
	return problems;
}
