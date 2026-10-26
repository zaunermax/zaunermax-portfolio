import type { SuggestionMode } from '@/types/suggestion-mode';

export async function getSuggestions({
	mode = 'short',
	refresh = false,
}: {
	mode?: SuggestionMode;
	refresh?: boolean;
}): Promise<string[]> {
	const response = await fetch(`/api/suggestions?mode=${mode}`, {
		method: refresh ? 'POST' : 'GET',
	});
	if (!response.ok) throw new Error('Unable to load suggestions');
	const data: { suggestions: string[] } = await response.json();
	return data.suggestions;
}
