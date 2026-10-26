'use client';

import { useSearchParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useCompletion } from '@ai-sdk/react';
import { useAnswerHistory } from '../components/answer-history';
import { questionSchema } from '@/lib/question-schema';

function errorMessage(error: Error) {
	try {
		const body = JSON.parse(error.message);
		if (typeof body.message === 'string') return body.message;
	} catch {
		/* A stream error need not contain JSON. */
	}
	return 'Something went wrong. Please try again 😭';
}

export function useQueryQuestion() {
	const queryQuestion = useSearchParams().get('q') ?? '';
	const [question, setQuestion] = useState('');
	const [submittedQuestion, setSubmittedQuestion] = useState('');
	const { answers, setAnswers } = useAnswerHistory();
	const inFlight = useRef(false);
	const lastQuery = useRef<string | null>(null);
	const activePrompt = useRef('');
	const { completion, complete, stop, isLoading } = useCompletion({
		streamProtocol: 'text',
		onError(error) {
			setAnswers((previous) => [
				...previous,
				{ question: activePrompt.current, answer: errorMessage(error) },
			]);
		},
	});

	const ask = useCallback(
		async (rawQuestion: string) => {
			if (inFlight.current) return;
			const parsed = questionSchema.safeParse(rawQuestion);
			if (!parsed.success) {
				setAnswers((previous) => [
					...previous,
					{ question: rawQuestion, answer: parsed.error.issues[0].message },
				]);
				return;
			}
			const prompt = parsed.data;
			inFlight.current = true;
			activePrompt.current = prompt;
			setSubmittedQuestion(prompt);
			setQuestion('');
			try {
				// useCompletion submits only this prompt; the transcript stays in this component.
				const answer = await complete(prompt);
				if (answer != null)
					setAnswers((previous) => [...previous, { question: prompt, answer }]);
			} catch (error) {
				setAnswers((previous) => [
					...previous,
					{
						question: prompt,
						answer: errorMessage(error instanceof Error ? error : new Error()),
					},
				]);
			} finally {
				inFlight.current = false;
			}
		},
		[complete, setAnswers],
	);

	useEffect(() => {
		if (!queryQuestion || lastQuery.current === queryQuestion || inFlight.current) return;
		// Defer initial auto-submit so Strict Mode can clean up its first effect.
		const timer = setTimeout(() => {
			lastQuery.current = queryQuestion;
			void ask(queryQuestion);
		}, 0);
		return () => clearTimeout(timer);
	}, [queryQuestion, ask, isLoading]);

	useEffect(() => () => stop(), [stop]);

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void ask(question);
	};

	return {
		question,
		setQuestion,
		submittedQuestion,
		handleSubmit,
		isAnswering: isLoading,
		completion,
		answers,
	};
}
