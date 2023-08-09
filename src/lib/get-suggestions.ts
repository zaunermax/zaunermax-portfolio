import { globalRevalidate } from '@/lib/global-revalidate';
import { doFetch } from '@/lib/fetch-utils';

type Params = {
	baseUrl?: string;
	shortMode?: boolean;
	revalidate?: number;
};

export const getSuggestions = async ({
	shortMode = true,
	baseUrl = '',
	revalidate = globalRevalidate,
}: Params): Promise<string[]> => {
	const searchParams = new URLSearchParams();

	searchParams.append('mode', shortMode ? 'short' : 'long');

	const res: { suggestions: string[] } = await doFetch({
		url: `${baseUrl}/api/suggestions?${searchParams.toString()}`,
		defaultValue: { suggestions: [] },
		revalidate,
	});

	return res.suggestions;
};
