import { tool, type TextStreamPart, type ToolSet } from 'ai';
import { contactDraft } from './contract';
import { QUEST_SCROLL_TOOL_DESCRIPTION, QUEST_TOOL } from './prompt.server';
import { sanitizeDraft } from './sanitize.server';

const EMPTY_DRAFT = sanitizeDraft({})!;

/**
 * The only tool the model gets. It runs on the server and merely returns the bounded draft, so the
 * conversation always has a tool result and a follow-up message works without client-side tool
 * handling. It has no side effects: sending happens through CONTACT_API after the visitor reviews it.
 */
export const questTools = {
	[QUEST_TOOL]: tool({
		description: QUEST_SCROLL_TOOL_DESCRIPTION,
		inputSchema: contactDraft,
		strict: true,
		execute: async (input) => sanitizeDraft(input) ?? EMPTY_DRAFT,
	}),
} satisfies ToolSet;

/**
 * Raw tool-call JSON never leaves the server: streamed argument deltas are dropped and the final
 * call carries the sanitized draft instead of what the model produced.
 */
export function sanitizeToolStream<TOOLS extends ToolSet>() {
	return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
		transform(part, controller) {
			switch (part.type) {
				case 'tool-input-start':
				case 'tool-input-delta':
				case 'tool-input-end':
					return;
				case 'tool-call':
					controller.enqueue({
						...part,
						input: part.invalid ? {} : (sanitizeDraft(part.input) ?? EMPTY_DRAFT),
					} as TextStreamPart<TOOLS>);
					return;
				default:
					controller.enqueue(part);
			}
		},
	});
}
