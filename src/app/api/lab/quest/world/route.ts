import { after } from 'next/server';
import { clientKey, rateLimit } from '@/app/(lab)/lab/1-quest/server/rate-limit';
import {
	currentJob,
	relativeTime,
	startForge,
	streamJob,
} from '@/app/(lab)/lab/1-quest/world/forge';
import {
	checkGeneration,
	cooldownMs,
	getWorldState,
} from '@/app/(lab)/lab/1-quest/world/store';

/**
 * GET           -> WorldState JSON.
 * GET ?follow=1 -> NDJSON of the generation running on this instance (ops so far, then live),
 *                  or the WorldState JSON when there is none to follow here.
 * POST          -> 429 / 409 / 200 NDJSON (see WORLD_API in world/contract.ts).
 *
 * The request body is never read: visitors cannot put text in front of the model.
 */

// Generation is capped at 90 s plus moderation; keep the function alive until it persisted.
export const maxDuration = 180;

/**
 * Each visitor may start 3 attempts per 3 cooldowns (1 minute to 1 hour): 3 per hour in
 * production, where it mostly caps retries of failed runs; it stays out of the way with the
 * short cooldowns used in development.
 */
const PER_VISITOR_ATTEMPTS = 3;
const perVisitorWindowMs = () =>
	Math.min(60 * 60_000, Math.max(60_000, cooldownMs() * 3));

const NO_STORE = { 'Cache-Control': 'no-store' };
const NDJSON_HEADERS = {
	'Content-Type': 'application/x-ndjson; charset=utf-8',
	// no-transform keeps compression middleware from buffering the stream.
	'Cache-Control': 'no-store, no-transform',
	'X-Accel-Buffering': 'no',
};

function cooldown(nextGenerationAt: string, message?: string) {
	return Response.json(
		{
			message:
				message ??
				`The office can be redeployed ${relativeTime(Date.parse(nextGenerationAt))}.`,
			nextGenerationAt,
		},
		{
			status: 429,
			headers: {
				...NO_STORE,
				'Retry-After': `${Math.max(1, Math.ceil((Date.parse(nextGenerationAt) - Date.now()) / 1000))}`,
			},
		},
	);
}

function busy() {
	return Response.json(
		{
			message:
				'Another visitor is redeploying the office right now. Watch it come together!',
		},
		{ status: 409, headers: NO_STORE },
	);
}

function unavailable(error: unknown) {
	console.error('[quest] the forge is unavailable', error);
	return Response.json(
		{ message: 'Redeploys are unavailable right now. Please try again later.' },
		{ status: 503, headers: NO_STORE },
	);
}

export async function GET(request: Request) {
	if (new URL(request.url).searchParams.has('follow')) {
		const job = currentJob();
		if (job) return new Response(streamJob(job), { headers: NDJSON_HEADERS });
	}
	return Response.json(await getWorldState(), { headers: NO_STORE });
}

export async function POST(request: Request) {
	// Only this site's own pages may start a (paid) generation.
	if (request.headers.get('sec-fetch-site') === 'cross-site') {
		return Response.json({ message: 'Forbidden.' }, { status: 403, headers: NO_STORE });
	}

	try {
		// Cheap global checks first so blocked attempts don't use up a visitor's budget.
		const precheck = currentJob()
			? ({ status: 'busy' } as const)
			: await checkGeneration();
		if (precheck.status === 'busy') return busy();
		if (precheck.status === 'cooldown') return cooldown(precheck.nextGenerationAt);

		const limit = rateLimit(
			`quest-forge:${clientKey(request)}`,
			PER_VISITOR_ATTEMPTS,
			perVisitorWindowMs(),
		);
		if (!limit.ok) {
			const at = new Date(Date.now() + limit.retryAfterSeconds * 1000).toISOString();
			return cooldown(
				at,
				`You have started a few redeploys already. You can start another ${relativeTime(Date.parse(at))}.`,
			);
		}

		const started = await startForge();
		if (started.status === 'busy') return busy();
		if (started.status === 'cooldown') return cooldown(started.nextGenerationAt);

		// The run is not tied to this request: it persists even if the visitor disconnects.
		// after() keeps serverless functions alive until it has settled.
		after(started.job.done);
		return new Response(streamJob(started.job), { headers: NDJSON_HEADERS });
	} catch (error) {
		return unavailable(error);
	}
}
