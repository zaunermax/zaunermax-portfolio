import { ReactNode } from 'react';

export const Link = ({ href, children }: { children: ReactNode; href: string }) => (
	<a
		href={href}
		target={'_blank'}
		rel={'noopener noreferrer'}
		className="text-blue-500 hover:cursor-pointer hover:underline"
	>
		{children}
	</a>
);
