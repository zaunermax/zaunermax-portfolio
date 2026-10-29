import type { z } from 'zod';
import { business } from '@/app/(lab)/lab/_shared/content';
import {
	contactSubmission,
	type ContactResult,
	type ContactSubmission,
} from '@/app/(lab)/lab/1-quest/chat/contract';
import { buildQuestEmail, deliverQuestEmail } from '@/app/(lab)/lab/1-quest/chat/mailer';
import { clientKey, rateLimit } from '@/app/(lab)/lab/1-quest/server/rate-limit';
import { openai } from '@/lib/server-only/openai-client';

const MAX_BODY_CHARS = 16_000;
const MIN_ELAPSED_MS = 3000;
const DAY_MS = 24 * 60 * 60_000;
const PER_IP_PER_DAY = 3;
const GLOBAL_PER_DAY = 40;

function reply(
	result: ContactResult,
	status = 200,
	headers: Record<string, string> = {},
) {
	return Response.json(result, {
		status,
		headers: { 'Cache-Control': 'no-store', ...headers },
	});
}
const fail = (status: number, message: string, headers?: Record<string, string>) =>
	reply({ ok: false, message }, status, headers);

const FIELD_HINTS: Record<
	Exclude<keyof ContactSubmission, 'website' | 'elapsedMs'>,
	string
> = {
	title: 'Give the quest a title of 3 to 60 characters.',
	name: 'Add your name (up to 80 characters).',
	email: 'Add a valid email address so Max can reply.',
	company: 'Keep the company under 80 characters.',
	summary: 'Describe the project in 20 to 1500 characters.',
	timeline: 'Keep the timeline under 80 characters.',
	budget: 'Keep the budget under 80 characters.',
};

function describeIssues(error: z.ZodError, email: string) {
	const fields = new Set(error.issues.map((issue) => String(issue.path[0] ?? '')));
	if (fields.has('website')) {
		return `The spam guard caught this scroll. Reload the page and try again, or email Max at ${email}.`;
	}
	const hints = Object.entries(FIELD_HINTS)
		.filter(([field]) => fields.has(field))
		.map(([, hint]) => hint);
	return hints.length
		? hints.join(' ')
		: 'That scroll could not be read. Reload the page and try again.';
}

export async function POST(request: Request) {
	// The public address; CONTACT_TO_EMAIL may be a private inbox.
	const directEmail = business.email;
	if (!request.headers.get('content-type')?.includes('application/json')) {
		return fail(400, 'Send the scroll as JSON.');
	}
	const raw = await request.text().catch(() => '');
	if (raw.length > MAX_BODY_CHARS)
		return fail(400, 'That scroll is too long. Shorten it a little.');
	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		return fail(400, 'That scroll could not be read. Reload the page and try again.');
	}
	const parsed = contactSubmission.safeParse(body);
	if (!parsed.success) return fail(400, describeIssues(parsed.error, directEmail));
	const submission = parsed.data;
	if (submission.elapsedMs < MIN_ELAPSED_MS) {
		return fail(
			400,
			'That was quick! Take a moment to check the scroll, then send it again.',
		);
	}

	const ip = clientKey(request);
	const perIp = rateLimit(`quest-contact:ip:${ip}`, PER_IP_PER_DAY, DAY_MS);
	if (!perIp.ok) {
		return fail(
			429,
			`You've sent ${PER_IP_PER_DAY} scrolls today, which is the limit. Max will get back to you; for anything else, email ${directEmail}.`,
			{ 'Retry-After': String(perIp.retryAfterSeconds) },
		);
	}
	const global = rateLimit('quest-contact:global', GLOBAL_PER_DAY, DAY_MS);
	if (!global.ok) {
		return fail(
			429,
			`The quest board is full for today. Please email Max directly at ${directEmail}.`,
			{ 'Retry-After': String(global.retryAfterSeconds) },
		);
	}

	try {
		const moderation = await openai.moderations.create({
			model: 'omni-moderation-latest',
			input: `${submission.title}\n${submission.summary}`,
		});
		if (moderation.results.some(({ flagged }) => flagged)) {
			return fail(
				400,
				'The quest board only takes friendly scrolls. Please rephrase and try again.',
			);
		}
	} catch (error) {
		// A real enquiry matters more than the filter; Max reads these himself.
		console.error('[quest] Contact moderation is unavailable, sending anyway:', error);
	}

	const delivery = await deliverQuestEmail(buildQuestEmail(submission));
	if (delivery.ok) return reply({ ok: true });
	if (delivery.reason === 'not-configured') {
		return fail(503, `Sending is not set up yet. Email Max directly at ${directEmail}.`);
	}
	return fail(
		503,
		`The scroll could not be sent just now. Try again later, or email Max directly at ${directEmail}.`,
	);
}
