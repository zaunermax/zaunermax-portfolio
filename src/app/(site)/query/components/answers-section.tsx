import { BlankTerminalLine, TerminalOutput } from '@/components/visual-terminal';
import type { AnswerType } from '../types/answer.type';

export function AnswersSection({ answers }: { answers: AnswerType[] }) {
	return answers.map(({ question, answer }, index) => (
		<TerminalOutput key={index}>
			ask {question}
			<BlankTerminalLine />
			<div className="break-words whitespace-pre-wrap">{answer}</div>
		</TerminalOutput>
	));
}
