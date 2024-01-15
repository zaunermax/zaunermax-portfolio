import { Suggestions } from './suggestions';
import { QuestionFormLink } from './question-form-link';
import { Suspense } from 'react';

const SuggestionFallback = () => {
	return <div>Loading some suggestions...</div>;
};

export async function QuestionLink() {
	return (
		<div className="flex flex-col space-y-4 md:w-full">
			<QuestionFormLink />
			<Suspense fallback={<SuggestionFallback />}>
				<Suggestions />
			</Suspense>
		</div>
	);
}
