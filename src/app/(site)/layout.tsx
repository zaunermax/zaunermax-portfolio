import '../globals.css';

import { Providers } from './providers';
import { JetBrains_Mono } from 'next/font/google';
import { ReactNode } from 'react';
import { Footer } from './components/footer';
import { AppLayout } from '@/components/app-layout';
import { SpeedInsights } from '@vercel/speed-insights/next';

const jetbrains_mono = JetBrains_Mono({
	subsets: ['latin'],
	display: 'auto',
	variable: '--font-jetbrains-mono',
});

export const metadata = {
	title: 'Max Zauner - Software Engineer',
	description: 'Portfolio website of Max Zauner',
};

export const viewport = {
	width: 'device-width',
	initialScale: 1,
	maximumScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" className={`${jetbrains_mono.variable}`} suppressHydrationWarning>
			<body className="min-h-screen bg-background font-sans">
				<Providers>
					<AppLayout>{children}</AppLayout>
					<Footer />
				</Providers>
				<SpeedInsights />
			</body>
		</html>
	);
}
