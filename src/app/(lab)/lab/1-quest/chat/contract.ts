import { z } from 'zod';

/**
 * Talking to Max's NPC: a chat agent that answers from Max's CMS context and, when a visitor
 * has a project, drafts a quest scroll. The agent can only draft. The visitor reviews the scroll
 * and sends it through CONTACT_API, which never involves the model.
 */

export const CHAT_API = '/api/lab/quest/chat';
export const CONTACT_API = '/api/lab/quest/contact';

export const CHAT_LIMITS = {
	messageChars: 500,
	/** Messages kept and sent to the model; older ones are dropped server-side too. */
	historyMessages: 12,
} as const;

/** Tool input of `offerQuestScroll`. Empty strings mean "not mentioned yet". */
export const contactDraft = z.object({
	title: z.string().describe('Short quest title for the project, max 60 characters'),
	name: z.string().describe("Visitor's name if they gave it, else empty"),
	email: z.string().describe("Visitor's email if they gave it, else empty"),
	company: z.string().describe('Company or organisation if mentioned, else empty'),
	summary: z
		.string()
		.describe('What the visitor wants built, in their own terms, max 800 characters'),
	timeline: z.string().describe('Timeline if mentioned, else empty'),
	budget: z.string().describe('Budget if mentioned, else empty'),
});
export type ContactDraft = z.infer<typeof contactDraft>;

/** What the visitor actually sends after reviewing the scroll. */
export const contactSubmission = z.object({
	title: z.string().trim().min(3).max(60),
	name: z.string().trim().min(1).max(80),
	email: z.email().max(120),
	company: z.string().trim().max(80),
	summary: z.string().trim().min(20).max(1500),
	timeline: z.string().trim().max(80),
	budget: z.string().trim().max(80),
	/** Honeypot: hidden from people, must stay empty. */
	website: z.string().max(0),
	/** Milliseconds the form was open before sending; bots send instantly. */
	elapsedMs: z.number().int().min(0),
});
export type ContactSubmission = z.infer<typeof contactSubmission>;

export type ContactResult = { ok: true } | { ok: false; message: string };

export type ChatLine = {
	id: string;
	role: 'visitor' | 'max';
	text: string;
	/** Present when Max offered a quest scroll in this turn. */
	draft?: ContactDraft;
};
