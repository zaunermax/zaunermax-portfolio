import {
	BlankTerminalLine,
	TerminalOutput,
	TerminalLineProps,
} from '@/components/visual-terminal';
import { PropsWithChildren } from 'react';

export type QuestionCommandProps = TerminalLineProps &
	PropsWithChildren & {
		question: string;
		newline?: boolean;
	};

export const QuestionCommand = ({
	question,
	newline = false,
	children,
	...rest
}: QuestionCommandProps) => {
	return (
		<TerminalOutput {...rest}>
			ask <span aria-hidden="true">{question}</span>
			{newline ? <BlankTerminalLine /> : null}
			{children}
		</TerminalOutput>
	);
};
