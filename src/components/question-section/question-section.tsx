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
import { TypeAnimation } from 'react-type-animation';

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
		<div className="m-auto flex max-w-screen-lg flex-col space-y-2">
			<form onSubmit={ask} className="flex space-x-2">
				<Input onChange={onChange} value={question} />
				<Button type="submit" variant="secondary">
					Ask
				</Button>
			</form>
			{children}
			<div className="pt-5">
				<div className="mt-15 mx-auto w-full max-w-xl rounded-lg bg-black p-6 text-white shadow-md">
					<div className="flex items-center justify-between">
						<div className="flex items-center space-x-2 text-xs">
							<div className="h-3 w-3 rounded-full bg-red-500"></div>
							<div className="h-3 w-3 rounded-full bg-yellow-500"></div>
							<div className="h-3 w-3 rounded-full bg-green-500"></div>
						</div>
						<span className="font-mono text-sm">text-damaxi-7.2</span>
					</div>
					<div className="mt-4 space-y-2">
						{isPending ? (
							<p className="font-mono text-xs">$ Loading...</p>
						) : (
							<p className="font-mono text-xs">
								${' '}
								<TypeAnimation
									sequence={[answer]}
									speed={80}
									className="font-mono text-xs"
								/>
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
