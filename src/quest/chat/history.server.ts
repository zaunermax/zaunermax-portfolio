import type { ModelMessage } from 'ai';
import { z } from 'zod';
import { CHAT_LIMITS, type ContactDraft } from './contract';
import { QUEST_TOOL } from './prompt.server';
import { clip, sanitizeDraft } from './sanitize.server';

/** Longest echoed reply of Max's we keep; real replies are capped at ~400 tokens. */
export const MAX_REPLY_CHARS = 2000;

/** Body of a `useChat` request. Unknown fields (id, trigger, tools, system...) are ignored. */
export const chatRequestSchema = z.object({
	messages: z
		.array(
			z.object({
				role: z.enum(['system', 'user', 'assistant']),
				parts: z.array(z.unknown()).max(40),
			}),
		)
		.min(1)
		.max(100),
});
type IncomingMessage = z.infer<typeof chatRequestSchema>['messages'][number];

const textPart = z.object({ type: z.literal('text'), text: z.string() });
const scrollPart = z.object({
	type: z.literal(`tool-${QUEST_TOOL}`),
	toolCallId: z.string().regex(/^[\w-]{1,128}$/),
	state: z.literal('output-available'),
	output: z.unknown(),
});

export type MaxSegment =
	| { type: 'text'; text: string }
	| { type: 'scroll'; toolCallId: string; draft: ContactDraft };
type VisitorTurn = { role: 'visitor'; text: string };
export type Turn = VisitorTurn | { role: 'max'; segments: MaxSegment[] };

export type HistoryResult =
	| { ok: true; turns: Turn[] }
	| { ok: false; reason: 'message-too-long' | 'no-visitor-message' };

function visitorTurn(message: IncomingMessage): VisitorTurn | null {
	const text = message.parts
		.flatMap((part) => {
			const parsed = textPart.safeParse(part);
			return parsed.success ? [parsed.data.text] : [];
		})
		.join('\n')
		.trim();
	return text ? { role: 'visitor', text } : null;
}

/** Max's earlier turns are client-supplied, so only plain text and our own scroll tool survive. */
function maxTurn(message: IncomingMessage, seenCalls: Set<string>): Turn | null {
	const segments: MaxSegment[] = [];
	let budget = MAX_REPLY_CHARS;
	for (const part of message.parts) {
		const text = textPart.safeParse(part);
		if (text.success) {
			const value = clip(text.data.text.trim(), budget);
			if (!value) continue;
			budget -= value.length;
			const last = segments.at(-1);
			if (last?.type === 'text') last.text = `${last.text}\n\n${value}`;
			else segments.push({ type: 'text', text: value });
			continue;
		}
		const scroll = scrollPart.safeParse(part);
		if (scroll.success && !seenCalls.has(scroll.data.toolCallId)) {
			const draft = sanitizeDraft(scroll.data.output);
			if (!draft) continue;
			seenCalls.add(scroll.data.toolCallId);
			segments.push({ type: 'scroll', toolCallId: scroll.data.toolCallId, draft });
		}
		// Everything else (reasoning, files, sources, data, other tools, half-finished calls) is dropped.
	}
	return segments.length ? { role: 'max', segments } : null;
}

/**
 * Keeps the last `CHAT_LIMITS.historyMessages` messages, drops system messages and anything that
 * is not visitor text or Max's text/scroll, and rejects oversized visitor messages.
 */
export function readHistory(messages: IncomingMessage[]): HistoryResult {
	const turns: Turn[] = [];
	const seenCalls = new Set<string>();
	for (const message of messages.slice(-CHAT_LIMITS.historyMessages)) {
		if (message.role === 'user') {
			const turn = visitorTurn(message);
			if (turn && turn.text.length > CHAT_LIMITS.messageChars) {
				return { ok: false, reason: 'message-too-long' };
			}
			if (turn) turns.push(turn);
		} else if (message.role === 'assistant') {
			const turn = maxTurn(message, seenCalls);
			if (turn) turns.push(turn);
		}
		// role === 'system' never reaches the model: the instructions are server-defined.
	}
	if (turns.at(-1)?.role !== 'visitor')
		return { ok: false, reason: 'no-visitor-message' };
	return { ok: true, turns };
}

/** Text to moderate for a turn, including drafted scroll fields. */
export function turnText(turn: Turn) {
	if (turn.role === 'visitor') return turn.text;
	return turn.segments
		.map((segment) =>
			segment.type === 'text'
				? segment.text
				: Object.values(segment.draft).filter(Boolean).join('\n'),
		)
		.join('\n');
}

export function toModelMessages(turns: Turn[]): ModelMessage[] {
	const messages: ModelMessage[] = [];
	for (const turn of turns) {
		if (turn.role === 'visitor') {
			messages.push({ role: 'user', content: turn.text });
			continue;
		}
		let texts: string[] = [];
		for (const segment of turn.segments) {
			if (segment.type === 'text') {
				texts.push(segment.text);
				continue;
			}
			messages.push(
				{
					role: 'assistant',
					content: [
						...texts.map((text) => ({ type: 'text' as const, text })),
						{
							type: 'tool-call',
							toolCallId: segment.toolCallId,
							toolName: QUEST_TOOL,
							input: segment.draft,
						},
					],
				},
				{
					role: 'tool',
					content: [
						{
							type: 'tool-result',
							toolCallId: segment.toolCallId,
							toolName: QUEST_TOOL,
							output: { type: 'json', value: segment.draft },
						},
					],
				},
			);
			texts = [];
		}
		if (texts.length) messages.push({ role: 'assistant', content: texts.join('\n\n') });
	}
	return messages;
}
