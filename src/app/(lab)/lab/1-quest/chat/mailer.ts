import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { business } from '../../_shared/content';
import type { ContactSubmission } from './contract';
import { multiLine, singleLine } from './sanitize';

export type QuestEmail = {
	from: string;
	to: string[];
	reply_to: string;
	subject: string;
	text: string;
};

export type DeliveryResult =
	| { ok: true; via: 'resend' | 'outbox'; file?: string }
	| { ok: false; reason: 'not-configured' | 'failed' };

const RESEND_URL = 'https://api.resend.com/emails';

function questRecipient() {
	return process.env.CONTACT_TO_EMAIL?.trim() || business.email;
}

/** Builds a plain-text email. Every value is normalised so nothing can add header lines. */
export function buildQuestEmail(
	submission: ContactSubmission,
	receivedAt = new Date(),
): QuestEmail {
	const line = (value: string, max = 120) => singleLine(value, max) || '-';
	const name = line(submission.name, 80);
	const text = [
		'A new quest scroll arrived through the quest board on your website.',
		'',
		`Title:    ${line(submission.title, 60)}`,
		`Name:     ${name}`,
		`Email:    ${submission.email}`,
		`Company:  ${line(submission.company, 80)}`,
		`Timeline: ${line(submission.timeline, 80)}`,
		`Budget:   ${line(submission.budget, 80)}`,
		'',
		'Summary:',
		multiLine(submission.summary, 1500),
		'',
		'--',
		`Received ${receivedAt.toISOString()}. Reply to this email to answer ${name}.`,
	].join('\n');
	return {
		from: process.env.CONTACT_FROM_EMAIL?.trim() ?? '',
		to: [questRecipient()],
		reply_to: submission.email,
		subject: singleLine(`Quest: ${submission.title}`, 120),
		text,
	};
}

async function writeOutbox(email: QuestEmail) {
	const dir = path.join(process.cwd(), '.data', 'quest', 'outbox');
	await mkdir(dir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const file = path.join(dir, `${stamp}-${randomUUID().slice(0, 8)}.json`);
	await writeFile(file, `${JSON.stringify(email, null, '\t')}\n`, 'utf8');
	console.info(`[quest] RESEND_API_KEY is not set; wrote the email to ${file}`);
	return file;
}

/**
 * Sends through the Resend REST API. Without RESEND_API_KEY and CONTACT_FROM_EMAIL the email goes to
 * `.data/quest/outbox/` in development and is refused in production.
 */
export async function deliverQuestEmail(email: QuestEmail): Promise<DeliveryResult> {
	const apiKey = process.env.RESEND_API_KEY?.trim();
	if (!apiKey || !email.from) {
		if (process.env.NODE_ENV === 'development') {
			return { ok: true, via: 'outbox', file: await writeOutbox(email) };
		}
		console.error(
			'[quest] Contact email is not configured (RESEND_API_KEY, CONTACT_FROM_EMAIL)',
		);
		return { ok: false, reason: 'not-configured' };
	}
	try {
		const response = await fetch(RESEND_URL, {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(email),
			signal: AbortSignal.timeout(10_000),
		});
		if (response.ok) return { ok: true, via: 'resend' };
		console.error(
			`[quest] Resend rejected the email: ${response.status}`,
			(await response.text().catch(() => '')).slice(0, 500),
		);
	} catch (error) {
		console.error('[quest] Resend is unreachable:', error);
	}
	return { ok: false, reason: 'failed' };
}
