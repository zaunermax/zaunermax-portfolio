import Link from 'next/link';

import { cn } from '@/lib/utils';
import { HTMLAttributes } from 'react';

export function MainNav({ className, ...props }: HTMLAttributes<HTMLElement>) {
	return (
		<nav className={cn('flex items-center space-x-4 lg:space-x-6', className)} {...props}>
			<Link
				href="/main/query"
				className="text-sm font-medium transition-colors hover:text-primary"
			>
				main/query
			</Link>
			<Link
				href="/main/wiki"
				className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
			>
				main/wiki
			</Link>
			<Link
				href="/main/xp"
				className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
			>
				main/xp
			</Link>
		</nav>
	);
}
