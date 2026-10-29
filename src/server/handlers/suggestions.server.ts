import { SuggestionMode } from '@/types/suggestion-mode';
import { generateSuggestions } from '@/server/generate-suggestions.server';

const possibleModes = ['short', 'long'] as const;

function isSuggestionMode(mode: string): mode is SuggestionMode {
	return (possibleModes as readonly string[]).includes(mode);
}

async function suggestionsResponse(request: Request, refresh = false) {
	const { searchParams } = new URL(request.url);
	const rawMode = searchParams.get('mode') || 'short';

	const mode = isSuggestionMode(rawMode) ? rawMode : 'short';

	const suggestions = await generateSuggestions(mode, refresh);

	return Response.json({ suggestions }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request) {
	return suggestionsResponse(request);
}

export async function POST(request: Request) {
	return suggestionsResponse(request, true);
}
