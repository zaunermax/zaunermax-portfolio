'use client';

import { ChangeEvent, FormEvent, useCallback, useState, useTransition } from 'react';
import { askQuestion } from '@/server-actions/ask-question';

export const QuestionSection = () => {
	const [question, setQuestion] = useState('');
	const [answer, setAnswer] = useState('');
	const [isPending, startTransition] = useTransition();

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
		<>
			<form onSubmit={ask}>
				<input onChange={onChange} value={question} />
				<button type={'submit'}>Ask</button>
			</form>
			{isPending ? <div>Loading...</div> : answer ? <div>Answer: {answer}</div> : null}
		</>
	);
};
