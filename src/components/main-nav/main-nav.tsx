'use client';

import { cn } from '@/lib/utils';
import { HTMLAttributes } from 'react';
import { usePathname } from 'next/navigation';
import { NavLink } from './components';

const links = [
	{ href: '/main', linkText: 'main' },
	{ href: '/query', linkText: 'query' },
	{ href: '/wiki', linkText: 'wiki' },
	{ href: '/talks', linkText: 'talks' },
];

const isActive = ({ href }: { href: string }, pathname: string) =>
	href === pathname || (href === '/wiki' && pathname.startsWith('/wiki'));

export function MainNav({ className, ...props }: HTMLAttributes<HTMLElement>) {
	const pathname = usePathname();

	return (
		<nav
			className={cn('flex items-center space-x-4 font-mono lg:space-x-6', className)}
			{...props}
		>
			{links.map((linkProps) => (
				<NavLink
					key={linkProps.href}
					{...linkProps}
					isActive={isActive(linkProps, pathname)}
				/>
			))}
		</nav>
	);
}
