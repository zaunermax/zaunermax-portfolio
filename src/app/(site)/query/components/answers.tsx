import { BlankTerminalLine, TerminalOutput } from '@/components/visual-terminal';
import { memo } from 'react';
import { useAtom } from 'jotai';
import { answersAtom } from '@/app/(site)/query/atoms/answers.atom';

export const Answers = memo(() => {
	const [answers] = useAtom(answersAtom);

	return answers.map(({ question, answer }, idx) => (
		<TerminalOutput key={idx}>
			ask {question}
			<BlankTerminalLine />
			{answer}
		</TerminalOutput>
	));
});

Answers.displayName = 'Answers';
