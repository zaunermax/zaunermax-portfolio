'use client';

import { useCallback, useState, useTransition } from 'react';
import { askQuestion } from '@/server-actions/ask-question';

export default function Home() {
	const [question, setQuestion] = useState('');
	const [answer, setAnswer] = useState('');
	const [isPending, startTransition] = useTransition();

	const ask = useCallback(() => {
		startTransition(async () => {
			const answer = await askQuestion(question);
			setAnswer(answer);
		});
	}, [question]);

	return (
		<div>
			<div>Welcome to my page :)</div>
			<input onChange={(event) => setQuestion(event.target.value)} value={question} />
			<button onClick={ask}>Ask</button>
			{isPending ? <div>Loading...</div> : answer ? <div>Answer: {answer}</div> : null}
		</div>
	);
}
