'use client';

import { ReactNode } from 'react';
import { ThemeProvider } from './components/theme-provider';
import { Provider as JotaiProvider } from 'jotai';

export function Providers({ children }: { children: ReactNode }) {
	return (
		<ThemeProvider>
			<JotaiProvider>{children}</JotaiProvider>
		</ThemeProvider>
	);
}
