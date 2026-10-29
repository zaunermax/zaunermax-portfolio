import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	CLOTHING,
	EXCLUSIVE_ACCESSORIES,
	HAIR_COLORS,
	HEADWEAR_RULES,
	MAX_ACCESSORIES,
	PARTS,
	RIG,
	SKIN,
	SLOTS,
} from './character-parts';
import { briefSchema, LOOK } from './schema';

/** The kit's own catalog, as shipped next to character-parts.glb. */
const catalog = JSON.parse(
	readFileSync(path.join(process.cwd(), 'public/lab/quest/character-parts.json'), 'utf8'),
) as {
	rig: Record<string, number[]>;
	slots: { index: number; name: string }[];
	categories: Record<string, string[]>;
	parts: { node: string }[];
	compatibility: {
		headwear: Record<string, { hides: string[]; allowedHair: string[] }>;
		exclusiveAccessories: string[][];
		maxAccessories: number;
	};
	palettes: {
		skin: { id: string; skin: string; skin_shade: string }[];
		hair: { id: string; hair: string; hair_shade: string; playful: boolean }[];
		clothing: Record<string, string>;
	};
};

describe('character-parts mirror', () => {
	it('matches the catalog categories, rig and slots', () => {
		for (const category of ['face', 'hair', 'headwear', 'top', 'bottom', 'accessory'] as const)
			expect([...PARTS[category]], category).toEqual(catalog.categories[category]);
		expect(catalog.categories.base).toEqual(['regular']);
		expect(Object.fromEntries(Object.entries(RIG).map(([k, v]) => [k, [...v]]))).toEqual(catalog.rig);
		expect(catalog.slots.map((s) => s.name)).toEqual([...SLOTS]);
		expect(catalog.slots.map((s) => s.index)).toEqual(SLOTS.map((_, i) => i));
		// Every vocabulary entry has a node in the GLB.
		const nodes = new Set(catalog.parts.map((p) => p.node));
		for (const [category, ids] of Object.entries(PARTS)) for (const id of ids) expect(nodes.has(`${category}/${id}`)).toBe(true);
	});

	it('matches the palettes and compatibility rules', () => {
		expect(SKIN.map((s) => ({ ...s }))).toEqual(catalog.palettes.skin.map(({ id, skin, skin_shade }) => ({ id, skin, skin_shade })));
		expect(HAIR_COLORS.map((c) => ({ ...c }))).toEqual(catalog.palettes.hair);
		expect(CLOTHING).toEqual(catalog.palettes.clothing);
		expect(JSON.parse(JSON.stringify(HEADWEAR_RULES))).toEqual(catalog.compatibility.headwear);
		expect(EXCLUSIVE_ACCESSORIES.map((p) => [...p])).toEqual(catalog.compatibility.exclusiveAccessories);
		expect(MAX_ACCESSORIES).toBe(catalog.compatibility.maxAccessories);
	});

	it('drives the brief schema, so the model can only pick real parts', () => {
		const look = briefSchema.shape.cast.element.shape.look.shape;
		expect(look.face.options).toEqual(catalog.categories.face);
		expect(look.hair.options).toEqual(catalog.categories.hair);
		expect(look.headwear.options).toEqual(['none', ...catalog.categories.headwear]);
		expect(look.top.options).toEqual(catalog.categories.top);
		expect(look.bottom.options).toEqual(catalog.categories.bottom);
		expect(look.hairColor.options).toEqual(catalog.palettes.hair.map((h) => h.id));
		for (const slot of [look.topColor, look.bottomColor, look.accentColor])
			expect(slot.options).toEqual(Object.keys(catalog.palettes.clothing));
		expect(look.accessories.element.options).toEqual(catalog.categories.accessory);
		// Skin is never the model's choice.
		expect(Object.keys(look).some((k) => /skin/i.test(k))).toBe(false);
		expect(Object.keys(LOOK)).not.toContain('skin');
	});
});
