import { describe, expect, it } from 'vitest';
import {
	compileWorld,
	findPath,
	GRID_H,
	GRID_W,
	LANDMARK_SPACING,
	mulberry32,
	reachableCells,
	type CompiledWorld,
} from './compile';
import { defaultWorldOps } from './default-world';
import { landmarkIds, type WorldOp } from './schema';

const snapshot = (world: CompiledWorld) =>
	JSON.stringify(world, (_key, value) =>
		ArrayBuffer.isView(value) ? Array.from(value as unknown as ArrayLike<number>) : value,
	);

function expectInBounds(world: CompiledWorld) {
	const inside = (x: number, y: number) =>
		Number.isFinite(x) &&
		Number.isFinite(y) &&
		x >= 0 &&
		y >= 0 &&
		x <= GRID_W &&
		y <= GRID_H;
	const cellInside = (c: { x: number; y: number }) =>
		Number.isInteger(c.x) &&
		Number.isInteger(c.y) &&
		c.x >= 0 &&
		c.y >= 0 &&
		c.x < GRID_W &&
		c.y < GRID_H;
	for (const e of [
		...world.landmarks,
		...world.buildings,
		...world.props,
		...world.npcs,
		...world.trees,
		...world.rocks,
	]) {
		expect(inside(e.x, e.y), `${e.id} at ${e.x},${e.y}`).toBe(true);
		expect(Number.isFinite(e.rotation)).toBe(true);
	}
	for (const l of world.landmarks) {
		expect(cellInside(l.cell)).toBe(true);
		expect(cellInside(l.interact)).toBe(true);
	}
	for (const n of world.npcs) expect(cellInside(n.cell)).toBe(true);
	for (const d of world.decks) expect(cellInside(d)).toBe(true);
	expect(cellInside(world.spawn)).toBe(true);
	expect(world.ground).toHaveLength(GRID_W * GRID_H);
	expect(world.heights).toHaveLength(GRID_W * GRID_H);
	for (const h of world.heights) expect(Number.isFinite(h)).toBe(true);
}

function expectLandmarksReachable(world: CompiledWorld) {
	expect(world.landmarks.map((l) => l.landmark).sort()).toEqual([...landmarkIds].sort());
	const seen = reachableCells(world, world.spawn);
	expect(world.walkable[world.spawn.y * GRID_W + world.spawn.x]).toBe(1);
	for (const l of world.landmarks) {
		const i = l.interact.y * GRID_W + l.interact.x;
		expect(world.walkable[i], `${l.landmark} interaction cell walkable`).toBe(1);
		expect(seen[i], `${l.landmark} reachable from spawn`).toBe(1);
		const route = findPath(world, world.spawn, l.interact);
		expect(route, `${l.landmark} path`).not.toBeNull();
		expect(route!.at(-1)).toEqual(l.interact);
	}
	for (const a of world.landmarks)
		for (const b of world.landmarks) {
			if (a === b) continue;
			expect(Math.hypot(a.cell.x - b.cell.x, a.cell.y - b.cell.y)).toBeGreaterThanOrEqual(
				LANDMARK_SPACING,
			);
		}
	for (const l of world.landmarks)
		expect(world.ground[l.cell.y * GRID_W + l.cell.x]).not.toBe('water');
}

/** Random junk shaped roughly like ops: wrong types, huge numbers, missing fields. */
function garbageOps(seed: number, count: number): WorldOp[] {
	const rng = mulberry32(seed);
	const pick = <T>(list: readonly T[]) => list[Math.floor(rng() * list.length)];
	const types = [
		'meta',
		'hill',
		'lake',
		'river',
		'path',
		'forest',
		'rocks',
		'landmark',
		'building',
		'props',
		'npc',
		'nope',
		42,
		null,
	] as const;
	const values = () =>
		pick([
			() => Math.floor(rng() * 60) - 10,
			() => rng() * 1e9 - 5e8,
			() => Number.NaN,
			() => Number.POSITIVE_INFINITY,
			() => 'x'.repeat(Math.floor(rng() * 400)),
			() => null,
			() => undefined,
			() => ({ nested: true }),
			() => [1, 2, 3],
			() =>
				pick([
					'max',
					'library',
					'stage',
					'questboard',
					'worldforge',
					'cottage',
					'oak',
					'dense',
				]),
			() =>
				pick([
					'north',
					'south',
					'east',
					'west',
					'winter',
					'night',
					'snow',
					'dock',
					'cliff',
				]),
			() => true,
		])();
	const ops: unknown[] = [];
	for (let i = 0; i < count; i++) {
		if (rng() < 0.05) {
			ops.push(pick([null, 7, 'op', [], undefined]));
			continue;
		}
		const op: Record<string, unknown> = { type: pick(types) };
		for (const key of [
			'x',
			'y',
			'radius',
			'radiusX',
			'radiusY',
			'height',
			'width',
			'count',
			'id',
			'kind',
			'facing',
			'roof',
			'species',
			'density',
			'size',
			'style',
			'name',
			'line',
			'story',
			'biome',
			'timeOfDay',
			'weather',
			'tagline',
			'wanders',
		])
			if (rng() < 0.7) op[key] = values();
		if (rng() < 0.6)
			op.points = Array.from({ length: Math.floor(rng() * 12) }, () =>
				rng() < 0.85 ? { x: values(), y: values() } : values(),
			);
		ops.push(op);
	}
	return ops as WorldOp[];
}

describe('compileWorld', () => {
	it('is deterministic', () => {
		expect(snapshot(compileWorld(defaultWorldOps))).toBe(
			snapshot(compileWorld(defaultWorldOps)),
		);
		const junk = garbageOps(7, 80);
		expect(snapshot(compileWorld(junk))).toBe(snapshot(compileWorld(junk)));
	});

	it('keeps every op of the default world inside the block set', () => {
		const world = compileWorld(defaultWorldOps);
		expect(world.hasMeta).toBe(true);
		expect(world.meta.name).toBe('Rosemoor Vale');
		expect(world.landmarks.every((l) => !l.supplied)).toBe(true);
		expect(new Set(world.buildings.map((b) => b.kind)).size).toBe(12);
		expect(new Set(world.npcs.map((n) => n.kind)).size).toBe(14);
		expect(new Set(world.trees.map((t) => t.species)).size).toBe(7);
		expect(world.decks.some((d) => d.kind === 'bridge')).toBe(true);
		expect(world.decks.some((d) => d.kind === 'dock')).toBe(true);
		expectLandmarksReachable(world);
		expectInBounds(world);
	});

	it('supplies missing landmarks for an empty op list, and none while streaming', () => {
		const full = compileWorld([]);
		expect(full.hasMeta).toBe(false);
		expectLandmarksReachable(full);
		expectInBounds(full);
		expect(full.landmarks.every((l) => l.supplied)).toBe(true);

		const partial = compileWorld([], { partial: true });
		expect(partial.landmarks).toHaveLength(0);
		expectInBounds(partial);
	});

	it('does not invent landmarks while streaming', () => {
		const prefix = defaultWorldOps.slice(0, 12);
		const partial = compileWorld(prefix, { partial: true });
		const present = prefix.filter((o) => o.type === 'landmark').length;
		expect(partial.landmarks).toHaveLength(present);
		expect(partial.landmarks.every((l) => !l.supplied)).toBe(true);
		expectInBounds(partial);
	});

	it('keeps ids and positions stable as ops stream in', () => {
		const final = compileWorld(defaultWorldOps);
		const byId = new Map(
			[...final.trees, ...final.rocks, ...final.npcs, ...final.props].map((e) => [
				e.id,
				e,
			]),
		);
		let checked = 0;
		for (let n = 1; n < defaultWorldOps.length; n += 7) {
			const partial = compileWorld(defaultWorldOps.slice(0, n), { partial: true });
			for (const e of [...partial.trees, ...partial.rocks]) {
				const later = byId.get(e.id);
				if (!later) continue;
				expect(later.x).toBeCloseTo(e.x);
				expect(later.y).toBeCloseTo(e.y);
				checked++;
			}
		}
		expect(checked).toBeGreaterThan(20);
	});

	it('repairs landmarks piled onto one spot, into water, and off the map', () => {
		const ops: WorldOp[] = [
			{ type: 'lake', x: 20, y: 14, radiusX: 8, radiusY: 6, story: '' },
			...landmarkIds.map((id): WorldOp => ({
				type: 'landmark',
				id,
				x: 20,
				y: 14,
				facing: 'north',
				name: id,
				story: '',
			})),
			{
				type: 'landmark',
				id: 'max',
				x: 999,
				y: -5,
				facing: 'west',
				name: 'duplicate',
				story: '',
			},
		];
		const world = compileWorld(ops);
		expectLandmarksReachable(world);
		expectInBounds(world);
		expect(world.landmark.max?.name).toBe('max');
	});

	it('connects landmarks that are walled off by water and cliffs', () => {
		const ops: WorldOp[] = [
			{
				type: 'river',
				points: [
					{ x: 26, y: 0 },
					{ x: 26, y: 27 },
				],
				width: 3,
				story: '',
			},
			{
				type: 'river',
				points: [
					{ x: 0, y: 9 },
					{ x: 39, y: 9 },
				],
				width: 3,
				story: '',
			},
			{ type: 'rocks', x: 33, y: 18, radius: 4, size: 'cliff', story: '' },
			{
				type: 'forest',
				x: 34,
				y: 4,
				radius: 7,
				density: 'dense',
				species: 'pine',
				story: '',
			},
			{
				type: 'landmark',
				id: 'max',
				x: 10,
				y: 18,
				facing: 'south',
				name: 'Camp',
				story: '',
			},
			{
				type: 'landmark',
				id: 'stage',
				x: 34,
				y: 4,
				facing: 'south',
				name: 'Stage',
				story: '',
			},
			{
				type: 'landmark',
				id: 'library',
				x: 10,
				y: 3,
				facing: 'south',
				name: 'Lib',
				story: '',
			},
			{ type: 'hill', x: 33, y: 20, radius: 3, height: 4, story: '' },
			{
				type: 'landmark',
				id: 'questboard',
				x: 33,
				y: 20,
				facing: 'west',
				name: 'Q',
				story: '',
			},
		];
		const world = compileWorld(ops);
		expectLandmarksReachable(world);
		expectInBounds(world);
	});

	it('survives garbage ops', () => {
		for (let seed = 1; seed <= 60; seed++) {
			const ops = garbageOps(seed, 20 + (seed % 7) * 25);
			const world = compileWorld(ops);
			expectInBounds(world);
			expectLandmarksReachable(world);
			expect(world.npcs.length).toBeLessThanOrEqual(16);
			expect(world.buildings.length).toBeLessThanOrEqual(16);
			const partial = compileWorld(ops, { partial: true });
			expectInBounds(partial);
		}
	});

	it('survives inputs that are not even arrays', () => {
		for (const input of [null, undefined, 42, 'ops', { type: 'meta' }])
			expectLandmarksReachable(compileWorld(input as unknown as WorldOp[]));
	});

	it('clamps text to the documented lengths', () => {
		const world = compileWorld([
			{
				type: 'meta',
				name: 'N'.repeat(200),
				tagline: 'T'.repeat(400),
				biome: 'winter',
				timeOfDay: 'night',
				weather: 'snow',
				story: '',
			},
			{
				type: 'npc',
				kind: 'guard',
				x: 3,
				y: 3,
				name: 'G'.repeat(90),
				line: 'L'.repeat(900),
				wanders: true,
				story: '',
			},
		]);
		expect(world.meta.name.length).toBeLessThanOrEqual(32);
		expect(world.meta.tagline.length).toBeLessThanOrEqual(110);
		expect(world.npcs[0].name.length).toBeLessThanOrEqual(24);
		expect(world.npcs[0].line.length).toBeLessThanOrEqual(120);
		expect(world.meta.biome).toBe('winter');
	});
});
