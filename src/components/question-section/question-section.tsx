'use client';

import {
	ChangeEvent,
	FormEvent,
	LegacyRef,
	PropsWithChildren,
	useCallback,
	useEffect,
	useRef,
	useState,
	useTransition,
} from 'react';
import { askQuestion } from '@/server-actions/ask-question';
import { useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TypeAnimation } from 'react-type-animation';
import {
	BlankTerminalLine,
	TerminalLine,
	VisualTerminal,
} from '@/components/visual-terminal';

const modelName = 'max-q-learning-16k-0623';

export const QuestionSection = ({ children }: PropsWithChildren) => {
	const rawSearchParams = useSearchParams();
	const searchParams = new URLSearchParams(rawSearchParams);
	const queryQuestion = searchParams.get('q') || '';

	const [question, setQuestion] = useState(queryQuestion);
	const [answer, setAnswer] = useState('');
	const [isPending, startTransition] = useTransition();
	const [answers, setAnswers] = useState([] as string[]);
	const inputRef = useRef<HTMLInputElement>(null);

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
			<VisualTerminal title={modelName}>
				<TerminalLine>
					ask --help
					<BlankTerminalLine />
					<div>Usage: ask QUESTION</div>
					<BlankTerminalLine />
					<div>LLM &quot;{modelName}&quot;: answering questions about max</div>
					<BlankTerminalLine />
					<div>Example: ask What is Max Zauner&#39;s area of expertise?</div>
					<div>Example: ask What kind of projects did Max Zauner work on?</div>
					<div>Example: ask What are Max Zauner&#39;s interests?</div>
				</TerminalLine>
				{answers.map((answer, idx) => (
					<TerminalLine key={idx}>{answer}</TerminalLine>
				))}
				{isPending ? (
					<TerminalLine>Loading...</TerminalLine>
				) : answer ? (
					<TerminalLine>
						<TypeAnimation
							sequence={[
								answer,
								() => {
									if (!answer) return;
									setAnswers((answers) => answers.concat(answer));
									setAnswer('');
								},
							]}
							speed={80}
							className="font-mono text-xs"
						/>
					</TerminalLine>
				) : null}
				<TerminalLine onClick={() => inputRef.current?.focus()}>
					{question}
					<input
						ref={inputRef}
						type="text"
						value={question}
						onChange={(e) => setQuestion(e.target.value)}
						onKeyUp={() => {}}
						className="fixed left-[-1000px]"
					/>
				</TerminalLine>
			</VisualTerminal>
		</div>
	);
};
