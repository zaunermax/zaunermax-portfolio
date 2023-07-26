import { QuestionLink } from '@/components/question-link';

export default async function MainPage() {
	return (
		<div>
			<div className="flex min-h-screen items-center justify-center">
				<div className="flex flex-col">
					<h1 className="mb-2 text-4xl font-bold text-gray-900 dark:text-white sm:text-5xl md:text-6xl lg:text-7xl">
						Hello, my name is Max 👋
					</h1>
					<QuestionLink />
				</div>
			</div>
		</div>
	);
}
