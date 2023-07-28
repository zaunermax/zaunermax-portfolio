'use client';

import {
	ChangeEvent,
	PropsWithChildren,
	SyntheticEvent,
	KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
	useTransition,
} from 'react';
import { askQuestion } from '@/server-actions/ask-question';
import { useSearchParams } from 'next/navigation';
import { TypeAnimation } from 'react-type-animation';
import { LoadingAnimation, VisualTerminal } from '@/components/visual-terminal';
import { HelpSection } from './help-section';
import { Answers } from './answers';
import { QuestionCommand } from './question-command';

const modelName = 'max-q-learning-16k-0623';

export const QuestionSection = () => {
	const rawSearchParams = useSearchParams();
	const searchParams = new URLSearchParams(rawSearchParams);
	const queryQuestion = searchParams.get('q') || '';

	const [question, setQuestion] = useState(queryQuestion);
	const [answer, setAnswer] = useState('');
	const [isPending, startTransition] = useTransition();
	const [answers, setAnswers] = useState([] as { question: string; answer: string }[]);

	const inputRef = useRef<HTMLInputElement>(null);

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

	const onKeyUp = useCallback(
		(event: KeyboardEvent) => {
			if (event.key !== 'Enter') return;
			ask(event);
		},
		[ask],
	);

	const onHandleAnswerFinished = useCallback(() => {
		if (!answer) return;
		setAnswers((answers) => answers.concat({ answer, question }));
		setAnswer('');
		setQuestion('');
	}, [answer, question]);

	const handleInputFocus = useCallback(() => {
		const ref = inputRef.current;

		if (!ref) return;

		const length = ref.value.length;

		ref.focus();
		ref.setSelectionRange(length, length);
	}, []);

	useEffect(() => {
		setQuestion(queryQuestion);
		handleInputFocus();
	}, [handleInputFocus, queryQuestion]);

	const isAnswering = !!answer || isPending;

	return (
		<div className="m-auto flex max-w-screen-lg flex-col space-y-2">
			<VisualTerminal
				title={modelName}
				onClick={handleInputFocus}
				className="drop-shadow-2xl"
			>
				<HelpSection modelName={modelName} />
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
							sequence={[answer, onHandleAnswerFinished]}
							speed={80}
							className="font-mono text-xs"
						/>
					) : null}
					<input
						ref={inputRef}
						type="text"
						value={question}
						onChange={onChange}
						onKeyUp={onKeyUp}
						className="fixed top-[-1000px]"
					/>
				</QuestionCommand>
			</VisualTerminal>
		</div>
	);
};
