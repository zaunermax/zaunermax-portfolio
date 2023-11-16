import { useSearchParams } from 'next/navigation';
import { ChangeEvent, useCallback, useEffect, useState, useTransition } from 'react';
import { doFetch } from '@/lib/fetch-utils';
import {
	answerAtom,
	answersAtom,
	isAnsweringAtom,
} from '@/app/(site)/query/atoms/answers.atom';
import { useSetAtom, useAtom } from 'jotai';

export const useQueryQuestion = () => {
	const rawSearchParams = useSearchParams();
	const searchParams = new URLSearchParams(rawSearchParams ?? '');
	const queryQuestion = searchParams.get('q') ?? '';

	const [question, setQuestion] = useState(queryQuestion);
	const [isPending, startTransition] = useTransition();

	const [answer, setAnswer] = useAtom(answerAtom);

	const setAnswers = useSetAtom(answersAtom);
	const setIsAnswering = useSetAtom(isAnsweringAtom);

	const isAnswering = !!answer || isPending;

	useEffect(() => {
		setIsAnswering(isAnswering);
	}, [isAnswering, setIsAnswering]);

	const askQuestion = useCallback(
		(question: string) => {
			if (question.length > 100)
				return setAnswers((answers) =>
					answers.concat({
						answer: 'Your question cannot have more than 100 characters 🤷',
						question,
					}),
				);

			startTransition(async () => {
				const { message } = await doFetch<{ message: string }>({
					url: `/api/question?q=${question}`,
					defaultValue: { message: 'Something went wrong 😢' },
				});

				setAnswer(message);
			});
		},
		[setAnswer, setAnswers],
	);

	useEffect(() => {
		if (!queryQuestion) return;
		setQuestion(queryQuestion);
		askQuestion(queryQuestion);
	}, [askQuestion, queryQuestion]);

	const handleSetQuestion = useCallback(
		({ target }: ChangeEvent<HTMLInputElement>) => setQuestion(target.value),
		[setQuestion],
	);

	const resetState = useCallback(() => {
		setAnswers((answers) => answers.concat({ answer, question }));
		setAnswer('');
		setQuestion('');
	}, [answer, question, setAnswers]);

	return {
		askQuestion,
		question,
		handleSetQuestion,
		answer,
		resetState,
		isAnswering,
		isPending,
	};
};
