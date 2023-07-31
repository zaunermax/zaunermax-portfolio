import { Suspense } from 'react';
import { Suggestions } from '@/components/suggestions';
import { QuestionFormLink } from '@/components/question-link/components';

export const QuestionLink = async () => {
	return (
		<div className="flex flex-col space-y-4">
			<QuestionFormLink />
			<Suspense fallback={<div>Loading some suggestions...</div>}>
				<Suggestions />
			</Suspense>
		</div>
	);
};
