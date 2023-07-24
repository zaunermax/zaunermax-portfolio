import Link from 'next/link';

import { cn } from '@/lib/utils';

export function MainNav({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
	return (
		<nav className={cn('flex items-center space-x-4 lg:space-x-6', className)} {...props}>
			<Link
				href="/main/projects"
				className="text-sm font-medium transition-colors hover:text-primary"
			>
				Projects
			</Link>
			<Link
				href="/main/education"
				className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
			>
				Education
			</Link>
			<Link
				href="/main/work"
				className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
			>
				Work
			</Link>
		</nav>
	);
}
