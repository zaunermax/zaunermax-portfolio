import type { ReactNode } from 'react';
import {
	createRootRoute,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from '@tanstack/react-router';
import { SpikeSwitcher } from '@/lab-shared/spike-switcher';
import '@/styles/globals.css';
import '@/styles/fonts.css';

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ title: 'Max Zauner' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
			{ name: 'robots', content: 'noindex' },
		],
		links: [
			{ rel: 'icon', href: '/favicon.ico' },
			{ rel: 'apple-touch-icon', href: '/apple-icon.png' },
		],
	}),
	shellComponent: Document,
	component: Outlet,
	notFoundComponent: () => (
		<main>
			Page not found. <Link to="/">Visit the office</Link>
		</main>
	),
});

function Document({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body className="min-h-screen antialiased">
				{children}
				<SpikeSwitcher />
				<Scripts />
			</body>
		</html>
	);
}
