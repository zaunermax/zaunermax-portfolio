import { BlankTerminalLine, TerminalLine } from '@/components/visual-terminal';

export type HelpSectionProps = {
	modelName: string;
};

export const HelpSection = ({ modelName }: HelpSectionProps) => {
	return (
		<TerminalLine>
			ask --help
			<BlankTerminalLine />
			<div>Usage: ask QUESTION</div>
			<BlankTerminalLine />
			<div>LLM &quot;{modelName}&quot;: answering questions about max</div>
			<BlankTerminalLine />
			<div>Example: ask What is Max Zauner&#39;s area of expertise?</div>
			<div>Example: ask What kind of projects did Max Zauner work on?</div>
			<div>Example: ask What are Max Zauner&#39;s interests?</div>
			<BlankTerminalLine />
			<div>You can click the examples for quick fill in</div>
		</TerminalLine>
	);
};
