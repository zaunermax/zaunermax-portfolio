import { Badge } from '@/components/ui/badge';
import { serverURL } from '@/lib/server-url';
import Link from 'next/link';

const getSuggestions = async () => {
	const res = await fetch(`${serverURL}/api/suggestions`, {
		next: { revalidate: 300 },
	});

	if (!res.ok) return [];
	else return res.json().then(({ suggestions }) => suggestions as string[]);
};

export async function Suggestions() {
	const suggestions = await getSuggestions();

	return (
		<div className="flex space-x-2">
			{suggestions.map((suggestion, idx) => {
				const query = new URLSearchParams();
				query.append('q', suggestion);
				return (
					<Link href={`/main/query?${query.toString()}`} key={idx}>
						<Badge className=" hover:cursor-pointer">{suggestion}</Badge>
					</Link>
				);
			})}
		</div>
	);
}
