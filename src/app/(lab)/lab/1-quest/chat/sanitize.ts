import 'server-only';
import type { ContactDraft } from './contract';

/** Caps for drafted scroll fields. They match what CONTACT_API accepts, except the shorter summary. */
export const DRAFT_LIMITS = {
	title: 60,
	name: 80,
	email: 120,
	company: 80,
	summary: 800,
	timeline: 80,
	budget: 80,
} as const satisfies Record<keyof ContactDraft, number>;

// C0/C1 controls, Unicode line separators and bidi overrides: nothing that may break a header line.
const LINE_BREAKERS =
	/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]+/g;
// The same set minus tab and newline, for multi-line text.
const CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

/** Cuts to `max` UTF-16 units (what zod's `.max()` counts) without splitting a surrogate pair. */
export function clip(value: string, max: number) {
	if (value.length <= max) return value;
	const cut = value.slice(0, max);
	return /[\ud800-\udbff]$/.test(cut) ? cut.slice(0, -1) : cut;
}

/** One line of plain text: no CR/LF or other control characters, collapsed whitespace. */
export function singleLine(value: string, max: number) {
	return clip(value.replace(LINE_BREAKERS, ' ').replace(/\s+/g, ' ').trim(), max).trim();
}

/** Plain text that keeps paragraphs but drops control characters. */
export function multiLine(value: string, max: number) {
	const text = value
		.replace(/\r\n?|[\u2028\u2029]/g, '\n')
		.replace(CONTROLS, '')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return clip(text, max).trim();
}

/**
 * Normalises anything shaped like a scroll draft (model tool input, or a draft echoed back by the
 * client) into a bounded `ContactDraft`. Missing or non-string fields become empty strings.
 */
export function sanitizeDraft(value: unknown): ContactDraft | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	const field = (key: keyof ContactDraft) =>
		typeof record[key] === 'string' ? (record[key] as string) : '';
	return {
		title: singleLine(field('title'), DRAFT_LIMITS.title),
		name: singleLine(field('name'), DRAFT_LIMITS.name),
		email: singleLine(field('email'), DRAFT_LIMITS.email).replace(/\s/g, ''),
		company: singleLine(field('company'), DRAFT_LIMITS.company),
		summary: multiLine(field('summary'), DRAFT_LIMITS.summary),
		timeline: singleLine(field('timeline'), DRAFT_LIMITS.timeline),
		budget: singleLine(field('budget'), DRAFT_LIMITS.budget),
	};
}
