'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
	ChangeEvent,
	PropsWithChildren,
	SyntheticEvent,
	useCallback,
	useState,
	useTransition,
} from 'react';
import { askQuestion } from '@/server-actions/ask-question';
import { useSearchParams } from 'next/navigation';

export const NonNerdQuestionSection = ({ children }: PropsWithChildren) => {
	const rawSearchParams = useSearchParams();
	const searchParams = new URLSearchParams(rawSearchParams);
	const queryQuestion = searchParams.get('q') || '';

	const [isPending, startTransition] = useTransition();
	const [question, setQuestion] = useState(queryQuestion);
	const [answer, setAnswer] = useState('');

	const ask = useCallback(
		(e: SyntheticEvent) => {
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
		<div className="m-auto flex max-w-screen-lg flex-col space-y-2">
			<form onSubmit={ask} className="flex space-x-2">
				<Input onChange={onChange} value={question} />
				<Button type="submit" variant="secondary">
					Ask
				</Button>
			</form>
			{children}
			<div>{isPending ? 'Loading...' : answer}</div>
		</div>
	);
};
