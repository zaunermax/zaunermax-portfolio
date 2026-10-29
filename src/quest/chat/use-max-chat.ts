'use client';

import { Chat, useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useEffect, useState } from 'react';
import { getSuggestions } from '@/lib/get-suggestions';
import {
	CHAT_API,
	CHAT_LIMITS,
	CONTACT_API,
	contactDraft,
	type ChatLine,
	type ContactDraft,
	type ContactResult,
	type ContactSubmission,
} from './contract';

export type UseMaxChat = {
	lines: ChatLine[];
	/** Text of Max's reply while it streams; null when idle. */
	streaming: string | null;
	send: (text: string) => void;
	isBusy: boolean;
	error: string | null;
	/** Quick "gossip options" to click, e.g. from /api/suggestions plus a project opener. */
	suggestions: string[];
	stop: () => void;
};

const OPENERS = ['I have a project for you', 'What do you do these days?'];
const MAX_CMS_SUGGESTIONS = 3;
const SCROLL_PART = 'tool-offerQuestScroll';

function createChat() {
	return new Chat<UIMessage>({
		transport: new DefaultChatTransport({
			api: CHAT_API,
			// The server keeps the same window; sending less keeps requests small.
			prepareSendMessagesRequest: ({ messages }) => ({
				body: { messages: messages.slice(-CHAT_LIMITS.historyMessages) },
			}),
		}),
	});
}

// One conversation per page load, kept in memory only: walking away from Max and back keeps it.
let browserChat: Chat<UIMessage> | undefined;
function getChat() {
	if (typeof window === 'undefined') return createChat();
	return (browserChat ??= createChat());
}

let cmsSuggestions: Promise<string[]> | undefined;
function loadSuggestions() {
	cmsSuggestions ??= getSuggestions({ mode: 'short' }).catch(() => {
		cmsSuggestions = undefined;
		return [];
	});
	return cmsSuggestions;
}

function textOf(message: UIMessage) {
	return message.parts
		.flatMap((part) => (part.type === 'text' ? [part.text.trim()] : []))
		.filter(Boolean)
		.join('\n\n');
}

function draftOf(message: UIMessage): ContactDraft | undefined {
	for (const part of message.parts) {
		if (part.type !== SCROLL_PART || !('state' in part)) continue;
		const value =
			part.state === 'output-available'
				? part.output
				: part.state === 'input-available'
					? part.input
					: undefined;
		const parsed = contactDraft.safeParse(value);
		if (parsed.success) return parsed.data;
	}
	return undefined;
}

function toLines(messages: UIMessage[], skipId: string | null): ChatLine[] {
	return messages.flatMap((message): ChatLine[] => {
		if (message.id === skipId) return [];
		if (message.role === 'user') {
			const text = textOf(message);
			return text ? [{ id: message.id, role: 'visitor', text }] : [];
		}
		if (message.role !== 'assistant') return [];
		const text = textOf(message);
		const draft = draftOf(message);
		if (!text && !draft) return [];
		return [{ id: message.id, role: 'max', text, ...(draft ? { draft } : {}) }];
	});
}

function readError(error: Error | undefined): string | null {
	if (!error) return null;
	try {
		const body: unknown = JSON.parse(error.message);
		if (
			typeof body === 'object' &&
			body !== null &&
			'message' in body &&
			typeof body.message === 'string'
		) {
			return body.message;
		}
	} catch {
		// Not a JSON error body: a stream error carries the server's plain message.
	}
	if (error instanceof TypeError) {
		return "Couldn't reach Max's echo. Check your connection and try again.";
	}
	const text = error.message.trim();
	if (text && text.length <= 200 && !text.startsWith('<')) return text;
	return 'Something went wrong. Please try again.';
}

export function useMaxChat(): UseMaxChat {
	const [chat] = useState(getChat);
	const { messages, sendMessage, status, error, stop } = useChat({ chat });
	const [cms, setCms] = useState<string[]>([]);

	useEffect(() => {
		let active = true;
		void loadSuggestions().then((list) => {
			if (active) setCms(list);
		});
		return () => {
			active = false;
		};
	}, []);

	const isBusy = status === 'submitted' || status === 'streaming';
	const last = messages.at(-1);
	const inProgress = isBusy && last?.role === 'assistant' ? last : null;

	const send = (raw: string) => {
		const text = raw.trim().slice(0, CHAT_LIMITS.messageChars);
		if (!text || isBusy) return;
		void sendMessage({ text });
	};

	const suggestions = [...new Set([...OPENERS, ...cms.slice(0, MAX_CMS_SUGGESTIONS)])];

	return {
		lines: toLines(messages, inProgress?.id ?? null),
		streaming: isBusy ? (inProgress ? textOf(inProgress) : '') : null,
		send,
		isBusy,
		error: readError(error),
		suggestions,
		stop: () => void stop(),
	};
}

export async function sendQuest(submission: ContactSubmission): Promise<ContactResult> {
	try {
		const response = await fetch(CONTACT_API, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(submission),
		});
		const body: unknown = await response.json().catch(() => null);
		if (
			response.ok &&
			typeof body === 'object' &&
			body !== null &&
			'ok' in body &&
			body.ok
		) {
			return { ok: true };
		}
		const message =
			typeof body === 'object' &&
			body !== null &&
			'message' in body &&
			typeof body.message === 'string'
				? body.message
				: 'The quest board did not take the scroll. Please try again in a moment.';
		return { ok: false, message };
	} catch {
		return {
			ok: false,
			message: "Couldn't reach the quest board. Check your connection and try again.",
		};
	}
}
