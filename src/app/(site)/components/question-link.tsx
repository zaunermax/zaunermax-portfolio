import { Suspense } from 'react';
import { Suggestions } from './suggestions';
import { QuestionFormLink } from './question-form-link';

export async function QuestionLink() {
	return (
		<div className="flex flex-col space-y-4">
			<QuestionFormLink />
			<Suspense fallback={<div>Loading some suggestions...</div>}>
				<Suggestions />
			</Suspense>
		</div>
	);
}