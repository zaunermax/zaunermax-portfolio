import {
	BlankTerminalLine,
	LoadingAnimation,
	TerminalLine,
} from '@/components/visual-terminal';
import { useEffect, useState } from 'react';
import { MultiplyChildren } from '@/components/multiply-children';
import Link from 'next/link';
import { getSuggestions } from '@/lib/get-suggestions';

export type HelpSectionProps = {
	modelName: string;
};

export const HelpSection = ({ modelName }: HelpSectionProps) => {
	const [suggestions, setSuggestions] = useState([] as string[]);

	useEffect(() => {
		getSuggestions().then(setSuggestions);
	}, []);

	return (
		<TerminalLine>
			ask --help
			<BlankTerminalLine />
			<div>Usage: ask QUESTION</div>
			<BlankTerminalLine />
			<div>LLM &quot;{modelName}&quot;: answering questions about max</div>
			<BlankTerminalLine />
			{suggestions.length ? (
				suggestions.map((suggestion) => {
					const query = new URLSearchParams();
					query.append('q', suggestion);
					return (
						<Link href={`/main/query?${query.toString()}`} key={suggestion}>
							<div>
								Example:{' '}
								<span className="text-blue-500 underline hover:text-blue-800">
									{suggestion}
								</span>
							</div>
						</Link>
					);
				})
			) : (
				<MultiplyChildren times={3}>
					<div>
						Example: <LoadingAnimation />
					</div>
				</MultiplyChildren>
			)}
			<BlankTerminalLine />
			<div>You can click the examples for quick fill in</div>
		</TerminalLine>
	);
};
