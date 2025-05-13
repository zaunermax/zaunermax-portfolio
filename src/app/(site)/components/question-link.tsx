import { Suggestions } from './suggestions';
import { QuestionFormLink } from './question-form-link';
import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';

const SuggestionFallback = () => (
	<div>
		{Array.from({ length: 3 }).map((_, idx) => (
			<span key={idx} className="mr-2">
				<Badge
					className="mt-1 w-full rounded-2xl px-4 py-2 md:m-auto md:mb-2 md:w-auto md:rounded-full md:px-2.5 md:py-0.5"
					variant="secondary"
				>
					<span className="inline-block w-60 rounded">&nbsp;</span>
				</Badge>
			</span>
		))}
	</div>
);

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
