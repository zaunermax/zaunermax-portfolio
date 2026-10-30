import { randomInt } from 'node:crypto';
import { Output, streamText, type LanguageModelUsage } from 'ai';
import { getAIProvider, getOpenAI } from '@/server/openai-client.server';
import { generateChatter } from './chatter.server';
import { compileWorld } from './compile';
import { DEFAULT_CHATTER } from './default-world';
import { optionalRoomCount, planFloor } from './floorplan';
import { pick } from './random';
import { sanitizeBrief, settledPart } from './sanitize';
import {
	activities,
	briefSchema,
	characterIds,
	EVENT_ROLES,
	eventKinds,
	landmarkIds,
	landmarkRoles,
	LIMITS,
	optionalZones,
	requiredZones,
	timesOfDay,
	vibes,
	ZONE_ROLES,
	type Brief,
} from './schema';
import { checkWorld } from './validate';

/**
 * Office generation: a private prompt plus one streamed model call.
 *
 * Visitors never send text to the model. The server picks the seed (and with it the floorplan),
 * a premise and a mood at random; the model only writes the creative brief. Every partial brief
 * is sanitized before anyone sees it, and the finished office is compiled, checked and
 * moderated before it is persisted.
 */

export const GENERATION_TIMEOUT_MS = 90_000;
/**
 * A brief is ~2–2.5k tokens; reasoning tokens count against this too. Twice that leaves room for
 * a full cast while an answer that runs away (one in a few) is cut off before it stalls the build.
 */
export const MAX_OUTPUT_TOKENS = 5_000;
export const DEFAULT_WORLD_MODEL = 'gpt-6.1-sol';

export function worldModelId() {
	return process.env.QUEST_WORLD_MODEL?.trim() || DEFAULT_WORLD_MODEL;
}

// ---------------------------------------------------------------------------------------------
// Premises: server-side randomness, never visitor input.

export const PREMISES = [
	'a startup making smart toasters that tweet',
	'a scale-up selling cloud storage for houseplants',
	'an agency that designs fonts for fortune cookies',
	'a fintech app that rounds up spare change into snacks',
	'a dev-tools company whose linter is a little too honest',
	'a game studio shipping a cosy farming sim about servers',
	'a weather API that is right exactly half of the time',
	'an AI startup teaching robots to fold fitted sheets',
	'a big tech campus division in charge of the reply-all button',
	'a delivery app for one single, very fresh croissant',
	'a security firm guarding the office password: password',
	'a social network for rubber ducks that debug code',
	'a calendar company with too many meetings about meetings',
	'a music-streaming startup that only plays elevator jazz',
	'an open-source foundation running on donated biscuits',
	'a robotics lab whose robots unionised for longer naps',
];

export type WorldPremise = {
	premise: string;
	vibe: Brief['vibe'];
	timeOfDay: Brief['timeOfDay'];
	optionalZones: number;
};

export function pickPremise(
	seed: number,
	previous?: Pick<Brief, 'company' | 'vibe'> | null,
	random: () => number = Math.random,
): WorldPremise {
	const freshVibes = vibes.filter((v) => v !== previous?.vibe);
	return {
		premise: pick(random, PREMISES),
		vibe: pick(random, freshVibes),
		timeOfDay: pick(random, timesOfDay),
		optionalZones: optionalRoomCount(planFloor(seed)),
	};
}

// ---------------------------------------------------------------------------------------------
// Prompt

const list = (items: readonly string[]) => items.join(', ');
const zoneList = [...requiredZones, ...optionalZones]
	.map((kind) => `- ${kind}${(requiredZones as readonly string[]).includes(kind) ? ' (required)' : ''}: ${ZONE_ROLES[kind]}`)
	.join('\n');
const eventList = eventKinds.map((kind) => `- ${kind}: ${EVENT_ROLES[kind]}`).join('\n');
const landmarkList = landmarkIds.map((id) => `- ${id}: ${landmarkRoles[id]}`).join('\n');

export const WORLD_INSTRUCTIONS = `You are the office manager of a cute, whimsical voxel office in a cosy top-down game (think Minecraft Dungeons, with nods to The IT Crowd and The Office). Each office belongs to a fictional, gently satirised big-tech company. The game builds the floorplan and furniture itself; you write the creative brief that brings it to life. The office assembles live in front of a visitor in the order you write the brief, and your story lines appear in a build log.

# Zones
Pick zones from this catalogue. Include all required ones, plus exactly the number of optional ones you are asked for. Each kind at most once, and give each a fun in-world name (e.g. "The Bean Counter" for the coffee bar).
${zoneList}
Keep it a believable workplace: pick at most two of lounge, games and garden (the game uses only the first two you list), and give the team somewhere to eat or get coffee and somewhere to meet before adding more fun. The game sizes and furnishes every room itself, so leisure corners stay small next to the open-space desks.

# Landmarks
Five functional places always exist. Give each a short in-world name:
${landmarkList}

# Event
Optionally, something is going on today:
${eventList}
Pick "none" now and then; when there is an event, give it a funny title.

# Cast
${LIMITS.minCast}-${LIMITS.cast} people and pets who work here. character is one of: ${list(characterIds)} (office_dog and office_cat are pets; the barista works the coffee bar). zone must be one of your zones. activity is one of: ${list(activities)}. Put people where their activity makes sense: typing at desks, presenting or attending at the meetup corner (attending fits an event best), serving at the coffee bar, fixing in the server room, gaming in the game corner, calling from the phone booths, two people chatting in the same zone, and so on. If there is an event, put 2-4 cast members at it.
look: build every person from the character kit: a face, hairstyle, hair colour, optional headwear, top, bottom, three clothing colours and 0-2 accessories. Make the cast look varied, and let any style suit anyone: do not tie looks to gender. Keep it grounded: mostly natural hair colours (a playful colour on at most one in five people), glasses on at most one in four, headwear on a few. Caps, beanies and berets only go with buzz or side_part hair; a headwrap goes over any hairstyle. Never mention skin: the game picks skin tones itself so every office is diverse. Pets get look null.
line: one or two short sentences in character, without quotation marks, about this office: its work, its rituals, its small absurdities. Office humour, IT Crowd and The Office energy. Pets make sounds or actions, e.g. "*knocks a mug off the desk* Mrrp."

# Writing
- Stories are one short present-tense sentence, vivid and playful; vary their openings.
- Everything is family-friendly fiction: no real people, companies, brands, products or current events; satire stays gentle and never mean.
- Max, who owns this website, appears only as the name of his desk landmark. No cast member, line or other text mentions him.
- Keep within the stated lengths.`;

export function buildRunPrompt(premise: WorldPremise, previousName?: string | null): string {
	return [
		'Write the brief for a new office:',
		`- company premise: ${premise.premise}`,
		`- suggested mood: vibe ${premise.vibe}, timeOfDay ${premise.timeOfDay}`,
		`- optional zones to pick: exactly ${premise.optionalZones}`,
		previousName
			? `- The previous office belonged to "${previousName}". Choose a clearly different company and cast.`
			: null,
	]
		.filter(Boolean)
		.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Model call

/** Defence in depth for "never about Max": cast members and stray landmark names are dropped. */
const MENTIONS_MAX = /\bmax\b|maximilian|zauner/i;

export function withoutMax(raw: Record<string, unknown>): Record<string, unknown> {
	const out = { ...raw };
	if (Array.isArray(raw.cast))
		out.cast = raw.cast.filter((member) => {
			if (typeof member !== 'object' || member === null) return false;
			const m = member as Record<string, unknown>;
			return ![m.name, m.line].some((t) => typeof t === 'string' && MENTIONS_MAX.test(t));
		});
	if (typeof raw.landmarks === 'object' && raw.landmarks !== null)
		out.landmarks = Object.fromEntries(
			Object.entries(raw.landmarks).filter(
				([id, name]) => id === 'max' || typeof name !== 'string' || !MENTIONS_MAX.test(name),
			),
		);
	return out;
}

export class WorldGenerationError extends Error {
	constructor(
		/** Plain text that may be shown to visitors. */
		readonly publicMessage: string,
		options?: { cause?: unknown },
	) {
		super(publicMessage, options);
		this.name = 'WorldGenerationError';
	}
}

export type GeneratedWorld = {
	brief: Brief;
	seed: number;
	model: string;
	premise: WorldPremise;
	usage: LanguageModelUsage | null;
	finishReason: string | null;
	durationMs: number;
	firstPartMs: number | null;
};

export type GenerateWorldOptions = {
	/** Cancels the model call (in addition to the built-in timeout). */
	signal?: AbortSignal;
	/** The office on display, so the next one differs. */
	previous?: Pick<Brief, 'company' | 'vibe' | 'chatter'> | null;
	/** The floorplan seed; random by default. */
	seed?: number;
};

export const newSeed = () => randomInt(1, 2 ** 31 - 1);

function briefText(brief: Brief) {
	return [
		brief.company,
		brief.tagline,
		brief.opening,
		...brief.zones.flatMap((z) => [z.name, z.story]),
		...Object.values(brief.landmarks),
		brief.event.title,
		brief.event.story,
		...brief.cast.map((c) => `${c.name}: ${c.line}`),
		brief.closing,
	]
		.filter(Boolean)
		.join('\n');
}

async function moderate(brief: Brief, signal?: AbortSignal) {
	let flagged: boolean;
	try {
		const moderation = await getOpenAI().moderations.create(
			{ model: 'omni-moderation-latest', input: briefText(brief) },
			{ signal, timeout: 15_000, maxRetries: 1 },
		);
		flagged = moderation.results.some((result) => result.flagged);
	} catch (error) {
		throw new WorldGenerationError(
			'The redeploy could not check its work, so the new office was discarded.',
			{ cause: error },
		);
	}
	if (flagged)
		throw new WorldGenerationError(
			'The redeploy produced something unfit for this office, so it was discarded.',
		);
}

/** Enough of a brief to stand on its own; the compiler supplies the rest. */
export function usableBrief(brief: Brief) {
	return brief.company !== '' && brief.zones.length >= 3;
}

/**
 * Streams a freshly generated brief. Yields the sanitized, settled part of the brief each time
 * it grows, then the whole brief as the model finished it (its closing marks the end), and
 * returns the final brief once it has been compiled, checked and moderated.
 * Throws WorldGenerationError (with a visitor-safe message) when the result is unusable.
 */
export async function* generateWorld(options: GenerateWorldOptions = {}): AsyncGenerator<Brief, GeneratedWorld> {
	// However the run ends, a chatter call still going is no longer worth paying for.
	const done = new AbortController();
	try {
		return yield* buildWorld(options, done.signal);
	} finally {
		done.abort();
	}
}

async function* buildWorld(
	{ signal, previous, seed = newSeed() }: GenerateWorldOptions,
	finished: AbortSignal,
): AsyncGenerator<Brief, GeneratedWorld> {
	const model = worldModelId();
	const premise = pickPremise(seed, previous);
	const startedAt = Date.now();
	const timeout = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
	const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
	let streamError: unknown = null;
	// The staff's chatter about Max is a separate, grounded call: it runs alongside the brief.
	const chatter = generateChatter({
		premise: premise.premise,
		// Offices without chatter of their own show the default lines.
		previous: previous ? (previous.chatter ?? DEFAULT_CHATTER) : null,
		signal: AbortSignal.any([abortSignal, finished]),
	});

	const result = streamText({
		model: getAIProvider().responses(model),
		output: Output.object({
			schema: briefSchema,
			name: 'office_brief',
			description: 'The creative brief of one office, in build order.',
		}),
		instructions: WORLD_INSTRUCTIONS,
		prompt: buildRunPrompt(premise, previous?.company),
		reasoning: 'low',
		maxOutputTokens: MAX_OUTPUT_TOKENS,
		// One attempt only: a retry could double the cost of a run.
		maxRetries: 0,
		abortSignal,
		// Ultrafast: the office builds live in front of the visitor, so speed beats the token premium
		// (about 9s instead of 25s in Fast mode for roughly 3x the price).
		providerOptions: { openai: { store: false, serviceTier: 'ultrafast' } },
		onError: ({ error }) => {
			streamError ??= error;
		},
	});

	let last = '';
	let brief = sanitizeBrief({});
	let firstPartMs: number | null = null;
	const settle = (partial: unknown, done: boolean) =>
		sanitizeBrief(withoutMax(settledPart(partial, done)));
	try {
		for await (const partial of result.partialOutputStream) {
			const next = settle(partial, false);
			const key = JSON.stringify(next);
			if (key === last) continue;
			last = key;
			brief = next;
			firstPartMs ??= Date.now() - startedAt;
			yield brief;
		}
	} catch (error) {
		streamError ??= error;
	}

	if (signal?.aborted) throw new WorldGenerationError('The redeploy was cancelled.');
	if (streamError && !timeout.aborted)
		throw new WorldGenerationError('The redeploy failed: the AI service did not answer.', {
			cause: streamError,
		});
	if (!timeout.aborted) {
		const output = await Promise.resolve(result.output).catch(() => null);
		if (output) brief = settle(output, true);
	}
	// A timeout keeps whatever was settled so far if it is enough for an office.
	if (!usableBrief(brief))
		throw new WorldGenerationError(
			timeout.aborted
				? 'The redeploy ran out of time before the office took shape.'
				: 'The redeploy produced too little to build an office.',
			{ cause: streamError ?? undefined },
		);
	// The last cast member and the closing only settle once the model is done: show them now,
	// not after the checks below, so the build log never stalls on its final step.
	if (JSON.stringify(brief) !== last) yield brief;
	const problems = checkWorld(compileWorld(brief, seed));
	if (problems.length)
		throw new WorldGenerationError('The new office failed its fire inspection.', {
			cause: new Error(problems.join('; ')),
		});

	const [usage, finishReason] = timeout.aborted
		? [null, 'timeout']
		: await Promise.all([
				Promise.resolve(result.totalUsage).catch(() => null),
				Promise.resolve(result.finishReason).catch(() => null),
			]);

	// The chatter finishes alongside the checks; only the persisted brief carries it.
	const [extra] = await Promise.all([chatter, moderate(brief, signal)]);

	return {
		brief: extra ? { ...brief, chatter: extra } : brief,
		seed,
		model,
		premise,
		usage,
		finishReason,
		durationMs: Date.now() - startedAt,
		firstPartMs,
	};
}
