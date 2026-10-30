import { describe, expect, it } from 'vitest';
import { SKIN } from './character-parts';
import { collides, compileWorld, findPath, meetupAttendance, reachable } from './compile';
import { DEFAULT_CHATTER, defaultBrief, DEFAULT_SEED } from './default-world';
import { assignZones, DOUBLE_ZONES, planFloor } from './floorplan';
import { cellIndex, deskLayout, EVENT_AUDIENCE, RIGHT, runAssets, topHalf } from './furnish';
import { DESK_TOP, SEAT_FORWARD, SEAT_TOP } from './catalog';
import { mulberry32, pick, randInt, shuffle } from './random';
import { briefSteps } from './replay';
import { sanitizeBrief } from './sanitize';
import {
	activities,
	characterIds,
	eventKinds,
	landmarkIds,
	optionalZones,
	requiredZones,
	timesOfDay,
	vibes,
	zoneKinds,
	type Brief,
} from './schema';
import type { CompiledWorld, Furniture } from './types';
import { checkWorld } from './validate';

/** A random but valid brief, like a model might write. */
function randomBrief(seed: number): Brief {
	const rng = mulberry32(seed);
	const zones = shuffle(rng, [...requiredZones, ...shuffle(rng, optionalZones).slice(0, randInt(rng, 2, 8))]);
	return sanitizeBrief({
		company: `Company ${seed}`,
		tagline: 'We disrupt disruption.',
		vibe: pick(rng, vibes),
		timeOfDay: pick(rng, timesOfDay),
		outside: 'rain',
		opening: 'Here we go.',
		zones: zones.map((kind) => ({ kind, name: `The ${kind}`, story: `${kind} appears.` })),
		landmarks: { max: 'Desk', library: 'Shelf', stage: 'Stage', questboard: 'Board', worldforge: 'Rack' },
		event: { kind: pick(rng, eventKinds), title: 'Something', story: 'It happens.' },
		cast: Array.from({ length: randInt(rng, 0, 14) }, (_, i) => ({
			name: `Person ${i}`,
			character: pick(rng, characterIds),
			zone: pick(rng, zoneKinds),
			activity: pick(rng, activities),
			line: 'Hello.',
		})),
		closing: 'Done.',
	});
}

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 13);
const BRIEFS: [string, (seed: number) => Brief][] = [
	['default brief', () => defaultBrief],
	['random brief', (seed) => randomBrief(seed)],
	['empty brief', () => sanitizeBrief({ company: 'Empty Inc' })],
];

function pieceAt(world: CompiledWorld) {
	const map = new Map<number, Furniture>();
	for (const f of world.furniture) for (let y = f.y; y < f.y + f.d; y++) for (let x = f.x; x < f.x + f.w; x++) map.set(cellIndex(x, y), f);
	return map;
}

describe('compileWorld', () => {
	it('is deterministic: the same brief and seed give the same office', () => {
		for (const seed of SEEDS.slice(0, 15)) {
			const brief = randomBrief(seed);
			const a = compileWorld(brief, seed);
			const b = compileWorld(structuredClone(brief), seed);
			expect(JSON.stringify(b)).toBe(JSON.stringify(a));
		}
	});

	it('gives different seeds different floorplans', () => {
		const plans = new Set(SEEDS.slice(0, 20).map((s) => JSON.stringify(planFloor(s).rooms)));
		expect(plans.size).toBeGreaterThan(15);
	});

	for (const [label, make] of BRIEFS)
		it(`keeps every invariant across many seeds (${label})`, () => {
			for (const seed of SEEDS) {
				const world = compileWorld(make(seed), seed);
				const problems = checkWorld(world);
				expect(problems, `seed ${seed}: ${problems.slice(0, 5).join('; ')}`).toEqual([]);
				for (const id of landmarkIds) expect(world.landmark[id], `seed ${seed} ${id}`).toBeDefined();
			}
		});

	it('connects the spawn to every landmark, door and person by an A* path', () => {
		for (const seed of SEEDS.slice(0, 20)) {
			const world = compileWorld(randomBrief(seed), seed);
			const reach = reachable(world, world.spawn);
			for (const l of world.landmarks) {
				expect(reach[cellIndex(l.interact.x, l.interact.y)], `seed ${seed} ${l.landmark}`).toBe(1);
				expect(findPath(world, world.spawn, l.interact)).not.toBeNull();
			}
		}
	});

	it('every room is reachable', () => {
		for (const seed of SEEDS) {
			const world = compileWorld(defaultBrief, seed);
			const reach = reachable(world, world.spawn);
			for (const room of world.rooms) {
				let any = false;
				for (let y = room.y; y < room.y + room.h && !any; y++)
					for (let x = room.x; x < room.x + room.w && !any; x++) any = reach[cellIndex(x, y)] === 1;
				expect(any, `seed ${seed} room ${room.kind}`).toBe(true);
			}
		}
	});

	it('assigns every required zone, and doubles up on at most one landmark-free zone', () => {
		let doubled = 0;
		for (const seed of SEEDS) {
			const world = compileWorld(randomBrief(seed), seed);
			const kinds = world.rooms.map((r) => r.kind).filter((k) => k !== 'hall');
			for (const kind of requiredZones) expect(kinds).toContain(kind);
			const twins = kinds.filter((k, i) => kinds.indexOf(k) !== i);
			expect(twins.length, `seed ${seed}`).toBeLessThanOrEqual(1);
			for (const kind of twins) expect(DOUBLE_ZONES).toContain(kind);
			if (twins.length) {
				doubled++;
				const names = world.rooms.filter((r) => r.kind === twins[0]).map((r) => r.name);
				expect(new Set(names).size, `seed ${seed}`).toBe(2);
			}
			// Reception opens onto the street: its front door is in its south wall, with outdoors beyond.
			const lobby = world.rooms.find((r) => r.kind === 'reception')!;
			expect(world.entrance.y).toBe(lobby.y + lobby.h);
			expect(world.entrance.y === world.height || world.roomAt[cellIndex(world.entrance.x, world.entrance.y)] === -1).toBe(true);
		}
		// Occasional, not never and not always.
		expect(doubled).toBeGreaterThan(0);
		expect(doubled).toBeLessThan(SEEDS.length / 2);
	});

	it('places people only on free cells or seats, never two in one spot', () => {
		for (const seed of SEEDS.slice(0, 25)) {
			const world = compileWorld(randomBrief(seed), seed);
			const at = pieceAt(world);
			const seen = new Set<string>();
			for (const n of world.npcs) {
				const key = `${Math.floor(n.x)},${Math.floor(n.y)}`;
				expect(seen.has(key), `seed ${seed} ${n.id} doubles up with ${world.npcs.find((m) => m !== n && `${Math.floor(m.x)},${Math.floor(m.y)}` === key)?.id}`).toBe(false);
				seen.add(key);
				const piece = at.get(cellIndex(Math.floor(n.x), Math.floor(n.y)));
				// Stages are stood on, booths stood in, and small helpers perch on top of furniture.
				if (!n.sit && !n.elev && piece && piece.asset !== 'stage_block' && piece.asset !== 'phone_booth') expect(piece.blocks, `seed ${seed} ${n.id} stands in ${piece.asset}`).toBe(false);
			}
		}
	});

	it('spreads skin tones over the whole range and keeps Max bespoke', () => {
		for (const seed of SEEDS.slice(0, 10)) {
			const world = compileWorld(defaultBrief, seed);
			const people = world.npcs.filter((n) => n.appearance);
			expect(people.length).toBeGreaterThanOrEqual(SKIN.length);
			// The first ten people cover all ten tones, light to deep.
			expect(new Set(people.slice(0, SKIN.length).map((n) => n.appearance!.skin)).size).toBe(SKIN.length);
			expect(world.max?.appearance).toBeNull();
			for (const n of world.npcs.filter((n) => /office_|robo_/.test(n.character))) expect(n.appearance).toBeNull();
		}
	});

	it('stays stable while a brief streams in: revealed rooms never rearrange', () => {
		for (const seed of [DEFAULT_SEED, ...SEEDS.slice(0, 8)]) {
			const steps = briefSteps(seed === DEFAULT_SEED ? defaultBrief : randomBrief(seed));
			let previous: CompiledWorld | null = null;
			for (const step of steps) {
				const world = compileWorld(step, seed, { partial: true });
				if (previous) {
					const ids = new Map(world.furniture.map((f) => [f.id, f]));
					for (const room of previous.rooms.filter((r) => r.revealed && r.kind !== 'hall')) {
						expect(world.rooms[room.index].kind).toBe(room.kind);
						// Chairs may still slide in or out as people arrive; nothing else moves.
						for (const f of previous.furniture.filter((f) => f.room === room.index && !f.asset.startsWith('planter')))
							expect({ ...ids.get(f.id), tuck: 0 }, `seed ${seed} ${f.id}`).toEqual({ ...f, tuck: 0 });
					}
					for (const n of previous.npcs) expect(world.npcs.find((m) => m.id === n.id)).toEqual(n);
				}
				previous = world;
			}
		}
	});

	it('shows only named rooms while streaming and supplies the rest at the end', () => {
		const plan = planFloor(DEFAULT_SEED);
		const partial = assignZones(plan, ['coffee'], false);
		expect(partial.kinds.filter(Boolean)).toEqual(['coffee']);
		const final = assignZones(plan, ['coffee'], true);
		expect(final.kinds.filter((k) => k === null).length).toBe(plan.rooms.filter((r) => r.hall).length);
		const streaming = compileWorld(sanitizeBrief({ company: 'X', zones: [{ kind: 'coffee', name: 'Beans' }] }), DEFAULT_SEED, { partial: true });
		expect(streaming.landmarks).toEqual([]);
		expect(streaming.rooms.filter((r) => r.revealed && !r.hall).map((r) => r.name)).toEqual(['Beans']);
	});
});

describe('autotiling', () => {
	const worlds = SEEDS.slice(0, 30).map((seed) => compileWorld(randomBrief(seed), seed));

	function runOf(world: CompiledWorld, f: Furniture, family: RegExp) {
		const at = pieceAt(world);
		const step = RIGHT[f.rot];
		const same = (x: number, y: number) => {
			const g = at.get(cellIndex(x, y));
			return g && family.test(g.asset) && g.room === f.room ? g : null;
		};
		return { left: same(f.x - step.x, f.y - step.y), right: same(f.x + step.x, f.y + step.y) };
	}

	it('desk rows have ends on the outside and middles inside, never an orphan middle', () => {
		for (const world of worlds)
			for (const f of world.furniture) {
				if (!f.asset.startsWith('desk_')) continue;
				const { left, right } = runOf(world, f, /^desk_/);
				if (f.asset === 'desk_single') continue;
				if (f.asset === 'desk_end_l') {
					expect(left).toBeNull();
					expect(right?.rot).toBe(f.rot);
				}
				if (f.asset === 'desk_mid') {
					expect(left?.rot).toBe(f.rot);
					expect(right?.rot).toBe(f.rot);
				}
				if (f.asset === 'desk_end_r') {
					expect(right).toBeNull();
					expect(left?.rot).toBe(f.rot);
				}
			}
	});

	it('pairs pods back to back: a north-facing desk with a desk behind it has its mirror twin there', () => {
		for (const world of worlds) {
			const at = pieceAt(world);
			for (const f of world.furniture) {
				if (!f.asset.startsWith('desk_') || f.rot !== 2) continue;
				const twin = at.get(cellIndex(f.x, f.y + 1));
				// Single rows and standing desks have nothing behind them.
				if (!twin?.asset.startsWith('desk_')) continue;
				expect(twin?.rot).toBe(0);
				// Mirror image: the twin of a left end is a right end.
				const mirror: Record<string, string> = { desk_end_l: 'desk_end_r', desk_end_r: 'desk_end_l', desk_mid: 'desk_mid' };
				expect(twin?.asset).toBe(mirror[f.asset]);
			}
		}
	});

	it('meeting tables and planters close with turned-around end pieces', () => {
		for (const world of worlds)
			for (const family of [/^meeting_/, /^planter_/]) {
				for (const f of world.furniture) {
					if (!family.test(f.asset)) continue;
					const { left, right } = runOf(world, f, family);
					if (/_mid(_b)?$/.test(f.asset)) {
						expect(left && right, `${f.id} is an orphan middle`).toBeTruthy();
					} else {
						// An end piece has exactly one neighbour in its run, on its inner side.
						expect(Boolean(left) !== Boolean(right), `${f.id}`).toBe(true);
						if (left) expect((left.rot + 2) % 4).toBe(f.rot);
					}
				}
			}
	});

	it('counters end with their own left and right caps, never mirrored', () => {
		expect(runAssets('counter', 4).map((p) => [p.asset, p.mirror])).toEqual([
			['counter_end_l', false],
			['counter_mid', false],
			['counter_mid', false],
			['counter_end_r', false],
		]);
		for (const world of worlds)
			for (const f of world.furniture.filter((f) => /^counter_end_[lr]$/.test(f.asset))) {
				const { left, right } = runOf(world, f, /^counter_/);
				expect(f.asset === 'counter_end_r' ? right : left, `${f.id}`).toBeNull();
			}
	});

	it('alternates variants along long shelves and planters', () => {
		expect(runAssets('shelf', 4).map((p) => p.asset)).toEqual(['bookshelf', 'bookshelf_b', 'bookshelf', 'bookshelf_b']);
		expect(runAssets('planter', 5).map((p) => p.asset)).toEqual([
			'planter_end',
			'planter_mid',
			'planter_mid_b',
			'planter_mid',
			'planter_end',
		]);
	});

	it('furnishes every room enough that none looks empty', () => {
		for (const world of worlds)
			for (const r of world.rooms.filter((r) => r.revealed && r.kind && r.kind !== 'hall')) {
				let blocked = 0;
				for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) blocked += world.blocked[cellIndex(x, y)];
				expect(blocked / (r.w * r.h), `seed ${world.seed} ${r.kind} ${r.w}x${r.h}`).toBeGreaterThanOrEqual(0.15);
			}
	});

	it('puts a birthday cake out for birthdays, in the kitchen when there is one', () => {
		for (const seed of SEEDS.slice(0, 20)) {
			const world = compileWorld({ ...defaultBrief, event: { kind: 'birthday', title: 'Cake!', story: '' } }, seed);
			expect(world.rooms[world.event!.room].kind).toBe('kitchen');
			expect(world.decor.some((d) => d.asset === 'birthday_cake' && d.room === world.event!.room), `seed ${seed}`).toBe(true);
		}
	});

	it('seats everyone on an occupied seat, whatever they are doing, and nobody stands on one', () => {
		const SEATS = /^(office_chair|gaming_chair|folding_chair|stool|bar_stool|armchair|beanbag_|sofa_)/;
		for (const seed of SEEDS.slice(0, 30)) {
			for (const brief of [defaultBrief, randomBrief(seed), { ...defaultBrief, event: { kind: 'birthday' as const, title: 'Cake', story: '' } }]) {
				const world = compileWorld(brief, seed);
				const at = pieceAt(world);
				for (const n of [...world.npcs, world.max!]) {
					const piece = at.get(cellIndex(Math.floor(n.x), Math.floor(n.y)));
					const onSeat = piece !== undefined && SEATS.test(piece.asset);
					expect(n.sit, `seed ${seed} ${n.id} (${n.pose}) on ${piece?.asset}`).toBe(onSeat);
					if (n.sit) {
						expect(['stand', 'walk'], `seed ${seed} ${n.id}`).not.toContain(n.pose);
						expect(n.elev, `seed ${seed} ${n.id}`).toBeGreaterThan(0);
						// Sitters sit back from the desk, still inside their seat's tile.
						expect(Math.floor(n.x - Math.sin(n.heading) * 0.11)).toBe(Math.floor(n.x));
						expect(Math.floor(n.y - Math.cos(n.heading) * 0.11)).toBe(Math.floor(n.y));
					}
				}
			}
		}
	});

	it('fills a meetup with a crowd that matches its chairs', () => {
		for (const seed of [DEFAULT_SEED, ...SEEDS.slice(0, 30)]) {
			const world = compileWorld(defaultBrief, seed);
			const room = world.event!.room;
			expect(world.rooms[room].kind).toBe('meetup');
			const chairs = world.furniture.filter((f) => f.room === room && f.asset === 'folding_chair');
			const seated = world.npcs.filter((n) => n.room === room && n.sit && chairs.some((c) => c.x === Math.floor(n.x) && c.y === Math.floor(n.y)));
			expect(chairs.length, `seed ${seed}`).toBeLessThanOrEqual(EVENT_AUDIENCE);
			expect(seated.length, `seed ${seed}`).toBeGreaterThanOrEqual(meetupAttendance(chairs.length));
			// No banks of empty chairs: at most a couple are spare.
			expect(chairs.length - seated.length, `seed ${seed}`).toBeLessThanOrEqual(3);
			if (seed === DEFAULT_SEED) expect(seated.length).toBeGreaterThanOrEqual(8);
			if (world.furniture.some((f) => f.room === room && f.asset === 'stage_block'))
				expect(world.npcs.some((n) => n.room === room && n.pose === 'present'), `seed ${seed}`).toBe(true);
		}
		// Without an event the room keeps a small block of chairs.
		const quiet = compileWorld({ ...defaultBrief, event: { kind: 'none', title: '', story: '' } }, DEFAULT_SEED);
		const meetup = quiet.rooms.find((r) => r.kind === 'meetup')!;
		expect(quiet.furniture.filter((f) => f.room === meetup.index && f.asset === 'folding_chair').length).toBeLessThanOrEqual(12);
	});

	it('has a meeting in progress, and people in the lounge and the game corner', () => {
		for (const seed of [DEFAULT_SEED, ...SEEDS.slice(0, 10)]) {
			const world = compileWorld(defaultBrief, seed);
			const people = (kind: string) => world.npcs.filter((n) => world.rooms[n.room].kind === kind && n.appearance);
			// Smaller offices have fewer rooms than the default brief names; check the ones it got.
			const has = (kind: string) => world.rooms.some((r) => r.kind === kind);
			if (has('meeting')) expect(people('meeting').length, `seed ${seed}`).toBeGreaterThanOrEqual(3);
			if (has('lounge')) expect(people('lounge').length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
			if (has('games')) expect(people('games').length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
		}
	});

	it('keeps desk clutter on the tabletop, clear of screens and keyboards, two extras at most', () => {
		const MACHINES = new Set(['monitor', 'monitor_dual', 'laptop', 'keyboard_mouse']);
		for (const world of worlds) {
			const desks = new Map<number, Furniture>();
			for (const f of world.furniture) if (f.asset.startsWith('desk_')) desks.set(cellIndex(f.x, f.y), f);
			const onDesk = world.decor.filter((d) => d.y === DESK_TOP && desks.has(cellIndex(Math.floor(d.x), Math.floor(d.z))));
			const boxes = onDesk.map((d) => {
				const [hx, hz] = topHalf(d.asset, d.heading);
				return { d, x0: d.x - hx, x1: d.x + hx, z0: d.z - hz, z1: d.z + hz };
			});
			for (const b of boxes) {
				// Every corner is on a desk tile, and not over its front or back edge.
				for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) {
					const desk = desks.get(cellIndex(Math.floor(x), Math.floor(z)));
					expect(desk, `seed ${world.seed} ${b.d.asset} at ${b.d.x},${b.d.z} hangs off the desk`).toBeDefined();
					const depth = desk!.rot % 2 ? x - desk!.x : z - desk!.y;
					expect(depth).toBeGreaterThanOrEqual(0.02);
					expect(depth).toBeLessThanOrEqual(0.98);
				}
				for (const o of boxes)
					if (o !== b)
						expect(
							b.x0 < o.x1 - 1e-6 && b.x1 > o.x0 + 1e-6 && b.z0 < o.z1 - 1e-6 && b.z1 > o.z0 + 1e-6,
							`seed ${world.seed} ${b.d.asset} overlaps ${o.d.asset} at ${b.d.x},${b.d.z}`,
						).toBe(false);
			}
			// Every workstation has its computer (the print room's desk is all paper); extras stay at
			// two per desk tile or fewer.
			const extras = onDesk.filter((d) => !MACHINES.has(d.asset)).length;
			const stations = [...desks.values()].filter((f) => world.rooms[f.room].kind !== 'print');
			for (const f of stations)
				expect(
					world.decor.some((d) => MACHINES.has(d.asset) && Math.floor(d.x) === f.x && Math.floor(d.z) === f.y),
					`seed ${world.seed} ${f.asset}@${f.x},${f.y} has no computer`,
				).toBe(true);
			expect(extras).toBeLessThanOrEqual(2 * desks.size);
		}
	});

	it('every office chair faces a desk or table', () => {
		for (const world of worlds) expect(checkWorld(world).filter((p) => p.includes('faces'))).toEqual([]);
	});
});

describe('seating, pods and small stories', () => {
	const briefs = (seed: number) => [defaultBrief, randomBrief(seed), { ...defaultBrief, event: { kind: 'birthday' as const, title: 'Cake', story: '' } }];

	it('snaps every sitter onto their seat: its surface, its centre and its facing', () => {
		for (const seed of SEEDS.slice(0, 20))
			for (const brief of briefs(seed)) {
				const world = compileWorld(brief, seed);
				const at = pieceAt(world);
				for (const n of [...world.npcs, world.max!].filter((n) => n.sit)) {
					const seat = at.get(cellIndex(Math.floor(n.x), Math.floor(n.y)))!;
					expect(n.elev, `seed ${seed} ${n.id} on ${seat.asset}`).toBe(SEAT_TOP[seat.asset]! + seat.elev);
					expect(n.heading).toBeCloseTo(seat.rot * (Math.PI / 2));
					expect(n.x).toBeCloseTo(seat.x + 0.5 + Math.round(Math.sin(n.heading)) * SEAT_FORWARD);
					expect(n.y).toBeCloseTo(seat.y + 0.5 + Math.round(Math.cos(n.heading)) * SEAT_FORWARD);
				}
			}
	});

	it('faces Max his own desk', () => {
		const world = compileWorld(defaultBrief, DEFAULT_SEED);
		const max = world.max!;
		const desk = pieceAt(world).get(cellIndex(Math.floor(max.x + Math.sin(max.heading)), Math.floor(max.y + Math.cos(max.heading))));
		expect(desk?.asset).toBe('big_desk_max');
	});

	it('tucks only empty chairs, and only under the desk or table they face', () => {
		for (const seed of SEEDS.slice(0, 20)) {
			const world = compileWorld(defaultBrief, seed);
			const at = pieceAt(world);
			const sitting = new Set(world.npcs.filter((n) => n.sit).map((n) => cellIndex(Math.floor(n.x), Math.floor(n.y))));
			const tucked = world.furniture.filter((f) => f.tuck);
			expect(tucked.length).toBeGreaterThan(0);
			for (const f of tucked) {
				expect(sitting.has(cellIndex(f.x, f.y)), `seed ${seed} ${f.id}`).toBe(false);
				const front = at.get(cellIndex(f.x + Math.round(Math.sin(f.rot * (Math.PI / 2))), f.y + Math.round(Math.cos(f.rot * (Math.PI / 2)))));
				expect(front?.asset, `seed ${seed} ${f.id}`).toMatch(/^(desk_|meeting_|dining_|coffee_table)/);
			}
		}
	});

	it('bumps characters into the chair they see, not the whole tile', () => {
		const world = compileWorld(defaultBrief, DEFAULT_SEED);
		const chairs = world.furniture.filter((f) => f.asset === 'office_chair');
		expect(chairs.length).toBeGreaterThan(0);
		for (const f of chairs) {
			const [x0, y0, x1, y1] = world.solid.subarray(cellIndex(f.x, f.y) * 4, cellIndex(f.x, f.y) * 4 + 4);
			expect(x1 - x0, f.id).toBeLessThanOrEqual(0.625);
			expect(y1 - y0, f.id).toBeLessThanOrEqual(0.625);
			if (!f.tuck) expect([x0, y0, x1, y1]).toEqual([f.x + 3 / 16, f.y + 3 / 16, f.x + 13 / 16, f.y + 13 / 16]);
		}
		// Desks still fill their tile.
		const desk = world.furniture.find((f) => f.asset === 'desk_mid')!;
		expect([...world.solid.subarray(cellIndex(desk.x, desk.y) * 4, cellIndex(desk.x, desk.y) * 4 + 4)]).toEqual([
			desk.x,
			desk.y,
			desk.x + 1,
			desk.y + 1,
		]);
	});

	it('lets the visitor slip between two chairs standing corner to corner', () => {
		const world = compileWorld(defaultBrief, DEFAULT_SEED);
		const open = {
			blocked: new Uint8Array(world.blocked.length),
			solid: new Float32Array(world.solid.length),
			hEdge: new Uint8Array(world.hEdge.length),
			vEdge: new Uint8Array(world.vEdge.length),
		};
		for (const [x, y] of [
			[10, 10],
			[11, 11],
		]) {
			open.blocked[cellIndex(x, y)] = 1;
			open.solid.set([x + 3 / 16, y + 3 / 16, x + 13 / 16, y + 13 / 16], cellIndex(x, y) * 4);
		}
		// The visitor's radius, right on the corner the two tiles share.
		expect(collides(open, 11, 11, 0.22)).toBe(false);
		expect(collides(open, 10.5, 11.5, 0.22)).toBe(false);
		expect(collides(open, 11, 11, 0.3)).toBe(true);
	});

	it('walks the visitor out from behind a tucked chair', () => {
		const world = compileWorld(defaultBrief, DEFAULT_SEED);
		const chairs = world.furniture.filter((f) => f.asset === 'office_chair' && f.tuck);
		expect(chairs.length).toBeGreaterThan(0);
		for (const f of chairs) {
			// Behind the chair, on the aisle side of its own cell, clear of its body.
			const back = { x: f.x + 0.5 - Math.round(Math.sin(f.rot * (Math.PI / 2))) * 0.3, y: f.y + 0.5 - Math.round(Math.cos(f.rot * (Math.PI / 2))) * 0.3 };
			if (collides(world, back.x, back.y, 0.22)) continue;
			expect(findPath(world, { x: f.x, y: f.y }, world.spawn), f.id).not.toBeNull();
		}
	});

	it('lays the open space out on a grid that varies by seed: pods, benches, rows, huddles, standing desks', () => {
		const kinds = new Set<string>();
		const layouts = new Set<string>();
		for (const seed of SEEDS.slice(0, 30)) {
			const bands = deskLayout(seed, 0, 1, 3, 12, 10);
			expect(bands.length).toBeGreaterThan(0);
			for (const b of bands) {
				kinds.add(b.kind).add(b.swap ?? b.kind);
				// Every band fits the room and is centred in it.
				const span = b.cols * b.n + b.cols - 1;
				expect(b.x - 1).toBe(Math.floor((12 - span) / 2));
			}
			// Bands stack with exactly one aisle between them.
			for (let i = 1; i < bands.length; i++)
				expect(bands[i].y - bands[i - 1].y).toBe((bands[i - 1].kind === 'pod' ? 4 : 2) + 1);
			layouts.add(bands.map((b) => `${b.kind}${b.n}x${b.cols}${b.swap ?? ''}`).join());
			const world = compileWorld(defaultBrief, seed);
			expect(checkWorld(world), `seed ${seed}`).toEqual([]);
		}
		expect(kinds).toEqual(new Set(['pod', 'row', 'standing', 'huddle']));
		expect(layouts.size).toBeGreaterThan(4);
	});

	it('lines desks up: every desk group in a band starts on the same row', () => {
		for (const seed of SEEDS.slice(0, 20)) {
			const world = compileWorld(defaultBrief, seed);
			const room = world.rooms.find((r) => r.kind === 'desks')!;
			const rows = new Set(world.furniture.filter((f) => f.room === room.index && /^desk_(end_l|single)$/.test(f.asset) && f.rot === 0).map((f) => f.y));
			const all = world.furniture.filter((f) => f.room === room.index && /^desk_/.test(f.asset) && f.rot === 0).map((f) => f.y);
			for (const y of all) expect(rows.has(y), `seed ${seed}`).toBe(true);
		}
	});

	it('keeps the barista bot clear of everything on the counter', () => {
		let perched = 0;
		for (const seed of SEEDS)
			for (const [, brief] of BRIEFS) {
				const world = compileWorld(brief(seed), seed);
				for (const n of world.npcs.filter((m) => m.character === 'robo_barista')) {
					perched++;
					const clash = world.decor.find((d) => d.y === n.elev && Math.floor(d.x) === Math.floor(n.x) && Math.floor(d.z) === Math.floor(n.y));
					expect(clash?.asset, `seed ${seed}`).toBeUndefined();
				}
			}
		expect(perched).toBeGreaterThan(0);
	});

	it('tells two or three captioned stories and always staffs the coffee bar', () => {
		for (const seed of SEEDS.slice(0, 20)) {
			const world = compileWorld(defaultBrief, seed);
			const captions = world.npcs.filter((n) => n.caption);
			expect(captions.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
			expect(captions.length, `seed ${seed}`).toBeLessThanOrEqual(3);
			for (const n of captions) expect(n.caption!.length).toBeLessThanOrEqual(40);
			const bar = world.rooms.find((r) => r.kind === 'coffee');
			if (bar) expect(world.npcs.some((n) => n.room === bar.index && n.pose === 'serve' && n.character === 'barista'), `seed ${seed}`).toBe(true);
		}
	});
});

describe('office chatter', () => {
	it('gives remarks to named people and talks to people standing close together', () => {
		for (const seed of [DEFAULT_SEED, 7, 42, 1234]) {
			const world = compileWorld(defaultBrief, seed);
			const byId = new Map(world.npcs.map((a) => [a.id, a]));
			const remarks = world.npcs.filter((a) => a.remark);
			expect(remarks.length).toBeGreaterThan(0);
			for (const a of remarks) expect(a.appearance).toBeTruthy();
			// Named people first; anyone else only once they all have one.
			const named = world.npcs.filter((a) => a.interactive && a.appearance);
			if (named.some((a) => !a.remark)) expect(remarks.every((a) => a.interactive)).toBe(true);
			expect(new Set(remarks.map((a) => a.remark)).size).toBe(remarks.length);
			expect(world.talks.length).toBeGreaterThan(0);
			const people = world.talks.flatMap((t) => [t.a, t.b]);
			expect(new Set(people).size).toBe(people.length);
			for (const t of world.talks) {
				const a = byId.get(t.a)!;
				const b = byId.get(t.b)!;
				expect(a.interactive).toBe(true);
				expect(a.room).toBe(b.room);
				expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThanOrEqual(2.5);
				expect(a.chats && b.chats).toBe(true);
			}
		}
	});

	it('puts the first talk by Max\'s desk and hands out every remark', () => {
		for (const seed of [DEFAULT_SEED, 7, 42, 1234]) {
			const world = compileWorld(defaultBrief, seed);
			const desk = world.landmark.max!.interact;
			const byId = new Map(world.npcs.map((a) => [a.id, a]));
			const away = (t: { a: string; b: string }) => {
				const a = byId.get(t.a)!;
				const b = byId.get(t.b)!;
				return Math.hypot((a.x + b.x) / 2 - desk.x - 0.5, (a.y + b.y) / 2 - desk.y - 0.5);
			};
			for (const t of world.talks.slice(1)) expect(away(world.talks[0])).toBeLessThanOrEqual(away(t));
			expect(world.npcs.filter((a) => a.remark)).toHaveLength(DEFAULT_CHATTER.remarks.length);
		}
	});

	it("uses the office's own chatter, else the default, and none while building", () => {
		const own = { remarks: ['Only remark.'], talks: [['One.', 'Two.']] };
		const world = compileWorld({ ...defaultBrief, chatter: own }, DEFAULT_SEED);
		expect(world.npcs.filter((a) => a.remark).map((a) => a.remark)).toEqual(['Only remark.']);
		expect(world.talks.map((t) => t.lines)).toEqual([['One.', 'Two.']]);
		const fallback = compileWorld(defaultBrief, DEFAULT_SEED);
		expect(fallback.talks[0].lines).toEqual(DEFAULT_CHATTER.talks[0]);
		const partial = compileWorld(defaultBrief, DEFAULT_SEED, { partial: true });
		expect(partial.talks).toEqual([]);
		expect(partial.npcs.some((a) => a.remark)).toBe(false);
	});
});
