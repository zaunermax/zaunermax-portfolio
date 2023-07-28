'use client';

import {
	ChangeEvent,
	PropsWithChildren,
	SyntheticEvent,
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
	LoadingAnimation,
	TerminalLine,
	TerminalLineProps,
	VisualTerminal,
} from '@/components/visual-terminal';

type QuestionCommandProps = TerminalLineProps &
	PropsWithChildren & {
		question: string;
		newline?: boolean;
	};

const QuestionCommand = ({
	question,
	newline = false,
	children,
	...rest
}: QuestionCommandProps) => {
	return (
		<TerminalLine {...rest}>
			ask {question}
			{newline ? <BlankTerminalLine /> : null}
			{children}
		</TerminalLine>
	);
};

type AnswersProps = {
	answers: { answer: string; question: string }[];
};

const Answers = ({ answers }: AnswersProps) => {
	return answers.map(({ question, answer }, idx) => (
		<TerminalLine key={idx}>
			ask {question}
			<BlankTerminalLine />
			{answer}
		</TerminalLine>
	));
};

const HelpSection = () => {
	return (
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
			<BlankTerminalLine />
			<div>You can click the examples for quick fill in</div>
		</TerminalLine>
	);
};

const modelName = 'max-q-learning-16k-0623';

export const QuestionSection = ({ children }: PropsWithChildren) => {
	const rawSearchParams = useSearchParams();
	const searchParams = new URLSearchParams(rawSearchParams);
	const queryQuestion = searchParams.get('q') || '';

	const [question, setQuestion] = useState(queryQuestion);
	const [answer, setAnswer] = useState('');
	const [isPending, startTransition] = useTransition();
	const [answers, setAnswers] = useState([] as { question: string; answer: string }[]);

	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setQuestion(queryQuestion);
	}, [queryQuestion]);

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

	const handleInputFocus = useCallback(() => {
		const ref = inputRef.current;

		if (!ref) return;

		const length = ref.value.length;

		ref.focus();
		ref.setSelectionRange(length, length);
	}, []);

	const isAnswering = !!answer || isPending;

	return (
		<div className="m-auto flex max-w-screen-lg flex-col space-y-2">
			<form onSubmit={ask} className="flex space-x-2">
				<Input onChange={onChange} value={question} />
				<Button type="submit" variant="secondary">
					Ask
				</Button>
			</form>
			{children}
			<VisualTerminal
				title={modelName}
				onClick={handleInputFocus}
				className="drop-shadow-2xl"
			>
				<HelpSection />
				<Answers answers={answers} />
				<QuestionCommand
					question={question}
					newline={isAnswering}
					hasCursor={!isAnswering}
				>
					{isPending ? (
						<LoadingAnimation />
					) : answer ? (
						<TypeAnimation
							sequence={[
								answer,
								() => {
									if (!answer) return;
									setAnswers((answers) => answers.concat({ answer, question }));
									setAnswer('');
									setQuestion('');
								},
							]}
							speed={80}
							className="font-mono text-xs"
						/>
					) : null}
					<input
						ref={inputRef}
						type="text"
						value={question}
						onChange={(e) => setQuestion(e.target.value)}
						onKeyUp={(event) => {
							if (event.key !== 'Enter') return;
							ask(event);
						}}
						className="fixed top-[-1000px]"
					/>
				</QuestionCommand>
			</VisualTerminal>
		</div>
	);
};
