import { SecondLine } from './components/second-line';
import { QuestionLink } from './components/question-link';
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { getSentences } from '@/app/(site)/util/get-sentences';

export const revalidate = 300;

export default async function Home() {
	const queryClient = new QueryClient();

	await queryClient.prefetchQuery({
		queryKey: ['sentences'],
		queryFn: getSentences,
	});

	return (
		<div>
			<div className="flex min-h-screen items-center justify-center">
				<div className="flex w-full flex-col space-y-4 lg:w-auto lg:min-w-[600px]">
					<h1 className="mb-2 text-4xl font-bold text-gray-900 dark:text-white sm:text-5xl md:text-6xl lg:text-7xl">
						Hello, I&#39;m{' '}
						<span style={{ color: 'palevioletred' }} className="hover:cursor-pointer">
							Max
						</span>{' '}
						👋
					</h1>
					<HydrationBoundary state={dehydrate(queryClient)}>
						<SecondLine />
					</HydrationBoundary>
					<QuestionLink />
				</div>
			</div>
		</div>
	);
}
