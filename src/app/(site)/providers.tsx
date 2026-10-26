'use client';

import type { ReactNode } from 'react';
import { AnswerHistoryProvider } from './query/components/answer-history';
import { ThemeProvider } from './components/theme-provider';

export function Providers({ children }: { children: ReactNode }) {
	return (
		<ThemeProvider>
			<AnswerHistoryProvider>{children}</AnswerHistoryProvider>
		</ThemeProvider>
	);
}
