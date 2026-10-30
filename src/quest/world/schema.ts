import { z } from 'zod';
import {
	CLOTHING_COLORS,
	HAIR_COLORS,
	PARTS,
	type ClothingColor,
	type HairColor,
} from './character-parts';

/**
 * The creative brief: everything the model decides about an office.
 *
 * The model (with a private prompt) writes names, moods, who is where and what they say.
 * Nothing in the brief is spatial: the floorplan, furniture and walkable grid come from the
 * compiler, driven by a seed stored next to the brief. Field order is the streaming order, so
 * the office can assemble while the brief is still being written.
 *
 * Descriptions double as the generator's documentation, so keep them precise. Text lengths are
 * enforced by sanitize.ts (TEXT_LIMITS) rather than zod, so a long line is cut, not rejected.
 */

export const WORLD_VERSION = 2;
export const WORLD_WIDTH = 32;
export const WORLD_HEIGHT = 22;

export const timesOfDay = ['dawn', 'day', 'dusk', 'night'] as const;
export const outsides = ['clear', 'cloudy', 'rain', 'snow'] as const;
export const vibes = ['cozy', 'startup', 'corporate', 'retro', 'eco', 'neon'] as const;

/** Every office has these; the compiler reserves their rooms before the brief arrives. */
export const requiredZones = ['reception', 'desks', 'meetup', 'library', 'server'] as const;
export const optionalZones = [
	'coffee',
	'kitchen',
	'lounge',
	'games',
	'meeting',
	'phone',
	'print',
	'garden',
] as const;
export const zoneKinds = [...requiredZones, ...optionalZones] as const;

export const ZONE_ROLES: Record<ZoneKind, string> = {
	reception: 'reception by the front door: reception desk, waiting sofa, fish tank',
	desks: "the open-space desk pods where the team types away (Max's desk is here too)",
	meetup: 'a cozy event corner with a little stage, podium and projector for meetups and talks',
	library: 'a docs and wiki nook full of bookshelves and reading armchairs',
	server: 'the server room, blinking racks and one suspicious black box',
	coffee: 'a barista coffee bar with an espresso machine and bar stools',
	kitchen: 'the kitchen: counters, fridge, vending machine, snack table',
	lounge: 'a chill lounge with a sectional sofa, beanbags and rugs',
	games: 'a game corner: ping-pong, foosball, chess, arcade cabinets and a console TV',
	meeting: 'a glass-walled meeting room with a long table and a whiteboard',
	phone: 'glass phone booths for calls and hiding from calls',
	print: 'the copy room with the dramatic office printer and filing cabinets',
	garden: 'an indoor jungle with planters, big plants and a fish tank',
};

export const characterIds = [
	'dev_hoodie',
	'dev_glasses',
	'dev_slacker',
	'manager',
	'designer',
	'barista',
	'intern',
	'office_dog',
	'office_cat',
] as const;

export const activities = [
	'typing',
	'meeting',
	'chatting',
	'coffee',
	'serving',
	'lounging',
	'gaming',
	'reading',
	'presenting',
	'attending',
	'fixing',
	'greeting',
	'printing',
	'wandering',
	'napping',
	'calling',
] as const;

/**
 * Style vocabulary for people, straight from the modular character kit (character-parts.ts), so
 * every choice the brief makes maps onto a real part or palette entry. Skin is not in here: the
 * game assigns skin tones itself.
 */
export const LOOK = {
	face: PARTS.face,
	hair: PARTS.hair,
	hairColor: HAIR_COLORS.map((c) => c.id) as [HairColor, ...HairColor[]],
	headwear: ['none', ...PARTS.headwear] as const,
	top: PARTS.top,
	bottom: PARTS.bottom,
	color: CLOTHING_COLORS as [ClothingColor, ...ClothingColor[]],
	accessory: PARTS.accessory,
} as const;

export const eventKinds = ['none', 'meetup', 'pingpong', 'birthday', 'deploy', 'hackathon'] as const;

export const EVENT_ROLES: Record<EventKind, string> = {
	none: 'an ordinary, pleasantly busy day',
	meetup: 'a meetup in the meetup corner: a speaker on stage, colleagues in the audience',
	pingpong: 'a ping-pong tournament in the game corner, with cheering spectators',
	birthday: 'a birthday with cake in the kitchen (or wherever snacks are)',
	deploy: 'deploy-day panic in the server room: red lights, people huddled at the racks',
	hackathon: 'a hackathon: pizza boxes on every desk, everyone typing furiously',
};

/** Functional places. The compiler always provides all five. */
export const landmarkIds = ['max', 'library', 'stage', 'questboard', 'worldforge'] as const;
export const landmarkRoles: Record<LandmarkId, string> = {
	max: "Max's desk in the open space, where visitors talk to Max",
	library: "the bookshelf in the docs nook that holds Max's wiki",
	stage: "the meetup stage where Max's conference talks are listed",
	questboard: 'the kanban board where visitors post a ticket (a project) for Max',
	worldforge: 'the main server rack; redeploying it rebuilds the whole office',
};

export const LIMITS = {
	zones: 13,
	cast: 14,
	minCast: 6,
	remarks: 8,
	talks: 3,
	talkLines: 6,
} as const;

export type TimeOfDay = (typeof timesOfDay)[number];
export type Outside = (typeof outsides)[number];
export type Vibe = (typeof vibes)[number];
export type ZoneKind = (typeof zoneKinds)[number];
export type CastCharacter = (typeof characterIds)[number];
export type Activity = (typeof activities)[number];
export type EventKind = (typeof eventKinds)[number];
export type LandmarkId = (typeof landmarkIds)[number];

const line = (max: number, example: string) =>
	z.string().describe(`Max ${max} characters, e.g. "${example}"`);

const zone = z.object({
	kind: z.enum(zoneKinds),
	name: line(28, 'The Bean Counter').describe(
		'Fun in-world name for this zone, max 28 characters, e.g. "The Bean Counter"',
	),
	story: z
		.string()
		.describe(
			'Build-log line as this zone pops into place, present tense, max 90 characters',
		),
});

const castMember = z.object({
	name: z.string().describe('First name or nickname, max 20 characters; pets get pet names'),
	character: z.enum(characterIds),
	zone: z.enum(zoneKinds).describe('Where they spend the day; must be one of your zones'),
	activity: z.enum(activities),
	line: z
		.string()
		.describe(
			'What they say when greeted, max 110 characters, in character, about this office only',
		),
	look: z
		.object({
			face: z.enum(LOOK.face),
			hair: z.enum(LOOK.hair).describe('Hairstyle; with a cap, beanie or beret use buzz or side_part'),
			hairColor: z
				.enum(LOOK.hairColor)
				.describe('Mostly natural colours; lilac, ocean, mint and rose are rare treats'),
			headwear: z
				.enum(LOOK.headwear)
				.describe('Usually none. headphones only over buzz, side_part, bob or long_straight'),
			top: z.enum(LOOK.top).describe('apron_tee is for whoever serves coffee'),
			topColor: z.enum(LOOK.color),
			bottom: z.enum(LOOK.bottom),
			bottomColor: z.enum(LOOK.color),
			accentColor: z.enum(LOOK.color).describe('Shoes, trims and accessories'),
			accessories: z
				.array(z.enum(LOOK.accessory))
				.describe('0-2 items; glasses on at most a quarter of the cast'),
		})
		.describe('Their style (people only; pets ignore it). Skin tone is chosen by the game.'),
});

export const briefSchema = z.object({
	company: z.string().describe('Fictional company name, max 28 characters'),
	tagline: z.string().describe('Gently satirical company slogan, max 100 characters'),
	vibe: z.enum(vibes),
	timeOfDay: z.enum(timesOfDay),
	outside: z.enum(outsides).describe('Weather seen through the windows'),
	opening: z
		.string()
		.describe('Build-log line as the empty office shell appears, max 90 characters'),
	zones: z.array(zone),
	landmarks: z.object({
		max: z.string().describe("Name for Max's desk, max 28 characters"),
		library: z.string().describe('Name for the wiki bookshelf, max 28 characters'),
		stage: z.string().describe('Name for the meetup stage, max 28 characters'),
		questboard: z.string().describe('Name for the kanban board, max 28 characters'),
		worldforge: z.string().describe('Name for the main server rack, max 28 characters'),
	}),
	event: z.object({
		kind: z.enum(eventKinds),
		title: z.string().describe('Event title, max 48 characters; empty when kind is none'),
		story: z.string().describe('Build-log line announcing it, max 90 characters'),
	}),
	cast: z.array(castMember),
	closing: z
		.string()
		.describe('Last build-log line once everyone has arrived, max 90 characters'),
});

export type BriefOutput = z.infer<typeof briefSchema>;
export type Look = z.infer<typeof castMember>['look'];

/** A sanitized brief: always complete in shape, possibly with empty or short parts. */
export type Brief = {
	company: string;
	tagline: string;
	vibe: Vibe;
	timeOfDay: TimeOfDay;
	outside: Outside;
	opening: string;
	zones: { kind: ZoneKind; name: string; story: string }[];
	landmarks: Partial<Record<LandmarkId, string>>;
	event: { kind: EventKind; title: string; story: string };
	cast: {
		name: string;
		character: CastCharacter;
		zone: ZoneKind;
		activity: Activity;
		line: string;
		/** Null when the brief gave none; the compiler then picks one from the seed. */
		look: Look | null;
	}[];
	closing: string;
	/**
	 * Real facts about Max for the staff to mention, written by a separate grounded model call
	 * (chatter.server.ts). Absent on older offices; the compiler then uses DEFAULT_CHATTER.
	 */
	chatter?: Chatter;
};

/** Office chatter about Max: passing remarks and short two-person talks (alternating lines). */
export type Chatter = {
	remarks: string[];
	talks: string[][];
};
