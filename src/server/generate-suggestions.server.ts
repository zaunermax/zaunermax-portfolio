import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getLlmContext } from './llm-context-utils.server';
import { getLanguageModel } from './openai-client.server';
import type { SuggestionMode } from '@/types/suggestion-mode';

const STANDARD_QUESTIONS = [
	'What technologies does Max use?',
	"What are Max's programming expertise areas?",
	"Where did Max study for his Master's degree?",
];

async function createSuggestions(mode: SuggestionMode) {
	const content = await getLlmContext();
	if (!content.length) throw new Error('No portfolio context is available');
	const limit = mode === 'short' ? 60 : 90;
	const { output } = await generateText({
		model: getLanguageModel(),
		instructions: `You suggest interesting questions about Max based on the supplied information. The current year is ${new Date().getFullYear()}. Avoid questions about locations or when he did something. Refer to him as Max, never "you".`,
		messages: [
			...content.map(({ text }) => ({ role: 'user' as const, content: text })),
			{
				role: 'user',
				content: `Generate exactly 3 ${mode === 'short' ? 'super short ' : ''}questions about Max. Each question must be under ${limit} characters.`,
			},
		],
		output: Output.object({
			schema: z.object({ questions: z.array(z.string()).length(3) }),
		}),
		providerOptions: { openai: { store: false } },
		maxOutputTokens: 400,
		maxRetries: 0,
	});
	return z.array(z.string().trim().min(1).max(limit)).length(3).parse(output.questions);
}

export async function generateSuggestions(
	mode: SuggestionMode,
	refresh = false,
): Promise<string[]> {
	try {
		const key = new Request(`https://quest-cache.internal/suggestions/v1/${mode}`);
		const cache = (caches as CacheStorage & { default: Cache }).default;
		if (!refresh) {
			const hit = await cache.match(key);
			if (hit) return await hit.json() as string[];
		}
		const suggestions = await createSuggestions(mode);
		await cache.put(key, Response.json(suggestions, {
			headers: { 'Cache-Control': 'public, max-age=300' },
		}));
		return suggestions;
	} catch (error) {
		console.error('Unable to generate suggestions:', error);
		return STANDARD_QUESTIONS;
	}
}
