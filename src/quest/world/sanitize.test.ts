import { describe, expect, it } from 'vitest';
import { randomLook } from './appearance';
import { defaultBrief } from './default-world';
import { chatterOf, cleanText, sanitizeBrief, settledPart, TEXT_LIMITS } from './sanitize';
import { briefSchema, LIMITS } from './schema';

describe('sanitizeBrief', () => {
	it('keeps the default brief intact and schema-valid', () => {
		expect(sanitizeBrief(defaultBrief)).toEqual(defaultBrief);
		// Pets carry no look in the default brief; the model always sends one.
		const asModel = { ...defaultBrief, cast: defaultBrief.cast.map((c) => ({ ...c, look: c.look ?? randomLook(1, c.name) })) };
		expect(briefSchema.safeParse(asModel).success).toBe(true);
		// Pets may send no look at all (a required one made the model stall).
		const petsWithoutLook = { ...asModel, cast: asModel.cast.map((c) => (c.character.startsWith('office_') ? { ...c, look: null } : c)) };
		expect(briefSchema.safeParse(petsWithoutLook).success).toBe(true);
		expect(sanitizeBrief(petsWithoutLook).cast.filter((c) => c.character.startsWith('office_')).every((c) => c.look === null)).toBe(true);
	});

	it('is idempotent', () => {
		const once = sanitizeBrief({ ...defaultBrief, company: '  Big   Co  ', vibe: 'NEON' });
		expect(sanitizeBrief(once)).toEqual(once);
	});

	it('fills a complete shape from nothing', () => {
		expect(sanitizeBrief(null)).toMatchObject({
			company: '',
			vibe: 'cozy',
			timeOfDay: 'day',
			outside: 'clear',
			zones: [],
			cast: [],
			event: { kind: 'none', title: '', story: '' },
		});
	});

	it('normalizes enums and drops entries it cannot use', () => {
		const brief = sanitizeBrief({
			vibe: 'Retro',
			timeOfDay: 'midnight',
			zones: [
				{ kind: 'Coffee', name: 'Beans' },
				{ kind: 'coffee', name: 'Second coffee' },
				{ kind: 'volcano', name: 'Nope' },
				'junk',
				{ kind: 'desks' },
			],
			cast: [
				{ name: 'Ada', character: 'manager', zone: 'mars', activity: 'plotting', line: '"Hi."' },
				{ name: '', character: 'manager' },
				{ name: 'Bob', character: 'wizard' },
			],
			event: { kind: 'karaoke', title: 'x' },
		});
		expect(brief.vibe).toBe('retro');
		expect(brief.timeOfDay).toBe('day');
		expect(brief.zones).toEqual([
			{ kind: 'coffee', name: 'Beans', story: '' },
			{ kind: 'desks', name: 'The Open Space', story: '' },
		]);
		expect(brief.cast).toEqual([
			{ name: 'Ada', character: 'manager', zone: 'desks', activity: 'wandering', line: 'Hi.', look: null },
		]);
		expect(brief.event.kind).toBe('none');
	});

	it('cuts text to the limits and strips hostile characters', () => {
		const long = 'x'.repeat(500);
		const brief = sanitizeBrief({
			company: `Evil‮Corp\u0000${long}`,
			tagline: long,
			zones: [{ kind: 'lounge', name: long, story: long }],
			cast: [{ name: long, character: 'intern', line: long }],
		});
		expect(brief.company.startsWith('EvilCorp')).toBe(true);
		expect(brief.company.length).toBe(TEXT_LIMITS.company);
		expect(brief.tagline.length).toBe(TEXT_LIMITS.tagline);
		expect(brief.zones[0].name.length).toBe(TEXT_LIMITS.zoneName);
		expect(brief.cast[0].line.length).toBe(TEXT_LIMITS.castLine);
	});

	it('keeps a valid look and repairs a partial one', () => {
		const [a, b] = sanitizeBrief({
			cast: [
				{ name: 'A', character: 'intern', look: { hair: 'Afro', top: 'hoodie', topColor: 'neon-green' } },
				{ name: 'B', character: 'intern', look: { hair: 'mullet', top: 'hoodie' } },
			],
		}).cast;
		expect(a.look).toEqual({
			face: 'bright',
			hair: 'afro',
			hairColor: 'chestnut',
			headwear: 'none',
			top: 'hoodie',
			topColor: 'teal',
			bottom: 'trousers',
			bottomColor: 'navy',
			accentColor: 'mustard',
			accessories: [],
		});
		expect(b.look).toBeNull();
	});

	it('caps zones and cast, and copes with huge arrays', () => {
		const brief = sanitizeBrief({
			cast: Array.from({ length: 100_000 }, (_, i) => ({ name: `N${i}`, character: 'intern' })),
		});
		expect(brief.cast).toHaveLength(LIMITS.cast);
	});

	it('ignores the old fantasy op format', () => {
		const brief = sanitizeBrief([{ type: 'meta', name: 'Rosemoor Vale' }]);
		expect(brief.company).toBe('');
	});
});

describe('settledPart', () => {
	it('holds back the field still being written and the last array item', () => {
		const partial = {
			company: 'Byte',
			tagline: 'We bake',
			vibe: 'cozy',
			timeOfDay: 'day',
			outside: 'clear',
			opening: 'Walls rise.',
			zones: [{ kind: 'desks', name: 'Floor' }, { kind: 'cof' }],
		};
		expect(settledPart(partial, false)).toEqual({
			...partial,
			zones: [{ kind: 'desks', name: 'Floor' }],
		});
		expect(settledPart({ company: 'By' }, false)).toEqual({});
		expect(settledPart({ company: 'Byte', tagline: 'We' }, false)).toEqual({ company: 'Byte' });
		expect(settledPart(partial, true)).toEqual(partial);
	});
});

describe('cleanText', () => {
	it('never splits emoji and never exceeds the limit', () => {
		expect(cleanText('ab🐸🐸', 3)).toBe('ab🐸');
	});
	it('returns an empty string for non-strings', () => {
		expect(cleanText(42, 10)).toBe('');
	});
});

describe('chatterOf', () => {
	it('keeps clean lines and drops labels, links, duplicates and broken talks', () => {
		const chatter = chatterOf({
			remarks: ['"Max owns an ErgoDox EZ."', 'Max owns an ErgoDox EZ.', 'See zaunermax.at', 'Mail hello@x.io', 'Try maxzauner.org', 'He uses Effect.ts and Next.js.', 'His CV says so.', 42, ''],
			talks: [
				['A: Trains?', 'B: Trains.'],
				['Only one line'],
				['Fine', 'https://example.com'],
				['Code and wiring?', "That's what the notes say."],
				'nope',
			],
		});
		expect(chatter).toEqual({
			remarks: ['Max owns an ErgoDox EZ.', 'He uses Effect.ts and Next.js.'],
			talks: [['Trains?', 'Trains.']],
		});
	});

	it('caps the counts and lengths', () => {
		const chatter = chatterOf({
			remarks: Array.from({ length: 20 }, (_, i) => `Remark ${i} ${'x'.repeat(200)}`),
			talks: Array.from({ length: 5 }, () => Array.from({ length: 9 }, (_, i) => `Line ${i}`)),
		})!;
		expect(chatter.remarks).toHaveLength(LIMITS.remarks);
		expect(Math.max(...chatter.remarks.map((r) => r.length))).toBeLessThanOrEqual(TEXT_LIMITS.remark);
		expect(chatter.talks).toHaveLength(LIMITS.talks);
		expect(chatter.talks[0]).toHaveLength(LIMITS.talkLines);
	});

	it('is absent from briefs without any', () => {
		expect(chatterOf({ remarks: [], talks: [] })).toBeUndefined();
		expect('chatter' in sanitizeBrief(defaultBrief)).toBe(false);
		expect(sanitizeBrief({ ...defaultBrief, chatter: { remarks: ['Hi.'] } }).chatter).toEqual({ remarks: ['Hi.'], talks: [] });
	});
});
