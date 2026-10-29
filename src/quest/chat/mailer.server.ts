import { business } from '@/lab-shared/content';
import type { ContactSubmission } from './contract';
import { multiLine, singleLine } from './sanitize.server';

export type QuestEmail = {
	from: string;
	to: string[];
	reply_to: string;
	subject: string;
	text: string;
};

export type DeliveryResult =
	| { ok: true; via: 'resend' | 'console' }
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

/** Sends via Resend; unconfigured local development uses the console. */
export async function deliverQuestEmail(email: QuestEmail): Promise<DeliveryResult> {
	const apiKey = process.env.RESEND_API_KEY?.trim();
	if (!apiKey || !email.from) {
		if (import.meta.env.DEV) {
			console.info('[quest] Local contact email:', email);
			return { ok: true, via: 'console' };
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
