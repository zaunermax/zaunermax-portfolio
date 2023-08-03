import {
	BlankTerminalLine,
	TerminalLine,
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
		<TerminalLine {...rest}>
			ask <span aria-hidden="true">{question}</span>
			{newline ? <BlankTerminalLine /> : null}
			{children}
		</TerminalLine>
	);
};
