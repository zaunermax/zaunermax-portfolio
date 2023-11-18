import {
	BlankTerminalLine,
	TerminalOutput,
	TerminalLineProps,
	LoadingAnimation,
} from '@/components/visual-terminal';
import { forwardRef, useId } from 'react';
import { useQueryQuestion } from '../hooks';

export type QuestionCommandProps = TerminalLineProps & {
	handleInputFocus: () => void;
};

export const QuestionCommandSection = forwardRef<HTMLInputElement, QuestionCommandProps>(
	({ handleInputFocus, ...rest }: QuestionCommandProps, ref) => {
		const inputId = useId();

		const { question, handleSubmit, handleSetQuestion, isAnswering, completion } =
			useQueryQuestion();

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
				{isAnswering ? (
					<>
						<BlankTerminalLine />
						{!completion || completion.length === 0 ? <LoadingAnimation /> : completion}
					</>
				) : null}
			</TerminalOutput>
		);
	},
);

QuestionCommandSection.displayName = 'QuestionCommand';
