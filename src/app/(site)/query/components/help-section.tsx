'use client';

import {
	BlankTerminalLine,
	LoadingAnimation,
	TerminalLine,
} from '@/components/visual-terminal';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { MultiplyChildren } from '@/components/multiply-children';
import Link from 'next/link';
import { getSuggestions } from '@/lib/get-suggestions';

export type HelpSectionProps = {
	modelName: string;
	disableLinks?: boolean;
};

const Example = ({ suggestion }: { suggestion: string }) => {
	return (
		<div>
			Example:{' '}
			<span className="text-blue-500 underline hover:text-blue-800">{suggestion}</span>
		</div>
	);
};

export const HelpSection = ({ modelName, disableLinks }: HelpSectionProps) => {
	const [suggestions, setSuggestions] = useState([] as string[]);
	const [isPending, startTransition] = useTransition();

	const handleGetSuggestions = useCallback(() => {
		startTransition(async () => {
			const suggestions = await getSuggestions({ shortMode: false });
			setSuggestions(suggestions);
		});
	}, []);

	useEffect(() => {
		handleGetSuggestions();
	}, [handleGetSuggestions]);

	return (
		<TerminalLine>
			ask --help
			<BlankTerminalLine />
			<div>Usage: ask QUESTION</div>
			<BlankTerminalLine />
			<div>LLM &quot;{modelName}&quot;: answering questions about max</div>
			<BlankTerminalLine />
			{suggestions.length && !isPending ? (
				suggestions.map((suggestion) => {
					const query = new URLSearchParams();
					query.append('q', suggestion);
					return disableLinks ? (
						<Example suggestion={suggestion} />
					) : (
						<Link href={`/main/query?${query.toString()}`} key={suggestion} replace>
							<Example suggestion={suggestion} />
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
			<div>
				You can click the examples for quick fill in or you can{' '}
				<span
					className="text-blue-500 underline hover:cursor-pointer hover:text-blue-800"
					role="link"
					onClick={handleGetSuggestions}
				>
					reload them
				</span>
			</div>
		</TerminalLine>
	);
};
