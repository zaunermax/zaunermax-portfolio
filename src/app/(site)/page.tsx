import { SecondLine } from './components/second-line';
import { QuestionLink } from './components/question-link';

export const revalidate = 300;

export default function Home() {
	return (
		<div>
			<div className="flex min-h-screen items-center justify-center">
				<div className="flex flex-col space-y-4">
					<h1 className="mb-2 text-4xl font-bold text-gray-900 dark:text-white sm:text-5xl md:text-6xl lg:text-7xl">
						Hello, I&#39;m{' '}
						<span style={{ color: 'palevioletred' }} className="hover:cursor-pointer">
							Max
						</span>{' '}
						👋
					</h1>
					<SecondLine />
					<QuestionLink />
				</div>
			</div>
		</div>
	);
}
