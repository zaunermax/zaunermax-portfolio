import { clientKey } from '@/quest/server/rate-limit.server';
import { relativeTime, type Forge } from '@/quest/world/forge.server';
import { cooldownMs, type WorldService } from '@/quest/world/store.server';
import type { generateWorld } from '@/quest/world/generate.server';
import type { rateLimit } from '@/quest/server/rate-limit.server';

export type WorldDependencies = {
	world: WorldService;
	forge: Forge;
	rateLimit: typeof rateLimit;
	waitUntil(work: Promise<unknown>): void;
	generate?: typeof generateWorld;
};

/**
 * GET           -> WorldState JSON.
 * GET ?follow=1 -> NDJSON of the generation running on this instance (ops so far, then live),
 *                  or the WorldState JSON when there is none to follow here.
 * POST          -> 429 / 409 / 200 NDJSON (see WORLD_API in world/contract.ts).
 *
 * The request body is never read: visitors cannot put text in front of the model.
 */

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

export async function GET(request: Request, { world, forge }: WorldDependencies) {
	if (new URL(request.url).searchParams.has('follow')) {
		const job = forge.currentJob();
		if (job) return new Response(forge.streamJob(job), { headers: NDJSON_HEADERS });
	}
	return Response.json(await world.getWorldState(), { headers: NO_STORE });
}

export async function POST(request: Request, { world, forge, rateLimit, waitUntil, generate }: WorldDependencies) {
	// Only this site's own pages may start a (paid) generation.
	if (request.headers.get('sec-fetch-site') === 'cross-site') {
		return Response.json({ message: 'Forbidden.' }, { status: 403, headers: NO_STORE });
	}

	try {
		// Cheap global checks first so blocked attempts don't use up a visitor's budget.
		const precheck = forge.currentJob()
			? ({ status: 'busy' } as const)
			: await world.checkGeneration();
		if (precheck.status === 'busy') return busy();
		if (precheck.status === 'cooldown') return cooldown(precheck.nextGenerationAt);

		const limit = await rateLimit(
			`quest-forge:${request.headers.get('X-Quest-Client-Key') ?? clientKey(request)}`,
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

		const started = await forge.startForge(generate);
		if (started.status === 'busy') return busy();
		if (started.status === 'cooldown') return cooldown(started.nextGenerationAt);

		// The run is not tied to this request: it persists even if the visitor disconnects.
		// The DO keepalive covers the overall generation deadline.
		waitUntil(started.job.done);
		return new Response(forge.streamJob(started.job), { headers: NDJSON_HEADERS });
	} catch (error) {
		return unavailable(error);
	}
}
