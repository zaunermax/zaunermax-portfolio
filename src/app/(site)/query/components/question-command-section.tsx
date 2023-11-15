import {
	BlankTerminalLine,
	TerminalOutput,
	TerminalLineProps,
	LoadingAnimation,
} from '@/components/visual-terminal';
import { TypeAnimation } from 'react-type-animation';
import { FormEvent, forwardRef, useCallback, useId } from 'react';
import { useQueryQuestion } from '../hooks';

export type QuestionCommandProps = TerminalLineProps & {
	handleInputFocus: () => void;
};

export const QuestionCommandSection = forwardRef<HTMLInputElement, QuestionCommandProps>(
	({ handleInputFocus, ...rest }: QuestionCommandProps, ref) => {
		const inputId = useId();

		const { askQuestion, question, answer, handleSetQuestion, resetState, isPending } =
			useQueryQuestion();

		const isAnswering = !!answer || isPending;

		const onHandleAnswerFinished = () => {
			if (!answer) return;
			resetState();
			handleInputFocus();
		};

		const handleSubmit = useCallback(
			(event: FormEvent<HTMLFormElement>) => {
				event.preventDefault();
				askQuestion(question);
			},
			[askQuestion, question],
		);

		return (
			<TerminalOutput {...rest} hasCursor={!isAnswering}>
				ask <span aria-hidden="true">{question}</span>
				<form onSubmit={handleSubmit} className={'sr-only'}>
					<label htmlFor={inputId} className={'sr-only'}>
						Type a question you like to ask about Max Zauner and then press ENTER to
						submit the question.
					</label>
					<input
						id={inputId}
						ref={ref}
						type="text"
						value={question}
						onChange={handleSetQuestion}
						className="sr-only"
					/>
				</form>
				{isAnswering ? <BlankTerminalLine /> : null}
				{isPending ? (
					<LoadingAnimation />
				) : answer ? (
					<TypeAnimation
						sequence={[answer, onHandleAnswerFinished]}
						speed={80}
						className="font-mono text-xs"
					/>
				) : null}
			</TerminalOutput>
		);
	},
);

QuestionCommandSection.displayName = 'QuestionCommand';
