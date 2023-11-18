import { useSearchParams } from 'next/navigation';
import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import { answersAtom, isAnsweringAtom } from '@/app/(site)/query/atoms/answers.atom';
import { useSetAtom } from 'jotai';
import { useCompletion } from 'ai/react';

const safeJsonParse = <T>(json: string) => {
	try {
		return JSON.parse(json) as T;
	} catch {
		return null;
	}
};

export const useQueryQuestion = () => {
	const rawSearchParams = useSearchParams();
	const searchParams = new URLSearchParams(rawSearchParams ?? '');
	const queryQuestion = searchParams.get('q') ?? '';

	const setIsAnswering = useSetAtom(isAnsweringAtom);
	const setAnswers = useSetAtom(answersAtom);

	const [question, setQuestion] = useState('');
	const [error, setError] = useState('');

	const resetState = useCallback(() => {
		setQuestion('');
		setError('');
		setIsAnswering(false);
	}, [setIsAnswering]);

	const onResponse = useCallback(() => {
		setIsAnswering(true);
	}, [setIsAnswering]);

	const onFinish = useCallback(
		(prompt: string, completion: string) => {
			setAnswers((answers) => answers.concat({ question: prompt, answer: completion }));
			resetState();
		},
		[resetState, setAnswers],
	);

	const onError = useCallback((error: Error) => {
		const parsedError = safeJsonParse<{ message: string }>(error?.message ?? '');
		setError(parsedError?.message ?? 'Something went wrong 😭');
	}, []);

	const {
		completion,
		isLoading: isAnswering,
		complete,
		stop,
	} = useCompletion({
		onResponse,
		onFinish,
		onError,
	});

	const handleSetQuestion = useCallback((e: ChangeEvent<HTMLInputElement>) => {
		setQuestion(e.target.value);
	}, []);

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			console.log(`question? ${question}`);
			complete(question);
		},
		[question, complete],
	);

	useEffect(() => {
		if (!queryQuestion) return;
		setQuestion(queryQuestion);
		complete(queryQuestion);
	}, [queryQuestion, complete, setQuestion]);

	useEffect(() => {
		if (!error) return;
		stop();
		setAnswers((answers) => answers.concat({ question, answer: error }));
		resetState();
	}, [error, question, resetState, setAnswers, stop]);

	useEffect(() => {
		return () => stop();
	}, [stop]);

	return {
		question,
		handleSubmit,
		handleSetQuestion,
		isAnswering,
		completion,
	};
};
