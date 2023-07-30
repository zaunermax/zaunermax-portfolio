import { cn } from '@/lib/utils';
import Link from 'next/link';

export type NavLinkProps = {
	href: string;
	linkText: string;
	isActive: boolean;
};

export const NavLink = ({ href, linkText, isActive }: NavLinkProps) => {
	return (
		<Link
			href={href}
			className={cn(
				'text-sm font-medium transition-colors hover:text-primary',
				!isActive && 'text-muted-foreground',
			)}
		>
			{linkText}
		</Link>
	);
};
