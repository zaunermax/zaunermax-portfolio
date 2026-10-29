import type { CharacterId } from './catalog';
import {
	CLOTHING,
	CLOTHING_COLORS,
	EXCLUSIVE_ACCESSORIES,
	fitsUnder,
	HAIR_COLORS,
	PARTS,
	SKIN,
	type Accessory,
	type ClothingColor,
	type HairColor,
	type Headwear,
	type Palette,
	type Top,
} from './character-parts';
import { hashString, pick, rngFor, shuffle, type Rng } from './random';
import type { Look } from './schema';

/**
 * How a person looks: style choices from the catalog of the modular character kit (from the
 * brief, or seeded when it gave none) plus a skin tone that code assigns.
 *
 * Skin tones are dealt from a seeded deck of all ten tones, reshuffled every round, so any ten
 * people in a row cover the whole range from porcelain to ebony, independently of name, role or
 * style. The brief never chooses skin.
 *
 * The renderer turns an appearance into geometry in one place (scene/characters.ts).
 */

/** `skin` indexes SKIN (character-parts.ts). */
export type Appearance = Look & { skin: number };

export const SKIN_TONES = SKIN.map((s) => s.skin);

/** Deals skin tones: every run of SKIN.length consecutive people gets each tone once. */
export function skinTones(seed: number) {
	const rng = rngFor(seed, 'skin');
	let deck: number[] = [];
	return () => {
		if (!deck.length) deck = shuffle(rng, SKIN.map((_, i) => i));
		return deck.pop()!;
	};
}

const PLAYFUL = HAIR_COLORS.filter((c) => c.playful).map((c) => c.id);
/** Relative weights of the natural colours: dark shades are the most common. */
const NATURAL_WEIGHT: Record<string, number> = {
	soft_black: 3,
	espresso: 3,
	chestnut: 2.4,
	walnut: 2,
	auburn: 1,
	copper: 0.9,
	dark_blond: 1.2,
	gold_blond: 1,
	silver: 1,
	snow: 0.6,
};
/** Share of playful hair colours, and the most glasses an office has per person. */
export const PLAYFUL_SHARE = 0.2;
export const GLASSES_SHARE = 0.25;

const GLASSES: readonly Accessory[] = ['round_glasses', 'square_glasses'];
export const hasGlasses = (look: Look) => look.accessories.some((a) => GLASSES.includes(a));
export const isPlayful = (color: HairColor) => (PLAYFUL as readonly string[]).includes(color);

function weighted<T extends string>(rng: Rng, weights: Record<T, number>): T {
	const entries = Object.entries(weights) as [T, number][];
	let roll = rng() * entries.reduce((n, [, w]) => n + w, 0);
	for (const [key, w] of entries) {
		roll -= w;
		if (roll < 0) return key;
	}
	return entries[entries.length - 1][0];
}

const naturalHair = (rng: Rng) => weighted(rng, NATURAL_WEIGHT as Record<HairColor, number>);

/** Role flavour for seeded looks; the brief can override all of it. */
const ROLE_TOPS: Partial<Record<CharacterId, Top[]>> = {
	barista: ['apron_tee'],
	manager: ['shirt_tie', 'blazer', 'cardigan'],
	designer: ['cardigan', 'overalls', 'tee', 'blazer'],
	dev_hoodie: ['hoodie'],
	dev_glasses: ['sweater_vest', 'shirt_tie', 'cardigan'],
	dev_slacker: ['tee', 'hoodie'],
};

/** A random but tasteful look, for extras and for cast members the brief left plain. */
export function randomLook(seed: number, key: string, role?: CharacterId): Look {
	const rng = rngFor(seed, 'look', key);
	const hair = pick(rng, PARTS.hair);
	const hats = PARTS.headwear.filter((h) => fitsUnder(h, hair));
	const headwear: Headwear | 'none' = rng() < 0.28 && hats.length ? pick(rng, hats) : 'none';
	const tops = ROLE_TOPS[role!] ?? PARTS.top.filter((t) => t !== 'apron_tee');
	const [topColor, bottomColor, accentColor] = shuffle(rng, CLOTHING_COLORS);
	const accessories: Accessory[] = [];
	const glassesOdds = role === 'dev_glasses' ? 0.9 : 0.2;
	if (rng() < glassesOdds) accessories.push(pick(rng, GLASSES));
	const facial = rng();
	if (facial < 0.12) accessories.push('beard');
	else if (facial < 0.18) accessories.push('moustache');
	else if (facial < 0.28) accessories.push('freckles');
	if (rng() < 0.22) accessories.push('earrings');
	if (rng() < (role === 'intern' ? 0.8 : 0.15)) accessories.push('lanyard');
	if (rng() < 0.08) accessories.push('backpack');
	return repairLook({
		face: pick(rng, PARTS.face),
		hair,
		hairColor: rng() < PLAYFUL_SHARE ? pick(rng, PLAYFUL) : naturalHair(rng),
		headwear,
		top: pick(rng, tops),
		topColor,
		bottom: pick(rng, PARTS.bottom),
		bottomColor,
		accentColor,
		accessories: accessories.slice(0, 3),
	});
}

/**
 * Applies the kit's compatibility rules: headwear that does not fit the hair comes off (the
 * hairstyle is the more personal choice), duplicate and mutually exclusive accessories go,
 * keeping the first of each pair.
 */
export function repairLook(look: Look): Look {
	const headwear = fitsUnder(look.headwear, look.hair) ? look.headwear : 'none';
	const accessories: Accessory[] = [];
	for (const a of look.accessories) {
		if (accessories.includes(a)) continue;
		if (EXCLUSIVE_ACCESSORIES.some((pair) => pair.includes(a) && pair.some((b) => b !== a && accessories.includes(b))))
			continue;
		accessories.push(a);
	}
	return { ...look, headwear, accessories: accessories.slice(0, 3) };
}

/**
 * Keeps an office's looks balanced, whoever chose them: playful hair on about one in five
 * people and glasses on about one in four. The cap grows with the running head count, so a
 * person's look depends only on the people before them: the named cast (who come first) keep
 * their choices while a brief streams in, and later looks are toned down deterministically.
 */
export function balanceLooks<T extends Look>(looks: T[], seed: number): T[] {
	const rng = rngFor(seed, 'balance');
	const cap = (share: number, count: number) => Math.max(1, Math.round(count * share));
	let playful = 0;
	let glasses = 0;
	return looks.map((look, i) => {
		let next = look;
		if (isPlayful(look.hairColor)) {
			if (playful < cap(PLAYFUL_SHARE, i + 1)) playful++;
			else next = { ...next, hairColor: naturalHair(rng) };
		}
		if (hasGlasses(look)) {
			if (glasses < cap(GLASSES_SHARE, i + 1)) glasses++;
			else next = { ...next, accessories: next.accessories.filter((a) => !GLASSES.includes(a)) };
		}
		return next;
	});
}

/** A darker or lighter partner colour for trims, so a top never vanishes into its own trim. */
const TRIM: Record<ClothingColor, ClothingColor> = {
	teal: 'teal_dark',
	teal_dark: 'teal_light',
	teal_light: 'teal_dark',
	coral: 'coral_dark',
	coral_dark: 'cream',
	mustard: 'cream',
	lilac: 'navy',
	sage: 'cream',
	cream: 'teal_dark',
	navy: 'cream',
	metal: 'metal_light',
	metal_light: 'navy',
};
const SHOES: ClothingColor[] = ['cream', 'navy', 'metal', 'coral_dark', 'teal_dark', 'cream'];

/** The nine recolour slots for an appearance, as sRGB hex. */
export function paletteOf(appearance: Appearance): Palette {
	const skin = SKIN[appearance.skin] ?? SKIN[0];
	const hair = HAIR_COLORS.find((c) => c.id === appearance.hairColor) ?? HAIR_COLORS[1];
	const shoes = SHOES[hashString(`${appearance.top}${appearance.bottom}${appearance.face}`) % SHOES.length];
	return {
		skin: skin.skin,
		skin_shade: skin.skin_shade,
		hair: hair.hair,
		hair_shade: hair.hair_shade,
		top: CLOTHING[appearance.topColor],
		top_trim: CLOTHING[TRIM[appearance.topColor]],
		bottom: CLOTHING[appearance.bottomColor],
		shoes: CLOTHING[shoes === appearance.bottomColor ? 'cream' : shoes],
		accent: CLOTHING[appearance.accentColor],
	};
}

const PEOPLE = new Set<CharacterId>([
	'visitor',
	'dev_hoodie',
	'dev_glasses',
	'dev_slacker',
	'manager',
	'designer',
	'barista',
	'intern',
]);

export const isPerson = (character: CharacterId) => PEOPLE.has(character);
