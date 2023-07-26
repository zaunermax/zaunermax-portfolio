'use client';

import {
	ChangeEvent,
	FormEvent,
	PropsWithChildren,
	useCallback,
	useEffect,
	useState,
	useTransition,
} from 'react';
import { askQuestion } from '@/server-actions/ask-question';
import { useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export const QuestionSection = ({ children }: PropsWithChildren) => {
	const rawSearchParams = useSearchParams();
	const searchParams = new URLSearchParams(rawSearchParams);
	const queryQuestion = searchParams.get('q') || '';

	const [question, setQuestion] = useState(queryQuestion);
	const [answer, setAnswer] = useState('');
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		setQuestion(queryQuestion);
	}, [queryQuestion]);

	const ask = useCallback(
		(e: FormEvent<HTMLFormElement>) => {
			e.preventDefault();
			startTransition(async () => {
				const answer = await askQuestion(question);
				setAnswer(answer);
			});
		},
		[question],
	);

	const onChange = useCallback(
		({ target }: ChangeEvent<HTMLInputElement>) => setQuestion(target.value),
		[],
	);

	return (
		<div className="flex flex-col space-y-2">
			<form onSubmit={ask} className="flex space-x-2">
				<Input onChange={onChange} value={question} />
				<Button type="submit" variant="secondary">
					Ask
				</Button>
			</form>
			{children}
			{isPending ? <div>Loading...</div> : answer ? <div>Answer: {answer}</div> : null}
		</div>
	);
};
