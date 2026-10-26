import {
	BlankTerminalLine,
	TerminalOutput,
	LoadingAnimation,
} from '@/components/visual-terminal';
import { type Ref, useId } from 'react';
import type { useQueryQuestion } from '../hooks';

type Props = ReturnType<typeof useQueryQuestion> & { ref: Ref<HTMLInputElement> };

export function QuestionCommandSection({
	ref,
	question,
	setQuestion,
	submittedQuestion,
	handleSubmit,
	isAnswering,
	completion,
}: Props) {
	const inputId = useId();
	return (
		<TerminalOutput hasCursor={!isAnswering}>
			ask <span aria-hidden="true">{isAnswering ? submittedQuestion : question}</span>
			<form onSubmit={handleSubmit} className="sr-only">
				<label htmlFor={inputId}>Type a question about Max Zauner and press ENTER.</label>
				<input
					id={inputId}
					ref={ref}
					name="question"
					type="text"
					value={question}
					onChange={(event) => setQuestion(event.target.value)}
					maxLength={100}
					disabled={isAnswering}
					autoComplete="off"
					autoCapitalize="sentences"
					spellCheck={false}
				/>
			</form>
			{isAnswering && (
				<div role="status" aria-label="Answering">
					<BlankTerminalLine />
					<div className="break-words whitespace-pre-wrap">
						{completion || <LoadingAnimation />}
					</div>
				</div>
			)}
		</TerminalOutput>
	);
}
