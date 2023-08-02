import '../globals.css';

import { Providers } from './providers';
import { JetBrains_Mono } from 'next/font/google';
import { ReactNode } from 'react';

const jetbrains_mono = JetBrains_Mono({
	subsets: ['latin'],
	display: 'auto',
	variable: '--font-jetbrains-mono',
});

export const metadata = {
	title: 'Max Zauner - Software Engineer',
	description: 'Portfolio website of Max Zauner',
	viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" className={`${jetbrains_mono.variable}`}>
			<body className="min-h-screen bg-background font-sans antialiased">
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
