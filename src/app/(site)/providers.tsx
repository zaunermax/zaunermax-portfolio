'use client';

import { ReactNode, useState } from 'react';
import { ThemeProvider } from './components/theme-provider';
import { Provider as JotaiProvider } from 'jotai';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const useReactQueryClient = () => {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						// With SSR, we usually want to set some default staleTime
						// above 0 to avoid refetching immediately on the client
						staleTime: 60 * 1000,
					},
				},
			}),
	);

	return { queryClient };
};

export function Providers({ children }: { children: ReactNode }) {
	const { queryClient } = useReactQueryClient();

	return (
		<ThemeProvider>
			<QueryClientProvider client={queryClient}>
				<JotaiProvider>{children}</JotaiProvider>
				<ReactQueryDevtools initialIsOpen={false} />
			</QueryClientProvider>
		</ThemeProvider>
	);
}
