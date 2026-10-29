/**
 * A typed mirror of public/lab/quest/character-parts.json, the modular character kit
 * (tools/quest-voxel/CHARACTERS.md). The brief schema, the look sampler and the renderer all read
 * this vocabulary; character-parts.test.ts fails as soon as it drifts from the JSON.
 */

export const PARTS = {
	face: ['bright', 'smile', 'freckled', 'smile_lines', 'sleepy', 'wink'],
	hair: [
		'buzz',
		'short_messy',
		'side_part',
		'curly_top',
		'afro',
		'locs',
		'braids',
		'long_straight',
		'bob',
		'high_bun',
		'space_buns',
		'shaved_sides',
	],
	headwear: ['beanie', 'cap', 'beret', 'headwrap', 'headband', 'headphones'],
	top: ['hoodie', 'tee', 'shirt_tie', 'cardigan', 'sweater_vest', 'overalls', 'blazer', 'apron_tee'],
	bottom: ['trousers', 'shorts', 'wide_trousers', 'skirt_leggings'],
	accessory: [
		'round_glasses',
		'square_glasses',
		'earrings',
		'lanyard',
		'beard',
		'moustache',
		'freckles',
		'backpack',
	],
} as const;

export type Face = (typeof PARTS.face)[number];
export type HairStyle = (typeof PARTS.hair)[number];
export type Headwear = (typeof PARTS.headwear)[number];
export type Top = (typeof PARTS.top)[number];
export type Bottom = (typeof PARTS.bottom)[number];
export type Accessory = (typeof PARTS.accessory)[number];

/** Recolourable vertex slots, by `_slot` value; 0 keeps its baked colour. */
export const SLOTS = [
	'baked',
	'skin',
	'skin_shade',
	'hair',
	'hair_shade',
	'top',
	'top_trim',
	'bottom',
	'shoes',
	'accent',
] as const;
export type Slot = (typeof SLOTS)[number];
export type Palette = Record<Exclude<Slot, 'baked'>, string>;

/** Joint pivots in world units; every component hangs its geometry off one of these. */
export const RIG = {
	body: [0, 0.5625, 0],
	head: [0, 1.0625, 0],
	arm_l: [0.3125, 0.9375, 0],
	arm_r: [-0.25, 0.9375, 0],
	leg_l: [0.15625, 0.5625, 0],
	leg_r: [-0.09375, 0.5625, 0],
} as const satisfies Record<string, readonly [number, number, number]>;

/** Ten skin tones, porcelain to ebony. Only seeded code picks one; the brief never does. */
export const SKIN = [
	{ id: 'porcelain', skin: '#f2d9c4', skin_shade: '#d5a68f' },
	{ id: 'rose', skin: '#e9c2ab', skin_shade: '#c7927e' },
	{ id: 'peach', skin: '#ddb08b', skin_shade: '#b98065' },
	{ id: 'golden', skin: '#cd996a', skin_shade: '#a87150' },
	{ id: 'amber', skin: '#b97d59', skin_shade: '#d49c78' },
	{ id: 'copper', skin: '#a46b4c', skin_shade: '#c68d69' },
	{ id: 'umber', skin: '#89573f', skin_shade: '#b77b5a' },
	{ id: 'cocoa', skin: '#704735', skin_shade: '#9e6950' },
	{ id: 'espresso', skin: '#583b32', skin_shade: '#895d49' },
	{ id: 'ebony', skin: '#422e29', skin_shade: '#79513f' },
] as const;

export const HAIR_COLORS = [
	{ id: 'soft_black', hair: '#302b32', hair_shade: '#4e4142', playful: false },
	{ id: 'espresso', hair: '#423536', hair_shade: '#684737', playful: false },
	{ id: 'chestnut', hair: '#684737', hair_shade: '#8b6246', playful: false },
	{ id: 'walnut', hair: '#80573c', hair_shade: '#a17b54', playful: false },
	{ id: 'auburn', hair: '#a15b40', hair_shade: '#bf8059', playful: false },
	{ id: 'copper', hair: '#ba7449', hair_shade: '#d89963', playful: false },
	{ id: 'dark_blond', hair: '#ac8b59', hair_shade: '#c7a977', playful: false },
	{ id: 'gold_blond', hair: '#d9b974', hair_shade: '#ead298', playful: false },
	{ id: 'silver', hair: '#9ba5ac', hair_shade: '#c3c6c4', playful: false },
	{ id: 'snow', hair: '#ded8cc', hair_shade: '#eee7da', playful: false },
	{ id: 'lilac', hair: '#aa85bb', hair_shade: '#c7acd5', playful: true },
	{ id: 'ocean', hair: '#497d98', hair_shade: '#79afbe', playful: true },
	{ id: 'mint', hair: '#71a68d', hair_shade: '#9ac6aa', playful: true },
	{ id: 'rose', hair: '#bd6f82', hair_shade: '#d99ba8', playful: true },
] as const;
export type HairColor = (typeof HAIR_COLORS)[number]['id'];

export const CLOTHING = {
	teal: '#54a8aa',
	teal_dark: '#32777e',
	teal_light: '#88c6be',
	coral: '#de8271',
	coral_dark: '#b65e59',
	mustard: '#dbb659',
	lilac: '#b19ac9',
	sage: '#9aad83',
	cream: '#f4efe6',
	navy: '#303c56',
	metal: '#667b8d',
	metal_light: '#9bb1b7',
} as const;
export type ClothingColor = keyof typeof CLOTHING;
export const CLOTHING_COLORS = Object.keys(CLOTHING) as ClothingColor[];

/** Which hairstyles fit under each headwear, and what it hides. */
export const HEADWEAR_RULES: Record<Headwear, { hides: readonly string[]; allowedHair: readonly HairStyle[] }> = {
	beanie: { hides: [], allowedHair: ['buzz', 'side_part'] },
	cap: { hides: [], allowedHair: ['buzz', 'side_part'] },
	beret: { hides: [], allowedHair: ['buzz', 'side_part'] },
	headwrap: { hides: ['hair', 'accessory/earrings'], allowedHair: [] },
	headband: {
		hides: [],
		allowedHair: [
			'buzz',
			'side_part',
			'curly_top',
			'afro',
			'locs',
			'braids',
			'long_straight',
			'bob',
			'high_bun',
			'space_buns',
			'shaved_sides',
		],
	},
	headphones: { hides: [], allowedHair: ['buzz', 'side_part', 'bob', 'long_straight'] },
};

export const EXCLUSIVE_ACCESSORIES: readonly (readonly [Accessory, Accessory])[] = [
	['round_glasses', 'square_glasses'],
	['beard', 'moustache'],
	['beard', 'freckles'],
	['moustache', 'freckles'],
];
export const MAX_ACCESSORIES = 4;

/** Whether `hair` can be worn (or is covered) under `headwear`. */
export function fitsUnder(headwear: Headwear | 'none', hair: HairStyle) {
	if (headwear === 'none') return true;
	const rule = HEADWEAR_RULES[headwear];
	return rule.hides.includes('hair') || rule.allowedHair.includes(hair);
}

/** GLB node keys for a look, in assembly order, with hidden parts left out. */
export function partNodes(look: {
	face: Face;
	hair: HairStyle;
	headwear: Headwear | 'none';
	top: Top;
	bottom: Bottom;
	accessories: readonly Accessory[];
}): string[] {
	const hat = look.headwear === 'none' ? null : HEADWEAR_RULES[look.headwear];
	const keys = ['base/regular', `face/${look.face}`, `top/${look.top}`, `bottom/${look.bottom}`];
	if (!hat?.hides.includes('hair')) keys.push(`hair/${look.hair}`);
	if (hat) keys.push(`headwear/${look.headwear}`);
	for (const a of look.accessories) {
		const key = `accessory/${a}`;
		if (!hat?.hides.includes(key)) keys.push(key);
	}
	return keys;
}
