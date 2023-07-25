import { QuestionSection } from '@/components/question-section';
import { Suspense } from 'react';
import { Suggestions } from '@/components/suggestions';

export default async function MainPage() {
	return (
		<div>
			<div className="flex min-h-screen items-center justify-center">
				<div className="flex flex-col">
					<h1 className="mb-2 text-4xl font-bold text-gray-900 dark:text-white sm:text-5xl md:text-6xl lg:text-7xl">
						Hello, my name is Max 👋
					</h1>
					<p className="text-xl font-semibold text-gray-600 dark:text-gray-400 sm:text-2xl md:text-3xl">
						Ask a question about me!
					</p>
					<QuestionSection />
					<Suspense fallback={<div>Loading</div>}>
						<Suggestions />
					</Suspense>
				</div>
			</div>
		</div>
	);
}
