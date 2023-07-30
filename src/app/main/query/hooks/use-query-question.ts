import { useSearchParams } from 'next/navigation';
import { SyntheticEvent, useCallback, useEffect, useState, useTransition } from 'react';
import { askQuestion } from '@/server-actions/ask-question';

export const useQueryQuestion = () => {
	const rawSearchParams = useSearchParams();
	const searchParams = new URLSearchParams(rawSearchParams);
	const queryQuestion = searchParams.get('q') || '';

	const [question, setQuestion] = useState(queryQuestion);
	const [answer, setAnswer] = useState('');
	const [isPending, startTransition] = useTransition();

	const ask = useCallback(
		(e?: SyntheticEvent) => {
			e?.preventDefault();
			startTransition(async () => {
				const answer = await askQuestion(question);
				setAnswer(answer);
			});
		},
		[question],
	);

	useEffect(() => {
		setQuestion(queryQuestion);
		startTransition(async () => {
			const answer = await askQuestion(queryQuestion);
			setAnswer(answer);
		});
	}, [queryQuestion]);

	return {
		question,
		setQuestion,
		ask,
		answer,
		setAnswer,
		isPending,
	};
};
