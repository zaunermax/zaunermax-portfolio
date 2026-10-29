import { describe, expect, it } from 'vitest';
import {
	balanceLooks,
	GLASSES_SHARE,
	hasGlasses,
	isPlayful,
	PLAYFUL_SHARE,
	randomLook,
	repairLook,
	skinTones,
} from './appearance';
import { characterIds } from './schema';
import { EXCLUSIVE_ACCESSORIES, fitsUnder, PARTS, partNodes, SKIN } from './character-parts';
import { compileWorld } from './compile';
import { defaultBrief } from './default-world';

const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 7919);

function compatible(look: ReturnType<typeof randomLook>) {
	expect(fitsUnder(look.headwear, look.hair), `${look.headwear} over ${look.hair}`).toBe(true);
	expect(new Set(look.accessories).size).toBe(look.accessories.length);
	for (const [a, b] of EXCLUSIVE_ACCESSORIES) expect(look.accessories.includes(a) && look.accessories.includes(b)).toBe(false);
	expect(look.accessories.length).toBeLessThanOrEqual(3);
}

describe('appearance', () => {
	it('deals every skin tone once per round, differently per seed', () => {
		const orders = new Set<string>();
		for (const seed of SEEDS) {
			const next = skinTones(seed);
			const round = Array.from({ length: SKIN.length }, next);
			expect(new Set(round).size).toBe(SKIN.length);
			const second = Array.from({ length: SKIN.length }, next);
			expect(new Set(second).size).toBe(SKIN.length);
			orders.add(round.join());
		}
		expect(orders.size).toBeGreaterThan(SEEDS.length * 0.9);
	});

	it('samples varied, compatible looks', () => {
		const looks = SEEDS.flatMap((seed) => Array.from({ length: 25 }, (_, i) => randomLook(seed, `p${i}`)));
		for (const look of looks) compatible(look);
		const seen = (key: 'face' | 'hair' | 'top' | 'bottom' | 'headwear') => new Set(looks.map((l) => l[key])).size;
		expect(seen('face')).toBe(PARTS.face.length);
		expect(seen('hair')).toBe(PARTS.hair.length);
		expect(seen('bottom')).toBe(PARTS.bottom.length);
		expect(seen('headwear')).toBe(PARTS.headwear.length + 1);
		const share = (f: (l: (typeof looks)[number]) => boolean) => looks.filter(f).length / looks.length;
		// Natural colours dominate; glasses and hats stay occasional.
		expect(share((l) => isPlayful(l.hairColor))).toBeLessThan(0.25);
		expect(share((l) => isPlayful(l.hairColor))).toBeGreaterThan(0.1);
		expect(share(hasGlasses)).toBeLessThan(0.26);
		expect(share((l) => l.headwear !== 'none')).toBeLessThan(0.35);
		// Facial hair is an accessory like any other, independent of style.
		expect(share((l) => l.accessories.includes('beard'))).toBeGreaterThan(0.05);
	});

	it('gives roles a flavour but stays compatible', () => {
		for (const seed of SEEDS)
			for (const role of characterIds) {
				const look = randomLook(seed, role, role);
				compatible(look);
				if (role === 'barista') expect(look.top).toBe('apron_tee');
			}
	});

	it('repairs incompatible choices', () => {
		const base = randomLook(1, 'x');
		const repaired = repairLook({
			...base,
			hair: 'afro',
			headwear: 'cap',
			accessories: ['round_glasses', 'square_glasses', 'beard', 'moustache', 'earrings', 'earrings'],
		});
		expect(repaired.headwear).toBe('none');
		expect(repaired.accessories).toEqual(['round_glasses', 'beard', 'earrings']);
		// A headwrap goes over any hair and hides it, and the earrings with it.
		const wrap = repairLook({ ...base, hair: 'afro', headwear: 'headwrap', accessories: ['earrings'] });
		expect(wrap.headwear).toBe('headwrap');
		expect(partNodes(wrap)).not.toContain('hair/afro');
		expect(partNodes(wrap)).not.toContain('accessory/earrings');
	});

	it('caps glasses and playful hair even when every look asks for them', () => {
		const greedy = Array.from({ length: 20 }, (_, i) => ({
			...randomLook(3, `g${i}`),
			hairColor: 'lilac' as const,
			accessories: ['round_glasses' as const],
		}));
		const balanced = balanceLooks(greedy, 3);
		expect(balanced.filter(hasGlasses).length).toBe(Math.round(20 * GLASSES_SHARE));
		expect(balanced.filter((l) => isPlayful(l.hairColor)).length).toBe(Math.round(20 * PLAYFUL_SHARE));
		// The first people keep their choices.
		expect(balanced[0]).toEqual(greedy[0]);
	});

	it('gives compiled offices diverse, balanced people', () => {
		for (const seed of SEEDS.slice(0, 12)) {
			const world = compileWorld(defaultBrief, seed);
			const people = world.npcs.filter((n) => n.appearance).map((n) => n.appearance!);
			for (const p of people) compatible(p);
			expect(new Set(people.map((p) => p.skin)).size).toBe(SKIN.length);
			expect(people.filter(hasGlasses).length).toBeLessThanOrEqual(Math.ceil(people.length * GLASSES_SHARE) + 1);
			expect(people.filter((p) => isPlayful(p.hairColor)).length).toBeLessThanOrEqual(Math.ceil(people.length * PLAYFUL_SHARE) + 1);
			expect(new Set(people.map((p) => p.hair)).size).toBeGreaterThanOrEqual(6);
		}
	});
});
