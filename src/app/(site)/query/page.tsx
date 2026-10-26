import { Suspense } from 'react';
import { QuestionSection } from './components/question-section';

export default async function QueryPage() {
	return (
		<div className="mt-20 md:mt-28">
			<Suspense fallback={<div className="font-mono">Loading terminal...</div>}>
				<QuestionSection />
			</Suspense>
		</div>
	);
}
