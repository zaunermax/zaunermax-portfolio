import { MainNav } from '@/components/main-nav';
import { ReactNode } from 'react';
import { ModeToggle } from '@/components/dark-mode-switch/dark-mode-switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Image from 'next/image';

import image from './assets/pp.jpg';

export function AppLayout({ children }: { children: ReactNode }) {
	return (
		<div className="relative flex min-h-screen flex-col">
			<header className="border-b">
				<div className="container flex h-16 items-center">
					<Avatar>
						<AvatarImage asChild>
							<Image src={image} alt={'MZ'} />
						</AvatarImage>
						<AvatarFallback>MZ</AvatarFallback>
					</Avatar>
					<MainNav />
					<div className="ml-auto flex items-center space-x-4">
						<ModeToggle />
					</div>
				</div>
			</header>
			<div className="container flex-1">{children}</div>
		</div>
	);
}
