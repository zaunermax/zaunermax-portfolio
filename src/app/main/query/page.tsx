import { QuestionSection } from '@/components/question-section';
import { Suggestions } from '@/components/suggestions';

export default function QueryPage() {
	return (
		<div className="mt-20">
			<QuestionSection>
				<Suggestions />
			</QuestionSection>
		</div>
	);
}
