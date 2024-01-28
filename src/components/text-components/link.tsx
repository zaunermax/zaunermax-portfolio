import { ReactNode } from 'react';

type LinkProps = {
	href: string;
	children: ReactNode;
	isInternal?: boolean;
};

export const Link = ({ href, children, isInternal = false }: LinkProps) => {
	const externalLinkAttributes = !isInternal
		? { target: '_blank', rel: 'noopener noreferrer' }
		: {};

	return (
		<a
			href={href}
			{...externalLinkAttributes}
			className="text-blue-500 hover:cursor-pointer hover:underline"
		>
			{children}
		</a>
	);
};
