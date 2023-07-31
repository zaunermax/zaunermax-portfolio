'use client';

import { ChangeEvent, KeyboardEvent, useCallback } from 'react';
import { TypeAnimation } from 'react-type-animation';
import { LoadingAnimation, VisualTerminal } from '@/components/visual-terminal';
import { HelpSection } from './help-section';
import { Answers } from './answers';
import { QuestionCommand } from './question-command';
import { useFocusableInputRef, useQueryQuestion } from '../hooks';

const modelName = 'max-q-learning-16k-0623';

export const QuestionSection = () => {
	const { inputRef, handleInputFocus } = useFocusableInputRef();
	const {
		ask,
		question,
		setQuestion,
		answer,
		setAnswer,
		answers,
		setAnswers,
		isPending,
	} = useQueryQuestion();

	const onChange = useCallback(
		({ target }: ChangeEvent<HTMLInputElement>) => setQuestion(target.value),
		[setQuestion],
	);

	const onKeyUp = useCallback(
		(event: KeyboardEvent) => {
			if (event.key !== 'Enter') return;
			ask(question);
		},
		[question, ask],
	);

	// no need for useCallback -> TypeAnimation is hard-memoized on first render
	const onHandleAnswerFinished = () => {
		if (!answer) return;
		setAnswers((answers) => answers.concat({ answer, question }));
		setAnswer('');
		setQuestion('');
		handleInputFocus();
	};

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
						className="fixed left-[-999999px] text-xl"
					/>
				</QuestionCommand>
			</VisualTerminal>
		</div>
	);
};