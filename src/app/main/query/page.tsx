import { QuestionSection } from '@/components/question-section';
import { Suggestions } from '@/components/suggestions';
import { Suspense } from 'react';

export default async function QueryPage() {
	return (
		<div className="mt-20">
			<QuestionSection>
				<Suspense fallback={<div>Loading some suggestions...</div>}>
					<Suggestions />
				</Suspense>
			</QuestionSection>
		</div>
	);
}
