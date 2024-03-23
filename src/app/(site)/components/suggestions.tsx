import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { generateSuggestions } from '@/lib/server-only/generate-suggestions';

export const Suggestions = async () => {
	const suggestions = await generateSuggestions('short');

	return (
		<div>
			{suggestions.map((suggestion, idx) => {
				const query = new URLSearchParams();
				query.append('q', suggestion);
				return (
					<Link
						key={idx}
						className="mr-2"
						href={`/main/query?${query.toString()}`}
						prefetch={false}
					>
						<Badge
							className="mt-1 w-full rounded-2xl px-4 py-2 md:m-auto md:mb-2 md:w-auto md:rounded-full md:px-2.5 md:py-0.5"
							variant="secondary"
						>
							{suggestion}
						</Badge>
					</Link>
				);
			})}
		</div>
	);
};
