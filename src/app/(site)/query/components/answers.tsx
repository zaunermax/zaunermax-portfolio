import { BlankTerminalLine, TerminalOutput } from '@/components/visual-terminal';

type AnswersProps = {
	answers: { answer: string; question: string }[];
};

export const Answers = ({ answers }: AnswersProps) => {
	return answers.map(({ question, answer }, idx) => (
		<TerminalOutput key={idx}>
			ask {question}
			<BlankTerminalLine />
			{answer}
		</TerminalOutput>
	));
};
