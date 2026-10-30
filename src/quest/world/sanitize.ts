import {
	activities,
	characterIds,
	eventKinds,
	landmarkIds,
	LIMITS,
	LOOK,
	outsides,
	timesOfDay,
	vibes,
	zoneKinds,
	type Brief,
	type Chatter,
	type LandmarkId,
	type Look,
	type ZoneKind,
} from './schema';
import { repairLook } from './appearance';

/**
 * Turns untrusted brief-shaped values (model output, stored files) into a valid Brief.
 *
 * Lenient: enums are case-insensitive, unknown or broken entries are dropped, text is cleaned
 * and cut to TEXT_LIMITS, and every missing piece gets a neutral default. Pure and
 * DOM-free so the server, the tests and the browser share it.
 */

export const TEXT_LIMITS = {
	company: 28,
	tagline: 100,
	story: 90,
	zoneName: 28,
	landmarkName: 28,
	eventTitle: 48,
	castName: 20,
	castLine: 110,
	remark: 110,
	talkLine: 100,
} as const;

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toEnum<const T extends readonly string[]>(
	value: unknown,
	options: T,
): T[number] | null {
	if (typeof value !== 'string' || value.length > 40) return null;
	const normalized = value.trim().toLowerCase();
	return options.find((option) => option === normalized) ?? null;
}

// Control characters and line/paragraph separators become spaces; invisible format characters
// (zero-width, bidi overrides) and lone surrogates are removed.
const BREAKING_CHARS = /[\p{Cc}\p{Zl}\p{Zp}]/gu;
const INVISIBLE_CHARS = /[\p{Cf}\p{Cs}]/gu;

/**
 * Plain single-line text: unsafe characters removed, whitespace collapsed, at most `max`
 * characters (code points, so emoji are never split).
 */
export function cleanText(value: unknown, max: number): string {
	if (typeof value !== 'string') return '';
	// Bound the work before running regexes over hostile megabyte strings.
	const bounded = value.length > max * 8 ? value.slice(0, max * 8) : value;
	const cleaned = bounded
		.replace(BREAKING_CHARS, ' ')
		.replace(INVISIBLE_CHARS, '')
		.replace(/\s+/g, ' ')
		.trim();
	const chars = Array.from(cleaned);
	return chars.length <= max ? cleaned : chars.slice(0, max).join('').trimEnd();
}

/** `"Hello."` -> `Hello.` (models like to quote speech); inner quotes are left alone. */
function unquote(text: string) {
	const match = /^["“„«](.*)["”»]$/u.exec(text);
	return match && !/["“”]/u.test(match[1]) ? match[1].trim() : text;
}

export const DEFAULT_ZONE_NAMES: Record<ZoneKind, string> = {
	reception: 'Reception',
	desks: 'The Open Space',
	meetup: 'The Meetup Corner',
	library: 'The Docs Nook',
	server: 'The Server Room',
	coffee: 'The Coffee Bar',
	kitchen: 'The Kitchen',
	lounge: 'The Lounge',
	games: 'The Game Corner',
	meeting: 'Meeting Room',
	phone: 'Phone Booths',
	print: 'The Copy Room',
	garden: 'The Jungle',
};

export const DEFAULT_LANDMARK_NAMES: Record<LandmarkId, string> = {
	max: "Max's Desk",
	library: 'The Wiki Shelf',
	stage: 'The Stage',
	questboard: 'The Ticket Board',
	worldforge: 'The Main Rack',
};

/** Hostile inputs could be huge arrays; nothing legitimate comes close to this. */
const MAX_SCANNED = 64;

function zonesOf(value: unknown): Brief['zones'] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<ZoneKind>();
	const out: Brief['zones'] = [];
	for (const raw of value.slice(0, MAX_SCANNED)) {
		if (!isRecord(raw)) continue;
		const kind = toEnum(raw.kind, zoneKinds);
		if (!kind || seen.has(kind)) continue;
		seen.add(kind);
		out.push({
			kind,
			name: cleanText(raw.name, TEXT_LIMITS.zoneName) || DEFAULT_ZONE_NAMES[kind],
			story: cleanText(raw.story, TEXT_LIMITS.story),
		});
		if (out.length === LIMITS.zones) break;
	}
	return out;
}

/**
 * Words from the first look vocabulary (stored offices still use it) and common model slips,
 * mapped onto the character kit's catalog.
 */
const LOOK_ALIASES: Record<string, string> = {
	short: 'short_messy',
	spiky: 'short_messy',
	curly: 'curly_top',
	bun: 'high_bun',
	ponytail: 'high_bun',
	long: 'long_straight',
	bald: 'buzz',
	black: 'soft_black',
	dark_brown: 'espresso',
	brown: 'chestnut',
	ginger: 'copper',
	red: 'auburn',
	blonde: 'gold_blond',
	blond: 'gold_blond',
	grey: 'silver',
	gray: 'silver',
	white: 'snow',
	pink: 'rose',
	blue: 'ocean',
	green: 'mint',
	purple: 'lilac',
	bandana: 'headband',
	flower: 'headband',
	headscarf: 'headwrap',
	apron: 'apron_tee',
	jacket: 'blazer',
	jeans: 'trousers',
	joggers: 'wide_trousers',
	skirt: 'skirt_leggings',
	glasses: 'round_glasses',
	badge: 'lanyard',
	charcoal: 'navy',
	sky: 'teal_light',
	plum: 'lilac',
	forest: 'teal_dark',
};

function lookEnum<const T extends readonly string[]>(value: unknown, options: T): T[number] | null {
	const direct = toEnum(value, options);
	if (direct || typeof value !== 'string') return direct;
	return toEnum(LOOK_ALIASES[value.trim().toLowerCase()], options);
}

/** A look with every slot valid and the kit's compatibility rules applied, or null. */
function lookOf(value: unknown): Look | null {
	if (!isRecord(value)) return null;
	const hair = lookEnum(value.hair, LOOK.hair);
	const top = lookEnum(value.top, LOOK.top);
	if (!hair || !top) return null;
	const listed = Array.isArray(value.accessories)
		? value.accessories.slice(0, 8)
		: [value.accessories ?? value.accessory];
	const accessories = listed
		.map((a) => lookEnum(a, LOOK.accessory))
		.filter((a): a is Look['accessories'][number] => a !== null);
	return repairLook({
		face: lookEnum(value.face, LOOK.face) ?? 'bright',
		hair,
		hairColor: lookEnum(value.hairColor, LOOK.hairColor) ?? 'chestnut',
		headwear: lookEnum(value.headwear, LOOK.headwear) ?? 'none',
		top,
		topColor: lookEnum(value.topColor, LOOK.color) ?? 'teal',
		bottom: lookEnum(value.bottom, LOOK.bottom) ?? 'trousers',
		bottomColor: lookEnum(value.bottomColor, LOOK.color) ?? 'navy',
		accentColor: lookEnum(value.accentColor, LOOK.color) ?? 'mustard',
		accessories,
	});
}

function castOf(value: unknown): Brief['cast'] {
	if (!Array.isArray(value)) return [];
	const out: Brief['cast'] = [];
	for (const raw of value.slice(0, MAX_SCANNED)) {
		if (!isRecord(raw)) continue;
		const name = cleanText(raw.name, TEXT_LIMITS.castName);
		const character = toEnum(raw.character, characterIds);
		if (!name || !character) continue;
		out.push({
			name,
			character,
			zone: toEnum(raw.zone, zoneKinds) ?? 'desks',
			activity: toEnum(raw.activity, activities) ?? 'wandering',
			line: cleanText(
				unquote(cleanText(raw.line, TEXT_LIMITS.castLine + 2)),
				TEXT_LIMITS.castLine,
			),
			look: lookOf(raw.look),
		});
		if (out.length === LIMITS.cast) break;
	}
	return out;
}

function landmarksOf(value: unknown): Brief['landmarks'] {
	if (!isRecord(value)) return {};
	const out: Brief['landmarks'] = {};
	for (const id of landmarkIds) {
		const name = cleanText(value[id], TEXT_LIMITS.landmarkName);
		if (name) out[id] = name;
	}
	return out;
}

function eventOf(value: unknown): Brief['event'] {
	const kind = isRecord(value) ? toEnum(value.kind, eventKinds) : null;
	if (!isRecord(value) || !kind || kind === 'none')
		return { kind: 'none', title: '', story: '' };
	return {
		kind,
		title: cleanText(value.title, TEXT_LIMITS.eventTitle),
		story: cleanText(value.story, TEXT_LIMITS.story),
	};
}

/** Chatter never links anywhere: a line with a URL or an email address is dropped. */
const LINKISH = /https?:|www\.|\.(?:at|com|wtf|io|dev)\b|@/i;

function chatterLine(value: unknown, max: number) {
	// Models like to label who speaks ("A: …"); the game shows that with the bubble instead.
	const text = cleanText(unquote(cleanText(value, max + 8).replace(/^[AB]\s*:\s*/, '')), max);
	return LINKISH.test(text) ? '' : text;
}

/** Valid chatter with at least one line, or undefined. */
export function chatterOf(value: unknown): Chatter | undefined {
	if (!isRecord(value)) return undefined;
	const remarks = Array.isArray(value.remarks)
		? [...new Set(value.remarks.slice(0, MAX_SCANNED).map((r) => chatterLine(r, TEXT_LIMITS.remark)))]
				.filter(Boolean)
				.slice(0, LIMITS.remarks)
		: [];
	const talks = Array.isArray(value.talks)
		? value.talks
				.slice(0, MAX_SCANNED)
				.map((t) =>
					Array.isArray(t)
						? t.slice(0, LIMITS.talkLines).map((l) => chatterLine(l, TEXT_LIMITS.talkLine))
						: [],
				)
				// A talk with a hole in it no longer alternates properly: all lines or nothing.
				.filter((lines) => lines.length >= 2 && lines.every(Boolean))
				.slice(0, LIMITS.talks)
		: [];
	return remarks.length || talks.length ? { remarks, talks } : undefined;
}

export function sanitizeBrief(raw: unknown): Brief {
	const value = isRecord(raw) ? raw : {};
	const chatter = chatterOf(value.chatter);
	return {
		company: cleanText(value.company, TEXT_LIMITS.company),
		tagline: cleanText(value.tagline, TEXT_LIMITS.tagline),
		vibe: toEnum(value.vibe, vibes) ?? 'cozy',
		timeOfDay: toEnum(value.timeOfDay, timesOfDay) ?? 'day',
		outside: toEnum(value.outside, outsides) ?? 'clear',
		opening: cleanText(value.opening, TEXT_LIMITS.story),
		zones: zonesOf(value.zones),
		landmarks: landmarksOf(value.landmarks),
		event: eventOf(value.event),
		cast: castOf(value.cast),
		closing: cleanText(value.closing, TEXT_LIMITS.story),
		...(chatter ? { chatter } : {}),
	};
}

/** Top-level fields in streaming order (the order of briefSchema). */
const FIELD_ORDER = [
	'company',
	'tagline',
	'vibe',
	'timeOfDay',
	'outside',
	'opening',
	'zones',
	'landmarks',
	'event',
	'cast',
	'closing',
] as const;

/**
 * The parts of a streamed partial object that can no longer change: a field is settled once a
 * later field has started, and array items are settled once the next item has started. With
 * `done`, everything is settled. Unsettled text could still be half a word, so it is left out.
 */
export function settledPart(partial: unknown, done: boolean): Raw {
	if (!isRecord(partial)) return {};
	const out: Raw = {};
	const last = done
		? FIELD_ORDER.length
		: FIELD_ORDER.findLastIndex((field) => partial[field] !== undefined);
	FIELD_ORDER.forEach((field, index) => {
		const value = partial[field];
		if (value === undefined) return;
		if (index < last) out[field] = value;
		else if (Array.isArray(value)) out[field] = value.slice(0, -1);
	});
	return out;
}
