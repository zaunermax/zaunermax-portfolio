import { NextResponse } from 'next/server';
import { SuggestionMode } from '@/types/suggestion-mode';
import { generateSuggestions } from '@/lib/server-only/generate-suggestions';

export const runtime = 'edge';

const possibleModes = ['short', 'long'] as const;

function isSuggestionMode(mode: string): mode is SuggestionMode {
	return (possibleModes as readonly string[]).includes(mode);
}

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const rawMode = searchParams.get('mode') || 'short';

	const mode: SuggestionMode = isSuggestionMode(rawMode) ? rawMode : 'short';

	const suggestions = await generateSuggestions(mode);

	return NextResponse.json({ suggestions });
}
