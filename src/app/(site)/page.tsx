import { SecondLine } from './components/second-line';
import { QuestionLink } from './components/question-link';
import { getSentences } from '@/app/(site)/util/get-sentences';

export default async function Home() {
	const sequence = await getSentences();

	return (
		<div>
			<div className="flex min-h-screen items-center justify-center md:-mt-20">
				<div className="flex w-full flex-col space-y-4 lg:w-auto lg:min-w-[600px]">
					<h1 className="mb-2 text-4xl font-bold text-gray-900 sm:text-5xl md:text-6xl lg:text-7xl dark:text-white">
						Hello, I&#39;m{' '}
						<span style={{ color: 'palevioletred' }} className="hover:cursor-pointer">
							Max
						</span>{' '}
						👋
					</h1>
					<SecondLine sequence={sequence} />
					<QuestionLink />
				</div>
			</div>
		</div>
	);
}
