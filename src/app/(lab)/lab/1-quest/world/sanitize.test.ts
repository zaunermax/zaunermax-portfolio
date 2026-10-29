import { describe, expect, it } from 'vitest';
import {
	forestOp,
	hillOp,
	lakeOp,
	landmarkIds,
	landmarkOp,
	LIMITS,
	metaOp,
	npcOp,
	pathOp,
	propsOp,
	riverOp,
	rocksOp,
	WORLD_HEIGHT,
	WORLD_WIDTH,
	worldOp,
	type WorldOp,
} from './schema';
import {
	cleanText,
	createOpSanitizer,
	RANGES,
	sanitizeOp,
	sanitizeOps,
	TEXT_LIMITS,
} from './sanitize';
import { defaultWorldOps } from './default-world';

const meta = {
	type: 'meta',
	name: 'Rosemoor Vale',
	tagline: 'A green valley.',
	biome: 'meadow',
	timeOfDay: 'day',
	weather: 'clear',
	story: 'The valley wakes up.',
};
const hill = { type: 'hill', x: 5, y: 5, radius: 3, height: 2, story: 'A hill.' };
const npc = (n: number) => ({
	type: 'npc',
	kind: 'farmer',
	x: n % WORLD_WIDTH,
	y: 3,
	name: `Farmer ${n}`,
	line: 'Fine weather.',
	wanders: false,
	story: 'Someone arrives.',
});
const building = (n: number) => ({
	type: 'building',
	kind: 'cottage',
	x: n % WORLD_WIDTH,
	y: 10,
	facing: 'south',
	roof: 'red',
	story: 'A cottage.',
});

const hostileNumbers = [
	NaN,
	Infinity,
	-Infinity,
	null,
	undefined,
	'',
	'abc',
	{},
	[],
	true,
	'1'.repeat(100),
];

describe('ranges and text limits match the schema descriptions', () => {
	const range = (
		description: string | undefined,
		[min, max]: readonly [number, number],
	) => expect(description).toMatch(new RegExp(`^${min}\\b.*\\bto ${max}\\b`));
	const chars = (description: string | undefined, max: number) =>
		expect(description).toMatch(new RegExp(`max ${max} characters`, 'i'));

	it('numeric ranges', () => {
		range(hillOp.shape.radius.description, RANGES.hillRadius);
		range(hillOp.shape.height.description, RANGES.hillHeight);
		range(lakeOp.shape.radiusX.description, RANGES.lakeRadiusX);
		range(lakeOp.shape.radiusY.description, RANGES.lakeRadiusY);
		range(riverOp.shape.width.description, RANGES.riverWidth);
		range(riverOp.shape.points.description, RANGES.linePoints);
		range(pathOp.shape.points.description, RANGES.linePoints);
		range(forestOp.shape.radius.description, RANGES.forestRadius);
		range(rocksOp.shape.radius.description, RANGES.rocksRadius);
		range(propsOp.shape.count.description, RANGES.propsCount);
		expect(hillOp.shape.x.description).toContain(`${WORLD_WIDTH - 1}`);
		expect(hillOp.shape.y.description).toContain(`${WORLD_HEIGHT - 1}`);
	});

	it('text lengths', () => {
		chars(metaOp.shape.name.description, TEXT_LIMITS.worldName);
		chars(metaOp.shape.tagline.description, TEXT_LIMITS.tagline);
		chars(metaOp.shape.story.description, TEXT_LIMITS.story);
		chars(landmarkOp.shape.name.description, TEXT_LIMITS.landmarkName);
		chars(npcOp.shape.name.description, TEXT_LIMITS.npcName);
		chars(npcOp.shape.line.description, TEXT_LIMITS.npcLine);
	});
});

describe('sanitizeOp', () => {
	it('keeps valid ops unchanged', () => {
		for (const op of defaultWorldOps) expect(sanitizeOp(op)).toEqual(op);
		expect(sanitizeOp(meta)).toEqual(meta);
		expect(sanitizeOp(npc(1))).toEqual(npc(1));
	});

	it('returns schema-valid ops', () => {
		const ops = [
			meta,
			{ ...hill, radius: 99, height: -3 },
			{ type: 'lake', x: 1, y: 1, radiusX: 0, radiusY: 50, story: '' },
			{
				type: 'river',
				points: [
					{ x: -5, y: 3 },
					{ x: 900, y: 3 },
				],
				width: 7,
				story: 'x',
			},
			{
				type: 'path',
				points: [
					{ x: 1, y: 1 },
					{ x: 4, y: 4 },
				],
				style: 'COBBLE',
			},
			{
				type: 'forest',
				x: 3,
				y: 3,
				radius: 1,
				density: 'dense',
				species: 'pine',
				story: '',
			},
			{ type: 'rocks', x: 3, y: 3, radius: 9, size: 'cliff', story: '' },
			{ type: 'landmark', id: 'stage', x: 3, y: 3, facing: 'up', name: '', story: '' },
			building(3),
			{ type: 'props', kind: 'lamp', x: 3, y: 3, count: 0, story: '' },
			npc(3),
		];
		for (const raw of ops) {
			const op = sanitizeOp(raw);
			expect(op, JSON.stringify(raw)).not.toBeNull();
			expect(worldOp.safeParse(op).success).toBe(true);
		}
	});

	it('clamps coordinates to the grid and sizes to documented ranges', () => {
		expect(sanitizeOp({ ...hill, x: -10, y: 1e9, radius: 99, height: 0 })).toMatchObject({
			x: 0,
			y: WORLD_HEIGHT - 1,
			radius: RANGES.hillRadius[1],
			height: RANGES.hillHeight[0],
		});
		expect(sanitizeOp({ ...hill, x: 1e308, y: -1e308 })).toMatchObject({
			x: WORLD_WIDTH - 1,
			y: 0,
		});
		expect(sanitizeOp({ ...hill, x: 4.6, y: '7' })).toMatchObject({ x: 5, y: 7 });
		expect(
			sanitizeOp({ type: 'props', kind: 'crate', x: 1, y: 1, count: 1000, story: '' }),
		).toMatchObject({ count: RANGES.propsCount[1] });
		expect(
			sanitizeOp({ type: 'props', kind: 'crate', x: 1, y: 1, story: '' }),
		).toMatchObject({
			count: 1,
		});
	});

	it.each(hostileNumbers)('drops ops with a non-numeric coordinate: %j', (value) => {
		expect(sanitizeOp({ ...hill, x: value })).toBeNull();
		expect(sanitizeOp({ ...hill, radius: value })).toBeNull();
		expect(sanitizeOp({ ...npc(1), y: value })).toBeNull();
	});

	it.each([null, undefined, 1, 'meta', [], [meta], true, () => meta])(
		'drops non-objects: %j',
		(value) => expect(sanitizeOp(value)).toBeNull(),
	);

	it('drops unknown types and invalid enums', () => {
		expect(sanitizeOp({ ...hill, type: 'volcano' })).toBeNull();
		expect(sanitizeOp({ ...hill, type: undefined })).toBeNull();
		expect(sanitizeOp({ ...meta, biome: 'lava' })).toBeNull();
		expect(sanitizeOp({ ...meta, weather: { toString: () => 'clear' } })).toBeNull();
		expect(sanitizeOp({ ...building(1), kind: 'skyscraper' })).toBeNull();
		expect(sanitizeOp({ ...npc(1), kind: 'dragon' })).toBeNull();
		expect(sanitizeOp({ type: 'landmark', id: 'castle', x: 1, y: 1 })).toBeNull();
		expect(sanitizeOp({ type: 'landmark', id: '__proto__', x: 1, y: 1 })).toBeNull();
	});

	it('normalizes enum case and fills optional cosmetic fields', () => {
		expect(sanitizeOp({ ...meta, biome: ' Winter ', timeOfDay: 'NIGHT' })).toMatchObject({
			biome: 'winter',
			timeOfDay: 'night',
		});
		expect(sanitizeOp({ ...building(1), facing: 'up', roof: 42 })).toMatchObject({
			facing: 'south',
			roof: 'thatch',
		});
		const noStory: Record<string, unknown> = { ...hill };
		delete noStory.story;
		expect(sanitizeOp(noStory)).toMatchObject({ story: '' });
		expect(sanitizeOp({ type: 'landmark', id: 'library', x: 1, y: 1 })).toMatchObject({
			name: 'The Library',
			facing: 'south',
		});
	});

	it('requires the names that identify a world or an npc', () => {
		expect(sanitizeOp({ ...meta, name: '   ' })).toBeNull();
		expect(sanitizeOp({ ...meta, name: 42 })).toBeNull();
		expect(sanitizeOp({ ...npc(1), name: '​​' })).toBeNull();
	});

	it('removes quotation marks wrapped around npc lines', () => {
		const line = (value: string) =>
			(sanitizeOp({ ...npc(1), line: value }) as { line: string }).line;
		expect(line('"The moor is quiet."')).toBe('The moor is quiet.');
		expect(line('“Mind the fog.”')).toBe('Mind the fog.');
		expect(line(`"${'a'.repeat(TEXT_LIMITS.npcLine)}"`)).toBe(
			'a'.repeat(TEXT_LIMITS.npcLine),
		);
		expect(line('"Hi," she says, "welcome."')).toBe('"Hi," she says, "welcome."');
		expect(line("'Tis a fine day.")).toBe("'Tis a fine day.");
		expect(line('*purrs*')).toBe('*purrs*');
	});

	it('only treats true and "true" as wandering', () => {
		expect(sanitizeOp({ ...npc(1), wanders: 'true' })).toMatchObject({ wanders: true });
		expect(sanitizeOp({ ...npc(1), wanders: 1 })).toMatchObject({ wanders: false });
		expect(sanitizeOp({ ...npc(1), wanders: 'yes' })).toMatchObject({ wanders: false });
	});

	it('cleans line points: clamps, skips invalid and repeated points, caps the count', () => {
		const op = sanitizeOp({
			type: 'path',
			style: 'dirt',
			points: [
				{ x: -1, y: -1 },
				{ x: 0, y: 0 },
				{ x: NaN, y: 3 },
				'nope',
				{ x: 5, y: 99 },
				...Array.from({ length: 20 }, (_, i) => ({ x: 6 + i, y: 1 })),
			],
			story: '',
		});
		expect(op).toMatchObject({ type: 'path' });
		const points = (op as Extract<WorldOp, { type: 'path' }>).points;
		expect(points[0]).toEqual({ x: 0, y: 0 });
		expect(points[1]).toEqual({ x: 5, y: WORLD_HEIGHT - 1 });
		expect(points).toHaveLength(LIMITS.pointsPerLine);
	});

	it('drops lines with fewer than two distinct points', () => {
		const line = (points: unknown) =>
			sanitizeOp({ type: 'river', width: 2, points, story: '' });
		expect(line([{ x: 1, y: 1 }])).toBeNull();
		expect(
			line([
				{ x: 1, y: 1 },
				{ x: 1, y: 1 },
			]),
		).toBeNull();
		expect(
			line([
				{ x: -3, y: 0 },
				{ x: -9, y: 0 },
			]),
		).toBeNull();
		expect(line('1,1 2,2')).toBeNull();
		expect(line(null)).toBeNull();
		expect(line(Array.from({ length: 100_000 }, () => ({ x: 1, y: 1 })))).toBeNull();
	});

	it('truncates and cleans hostile strings', () => {
		const op = sanitizeOp({
			...npc(1),
			name: 'B'.repeat(10_000),
			line: `Hello\u0000\u0007\n\tthere‮friend​!${'x'.repeat(10_000)}`,
			story: '  spaced\r\n\r\nout  ',
		}) as Extract<WorldOp, { type: 'npc' }>;
		expect(op.name).toBe('B'.repeat(TEXT_LIMITS.npcName));
		expect(op.line.startsWith('Hello therefriend!xxx')).toBe(true);
		expect(op.line).toHaveLength(TEXT_LIMITS.npcLine);
		expect(op.story).toBe('spaced out');
	});
});

describe('cleanText', () => {
	it('never splits emoji and never exceeds the limit', () => {
		expect(cleanText('🐸'.repeat(50), 5)).toBe('🐸'.repeat(5));
		expect(Array.from(cleanText('a🐸'.repeat(50), 7))).toHaveLength(7);
	});
	it('removes lone surrogates and line separators', () => {
		expect(cleanText('a\uD800b c d', 20)).toBe('ab c d');
	});
	it('returns an empty string for non-strings', () => {
		for (const value of [null, undefined, 3, {}, ['a'], Symbol('x')])
			expect(cleanText(value, 10)).toBe('');
	});
	it('trims after truncating', () => {
		expect(cleanText('abc def', 4)).toBe('abc');
	});
});

describe('sanitizeOps', () => {
	it('returns [] for non-arrays', () => {
		for (const value of [null, undefined, {}, 'ops', 7, { length: 3, 0: meta }])
			expect(sanitizeOps(value)).toEqual([]);
	});

	it('keeps only the first meta and moves it first', () => {
		const second = { ...meta, name: 'Second Vale' };
		const ops = sanitizeOps([hill, meta, npc(1), second]);
		expect(ops.map((op) => op.type)).toEqual(['meta', 'hill', 'npc']);
		expect(ops[0]).toMatchObject({ name: 'Rosemoor Vale' });
	});

	it('keeps the first landmark per id', () => {
		const ops = sanitizeOps([
			{
				type: 'landmark',
				id: 'max',
				x: 1,
				y: 1,
				facing: 'south',
				name: 'First',
				story: '',
			},
			{
				type: 'landmark',
				id: 'max',
				x: 9,
				y: 9,
				facing: 'south',
				name: 'Second',
				story: '',
			},
			...landmarkIds.map((id) => ({ type: 'landmark', id, x: 2, y: 2, name: id })),
		]);
		const landmarks = ops.filter((op) => op.type === 'landmark');
		expect(landmarks).toHaveLength(landmarkIds.length);
		expect(landmarks[0]).toMatchObject({ id: 'max', name: 'First' });
	});

	it('drops invalid entries without affecting valid neighbours', () => {
		const ops = sanitizeOps([meta, null, 'x', { type: 'npc' }, hill, NaN, [hill]]);
		expect(ops.map((op) => op.type)).toEqual(['meta', 'hill']);
	});

	it('enforces per-kind caps', () => {
		const ops = sanitizeOps([
			meta,
			...Array.from({ length: 40 }, (_, i) => npc(i)),
			...Array.from({ length: 40 }, (_, i) => building(i)),
			...Array.from({ length: 40 }, () => ({
				...hill,
				type: 'forest',
				density: 'normal',
				species: 'oak',
			})),
			...Array.from({ length: 60 }, () => ({
				type: 'props',
				kind: 'lamp',
				x: 1,
				y: 1,
				count: 2,
			})),
		]);
		const count = (type: WorldOp['type']) => ops.filter((op) => op.type === type).length;
		expect(count('npc')).toBe(LIMITS.npcs);
		expect(count('building')).toBe(LIMITS.buildings);
		expect(count('forest')).toBe(LIMITS.forests);
		expect(count('props')).toBe(LIMITS.props);
		expect(ops.slice(1).filter((op) => op.type === 'npc')[0]).toMatchObject({
			name: 'Farmer 0',
		});
	});

	it('enforces the total cap and still keeps a late meta', () => {
		const ops = sanitizeOps([...Array.from({ length: 500 }, () => hill), meta]);
		expect(ops).toHaveLength(LIMITS.ops);
		expect(ops[0].type).toBe('meta');
	});

	it('copes with very large hostile arrays quickly', () => {
		const started = performance.now();
		const ops = sanitizeOps(
			Array.from({ length: 200_000 }, () => ({ ...hill, story: 'z'.repeat(10_000) })),
		);
		expect(ops).toHaveLength(LIMITS.ops - 1);
		expect(performance.now() - started).toBeLessThan(1000);
	});

	it('is idempotent', () => {
		const once = sanitizeOps([hill, meta, npc(1), building(2), { ...hill, x: 99 }]);
		expect(sanitizeOps(once)).toEqual(once);
	});

	it('keeps the default world intact', () => {
		expect(sanitizeOps(defaultWorldOps)).toEqual(
			[...defaultWorldOps].sort(
				(a, b) => Number(b.type === 'meta') - Number(a.type === 'meta'),
			),
		);
	});
});

describe('createOpSanitizer', () => {
	it('accepts ops incrementally and reports rejected ones as null', () => {
		const sanitizer = createOpSanitizer();
		expect(sanitizer.push(meta)).toEqual(meta);
		expect(sanitizer.push(meta)).toBeNull();
		expect(sanitizer.push({ ...hill, x: 99 })).toMatchObject({ x: WORLD_WIDTH - 1 });
		expect(sanitizer.push('garbage')).toBeNull();
		expect(sanitizer.ops().map((op) => op.type)).toEqual(['meta', 'hill']);
	});
});
