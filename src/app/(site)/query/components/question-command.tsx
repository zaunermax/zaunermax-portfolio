import {
	BlankTerminalLine,
	TerminalOutput,
	TerminalLineProps,
	LoadingAnimation,
} from '@/components/visual-terminal';
import { TypeAnimation } from 'react-type-animation';
import { forwardRef, KeyboardEvent, useCallback, useId } from 'react';
import { useQueryQuestion } from '@/app/(site)/query/hooks';

export type QuestionCommandProps = TerminalLineProps & {
	handleInputFocus: () => void;
};

export const QuestionCommand = forwardRef<HTMLInputElement, QuestionCommandProps>(
	({ handleInputFocus, ...rest }: QuestionCommandProps, ref) => {
		const inputId = useId();

		const { askQuestion, question, answer, handleSetQuestion, resetState, isPending } =
			useQueryQuestion();

		const onKeyUp = useCallback(
			(event: KeyboardEvent) => {
				if (event.key !== 'Enter') return;
				askQuestion(question);
			},
			[question, askQuestion],
		);

		const isAnswering = !!answer || isPending;

		const onHandleAnswerFinished = () => {
			if (!answer) return;
			resetState();
			handleInputFocus();
		};

		return (
			<TerminalOutput {...rest} hasCursor={!isAnswering}>
				ask{' '}
				<span aria-hidden="true">
					<span aria-hidden="true">{question}</span>
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
						onKeyUp={onKeyUp}
						className="sr-only"
					/>
				</span>
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

QuestionCommand.displayName = 'QuestionCommand';
