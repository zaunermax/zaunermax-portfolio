import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { askQuestion } from '@/server-actions/ask-question';

export const useQueryQuestion = () => {
	const rawSearchParams = useSearchParams();
	const searchParams = new URLSearchParams(rawSearchParams);
	const queryQuestion = searchParams.get('q') || '';

	const [question, setQuestion] = useState(queryQuestion);
	const [answer, setAnswer] = useState('');
	const [isPending, startTransition] = useTransition();
	const [answers, setAnswers] = useState([] as { question: string; answer: string }[]);

	const ask = useCallback((question: string) => {
		if (question.length > 100)
			return setAnswers((answers) =>
				answers.concat({
					answer: 'Your question cannot have more than 100 characters 🤷',
					question,
				}),
			);

		startTransition(async () => {
			const answer = await askQuestion(question);
			setAnswer(answer);
		});
	}, []);

	useEffect(() => {
		if (!queryQuestion) return;
		setQuestion(queryQuestion);
		ask(queryQuestion);
	}, [ask, queryQuestion]);

	return {
		ask,
		question,
		setQuestion,
		answer,
		setAnswer,
		answers,
		setAnswers,
		isPending,
	};
};
