import './globals.css';

import { Providers } from '@/app/providers';
import { cn } from '@/lib/utils';

export const metadata = {
	title: 'Max Zauner - Software Engineer',
	description: 'Portfolio website of Max Zauner',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body className={cn('min-h-screen bg-background font-sans antialiased')}>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
