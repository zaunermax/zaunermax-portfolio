'use client';

import { ThemeProvider } from '@/components/theme-provider/theme-provider';
import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
	return (
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			{children}
		</ThemeProvider>
	);
}
