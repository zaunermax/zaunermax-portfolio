import {
	biomes,
	buildingKinds,
	facings,
	landmarkIds,
	LIMITS,
	npcKinds,
	propKinds,
	roofColors,
	timesOfDay,
	treeSpecies,
	weathers,
	WORLD_HEIGHT,
	WORLD_WIDTH,
	type LandmarkId,
	type WorldOp,
} from './schema';

/**
 * Turns untrusted op-shaped values (model output, stored files) into valid ops.
 *
 * The schema states numeric ranges and text lengths in descriptions rather than as zod
 * constraints, so this module is where they are enforced. Keep these constants in sync with the
 * descriptions in schema.ts; sanitize.test.ts fails when they drift.
 *
 * Pure and dependency-free so the server, the tests and (if ever needed) the client share it.
 */

export const RANGES = {
	hillRadius: [2, 8],
	hillHeight: [1, 4],
	lakeRadiusX: [2, 8],
	lakeRadiusY: [2, 6],
	riverWidth: [1, 3],
	forestRadius: [2, 7],
	rocksRadius: [1, 4],
	propsCount: [1, 8],
	linePoints: [2, LIMITS.pointsPerLine],
} as const satisfies Record<string, readonly [number, number]>;

export const TEXT_LIMITS = {
	worldName: 32,
	tagline: 110,
	story: 90,
	landmarkName: 32,
	npcName: 24,
	npcLine: 120,
} as const;

/** Per-type caps beyond the total. Landmarks are capped by "first per id", meta by "first only". */
const KIND_CAPS: Partial<Record<WorldOp['type'], number>> = {
	npc: LIMITS.npcs,
	building: LIMITS.buildings,
	forest: LIMITS.forests,
	props: LIMITS.props,
};

/** Hostile inputs could be huge arrays; nothing legitimate comes close to this. */
const MAX_SCANNED = LIMITS.ops * 8;

const FALLBACK_LANDMARK_NAMES: Record<LandmarkId, string> = {
	max: "Max's Camp",
	library: 'The Library',
	stage: 'The Stage',
	questboard: 'The Quest Board',
	worldforge: 'The World Forge',
};

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Finite number from a number or numeric string; anything else is null. */
function toNumber(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string' && value.trim() !== '' && value.length <= 32) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function clampInt(value: unknown, min: number, max: number): number | null {
	const number = toNumber(value);
	if (number === null) return null;
	return Math.min(max, Math.max(min, Math.round(number)));
}

const clampX = (value: unknown) => clampInt(value, 0, WORLD_WIDTH - 1);
const clampY = (value: unknown) => clampInt(value, 0, WORLD_HEIGHT - 1);
const inRange = (value: unknown, [min, max]: readonly [number, number]) =>
	clampInt(value, min, max);

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

function toPoints(value: unknown) {
	if (!Array.isArray(value)) return null;
	const points: { x: number; y: number }[] = [];
	for (const raw of value.slice(0, LIMITS.pointsPerLine * 4)) {
		if (!isRecord(raw)) continue;
		const x = clampX(raw.x);
		const y = clampY(raw.y);
		if (x === null || y === null) continue;
		const last = points.at(-1);
		if (last && last.x === x && last.y === y) continue;
		points.push({ x, y });
		if (points.length === RANGES.linePoints[1]) break;
	}
	return points.length >= RANGES.linePoints[0] ? points : null;
}

/** Text fields that must not end up empty return null so the whole op is dropped. */
function required(text: string) {
	return text === '' ? null : text;
}

const story = (raw: Raw) => cleanText(raw.story, TEXT_LIMITS.story);

/**
 * Lenient parse of a single op: numbers may be numeric strings, enums are case-insensitive,
 * coordinates and sizes are clamped, text is cleaned and truncated, `story` may be missing.
 * Returns null for anything that cannot be turned into a valid op.
 */
export function sanitizeOp(raw: unknown): WorldOp | null {
	if (!isRecord(raw)) return null;
	switch (raw.type) {
		case 'meta': {
			const name = required(cleanText(raw.name, TEXT_LIMITS.worldName));
			const biome = toEnum(raw.biome, biomes);
			const timeOfDay = toEnum(raw.timeOfDay, timesOfDay);
			const weather = toEnum(raw.weather, weathers);
			if (!name || !biome || !timeOfDay || !weather) return null;
			const tagline = cleanText(raw.tagline, TEXT_LIMITS.tagline);
			return {
				type: 'meta',
				name,
				tagline,
				biome,
				timeOfDay,
				weather,
				story: story(raw),
			};
		}
		case 'hill': {
			const x = clampX(raw.x);
			const y = clampY(raw.y);
			const radius = inRange(raw.radius, RANGES.hillRadius);
			const height = inRange(raw.height, RANGES.hillHeight);
			if (x === null || y === null || radius === null || height === null) return null;
			return { type: 'hill', x, y, radius, height, story: story(raw) };
		}
		case 'lake': {
			const x = clampX(raw.x);
			const y = clampY(raw.y);
			const radiusX = inRange(raw.radiusX, RANGES.lakeRadiusX);
			const radiusY = inRange(raw.radiusY, RANGES.lakeRadiusY);
			if (x === null || y === null || radiusX === null || radiusY === null) return null;
			return { type: 'lake', x, y, radiusX, radiusY, story: story(raw) };
		}
		case 'river': {
			const points = toPoints(raw.points);
			const width = inRange(raw.width, RANGES.riverWidth);
			if (!points || width === null) return null;
			return { type: 'river', points, width, story: story(raw) };
		}
		case 'path': {
			const points = toPoints(raw.points);
			const style = toEnum(raw.style, ['dirt', 'cobble'] as const);
			if (!points || !style) return null;
			return { type: 'path', points, style, story: story(raw) };
		}
		case 'forest': {
			const x = clampX(raw.x);
			const y = clampY(raw.y);
			const radius = inRange(raw.radius, RANGES.forestRadius);
			const density = toEnum(raw.density, ['sparse', 'normal', 'dense'] as const);
			const species = toEnum(raw.species, treeSpecies);
			if (x === null || y === null || radius === null || !density || !species)
				return null;
			return { type: 'forest', x, y, radius, density, species, story: story(raw) };
		}
		case 'rocks': {
			const x = clampX(raw.x);
			const y = clampY(raw.y);
			const radius = inRange(raw.radius, RANGES.rocksRadius);
			const size = toEnum(raw.size, ['pebbles', 'boulders', 'cliff'] as const);
			if (x === null || y === null || radius === null || !size) return null;
			return { type: 'rocks', x, y, radius, size, story: story(raw) };
		}
		case 'landmark': {
			const id = toEnum(raw.id, landmarkIds);
			const x = clampX(raw.x);
			const y = clampY(raw.y);
			if (!id || x === null || y === null) return null;
			const facing = toEnum(raw.facing, facings) ?? 'south';
			const name =
				cleanText(raw.name, TEXT_LIMITS.landmarkName) || FALLBACK_LANDMARK_NAMES[id];
			return { type: 'landmark', id, x, y, facing, name, story: story(raw) };
		}
		case 'building': {
			const kind = toEnum(raw.kind, buildingKinds);
			const x = clampX(raw.x);
			const y = clampY(raw.y);
			if (!kind || x === null || y === null) return null;
			const facing = toEnum(raw.facing, facings) ?? 'south';
			const roof = toEnum(raw.roof, roofColors) ?? 'thatch';
			return { type: 'building', kind, x, y, facing, roof, story: story(raw) };
		}
		case 'props': {
			const kind = toEnum(raw.kind, propKinds);
			const x = clampX(raw.x);
			const y = clampY(raw.y);
			const count = inRange(raw.count ?? 1, RANGES.propsCount);
			if (!kind || x === null || y === null || count === null) return null;
			return { type: 'props', kind, x, y, count, story: story(raw) };
		}
		case 'npc': {
			const kind = toEnum(raw.kind, npcKinds);
			const x = clampX(raw.x);
			const y = clampY(raw.y);
			const name = required(cleanText(raw.name, TEXT_LIMITS.npcName));
			if (!kind || x === null || y === null || !name) return null;
			const line = cleanText(
				unquote(cleanText(raw.line, TEXT_LIMITS.npcLine + 2)),
				TEXT_LIMITS.npcLine,
			);
			const wanders = raw.wanders === true || raw.wanders === 'true';
			return { type: 'npc', kind, x, y, name, line, wanders, story: story(raw) };
		}
		default:
			return null;
	}
}

/**
 * Applies the list-level rules op by op, so a stream can be sanitized as it arrives:
 * first meta only, first landmark per id, per-kind caps, and the total cap (one slot is always
 * reserved for meta). `push` returns the accepted op or null.
 */
export function createOpSanitizer() {
	let meta: WorldOp | null = null;
	const rest: WorldOp[] = [];
	const landmarks = new Set<LandmarkId>();
	const counts = new Map<WorldOp['type'], number>();

	return {
		push(raw: unknown): WorldOp | null {
			const op = sanitizeOp(raw);
			if (!op) return null;
			if (op.type === 'meta') {
				if (meta) return null;
				meta = op;
				return op;
			}
			if (rest.length >= LIMITS.ops - 1) return null;
			if (op.type === 'landmark') {
				if (landmarks.has(op.id)) return null;
				landmarks.add(op.id);
			}
			const cap = KIND_CAPS[op.type];
			const count = counts.get(op.type) ?? 0;
			if (cap !== undefined && count >= cap) return null;
			counts.set(op.type, count + 1);
			rest.push(op);
			return op;
		},
		/** Accepted ops with meta moved to the front. */
		ops(): WorldOp[] {
			return meta ? [meta, ...rest] : [...rest];
		},
	};
}

export function sanitizeOps(ops: unknown): WorldOp[] {
	if (!Array.isArray(ops)) return [];
	const sanitizer = createOpSanitizer();
	for (const raw of ops.slice(0, MAX_SCANNED)) sanitizer.push(raw);
	return sanitizer.ops();
}
