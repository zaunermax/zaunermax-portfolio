import { MainNav } from '@/components/main-nav';
import { ReactNode } from 'react';
import { ModeToggle } from '@/components/dark-mode-switch';
import { OwnAvatar } from '@/components/ui/own-avatar';

export function AppLayout({ children }: { children: ReactNode }) {
	return (
		<div className="relative flex min-h-screen flex-col">
			<header className="fixed z-10 w-full border-b bg-background">
				<div className="container flex h-16 items-center space-x-5">
					<OwnAvatar />
					<MainNav />
					<div className="flex w-full justify-end">
						<ModeToggle />
					</div>
				</div>
			</header>
			<div className="container flex-1">{children}</div>
		</div>
	);
}
