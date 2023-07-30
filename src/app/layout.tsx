import './globals.css';

import { Providers } from '@/app/providers';
import { cn } from '@/lib/utils';
import { Roboto_Mono } from 'next/font/google';

const roboto_mono = Roboto_Mono({
	subsets: ['latin'],
	display: 'auto',
	variable: '--font-roboto-mono',
});

export const metadata = {
	title: 'Max Zauner - Software Engineer',
	description: 'Portfolio website of Max Zauner',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className={`${roboto_mono.variable}`}>
			<body className={cn('min-h-screen bg-background font-sans antialiased')}>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
