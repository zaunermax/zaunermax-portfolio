'use client';

import { useCompletion } from '@ai-sdk/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { questionSchema } from '@/lib/question-schema';
import { getSuggestions } from '@/lib/get-suggestions';

export type AskEntry = { question: string; answer: string; failed?: boolean };

function errorMessage(error: unknown) {
	if (error instanceof Error) {
		try {
			const body = JSON.parse(error.message);
			if (typeof body.message === 'string') return body.message as string;
		} catch {
			/* A stream error need not contain JSON. */
		}
	}
	return 'The answer did not come through. Ask again in a moment.';
}

/**
 * The same question-answer flow as /query, without its terminal UI:
 * one question in flight, a local transcript, and CMS-backed example questions.
 */
export function useAsk() {
	const [history, setHistory] = useState<AskEntry[]>([]);
	const [pending, setPending] = useState<string | null>(null);
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const inFlight = useRef(false);
	const { completion, complete, stop, isLoading } = useCompletion({ streamProtocol: 'text' });

	const ask = useCallback(
		async (raw: string) => {
			if (inFlight.current) return;
			const parsed = questionSchema.safeParse(raw);
			if (!parsed.success) {
				setHistory((h) => [
					...h,
					{ question: raw, answer: parsed.error.issues[0].message, failed: true },
				]);
				return;
			}
			inFlight.current = true;
			setPending(parsed.data);
			try {
				const answer = await complete(parsed.data);
				if (answer != null) setHistory((h) => [...h, { question: parsed.data, answer }]);
			} catch (error) {
				setHistory((h) => [
					...h,
					{ question: parsed.data, answer: errorMessage(error), failed: true },
				]);
			} finally {
				inFlight.current = false;
				setPending(null);
			}
		},
		[complete],
	);

	const refreshSuggestions = useCallback(async (refresh = false) => {
		try {
			setSuggestions(await getSuggestions({ mode: 'short', refresh }));
		} catch {
			setSuggestions([]);
		}
	}, []);

	useEffect(() => {
		void refreshSuggestions();
	}, [refreshSuggestions]);

	useEffect(() => () => stop(), [stop]);

	return {
		ask,
		history,
		/** The question currently being answered, if any. */
		pending,
		/** Streamed text of the answer in progress. */
		streaming: completion,
		isAnswering: isLoading || pending !== null,
		suggestions,
		refreshSuggestions,
	};
}
