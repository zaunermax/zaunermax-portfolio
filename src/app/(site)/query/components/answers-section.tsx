import { BlankTerminalLine, TerminalOutput } from '@/components/visual-terminal';
import { memo } from 'react';
import { useAtom } from 'jotai';
import { answersAtom } from '../atoms/answers.atom';

export const AnswersSection = memo(() => {
	const [answers] = useAtom(answersAtom);

	return answers.map(({ question, answer }, idx) => (
		<TerminalOutput key={idx}>
			ask {question}
			<BlankTerminalLine />
			{answer}
		</TerminalOutput>
	));
});

AnswersSection.displayName = 'Answers';
