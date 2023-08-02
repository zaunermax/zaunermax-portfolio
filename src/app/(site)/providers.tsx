'use client';

import { ReactNode } from 'react';
import { ThemeProvider } from './components/theme-provider';

export function Providers({ children }: { children: ReactNode }) {
	return (
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			{children}
		</ThemeProvider>
	);
}
