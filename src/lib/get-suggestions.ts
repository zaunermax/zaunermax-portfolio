import { globalRevalidate } from '@/lib/global-revalidate';
import { doFetch } from '@/lib/fetch-utils';
import { SuggestionMode } from '@/types/suggestion-mode';

type Params = {
	baseUrl?: string;
	mode?: SuggestionMode;
	revalidate?: number;
};

export const getSuggestions = async ({
	mode = 'short',
	revalidate = globalRevalidate,
}: Params): Promise<string[]> => {
	const searchParams = new URLSearchParams();

	searchParams.append('mode', mode);

	const res: { suggestions: string[] } = await doFetch({
		url: `/api/suggestions?${searchParams.toString()}`,
		defaultValue: { suggestions: [] },
		revalidate,
	});

	return res.suggestions;
};
