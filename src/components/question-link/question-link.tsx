import { Suspense } from 'react';
import { Suggestions } from '@/components/suggestions';
import { QuestionFormLink } from '@/components/question-link/components';

export const QuestionLink = () => {
	return (
		<div className="flex flex-col space-y-2">
			<p className="text-xl font-semibold text-gray-600 dark:text-gray-400 sm:text-2xl md:text-3xl">
				Ask a question about me!
			</p>
			<QuestionFormLink />
			<Suspense fallback={<div>Loading</div>}>
				<Suggestions />
			</Suspense>
		</div>
	);
};
