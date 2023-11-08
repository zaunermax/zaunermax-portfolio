import { extractEdgeAnswer, getLlmContext } from '@/lib/server-only/llm-context-utils';
import { openaiEdge } from '@/lib/server-only/openai-edge-client';
import { SuggestionMode } from '@/types/suggestion-mode';
import 'server-only';

type SuggestionsTuple = [suggestion1: string, suggestion2: string, suggestion3: string];

const SYSTEM_PROMPT = `
You are an assistant that that can provide questions about Max because you have information about him.
Try to provide questions that are as short as possible.
Avoid questions of when Max did anything.
The current year is ${new Date().getFullYear()}
`;

const STANDARD_QUESTIONS: SuggestionsTuple = [
	'What technologies does Max use?',
	"What are Max' programming expertise areas?",
	"Where did Max study for his Master's degree?",
];

const generateSuggestionPrompt = (shortMode: boolean) => `
Generate exactly 3 ${shortMode ? 'short ' : ''}questions about Max.
Avoid questions about locations.
${
	!shortMode
		? 'Try to create questions that lead to interesting long answers while keeping the questions under 90 characters.'
		: 'Try to keep the questions under 60 characters if possible.'
}
Return them via a JavaScript array like this:
["question001", "question002", "question003"]
Make it so the response can be parsed via JavaScript's "JSON.parse" function.
`;

export const generateSuggestions = async (
	mode: SuggestionMode,
): Promise<SuggestionsTuple> => {
	const content = await getLlmContext();

	return openaiEdge
		.createChatCompletion({
			model: 'gpt-3.5-turbo',
			temperature: 0.8,
			messages: [
				{
					role: 'system',
					content: SYSTEM_PROMPT,
				},
				...content.map(
					({ text }) =>
						({
							role: 'user',
							content: text,
						}) as const,
				),
				{
					role: 'user',
					content: generateSuggestionPrompt(mode === 'short'),
				},
			],
		})
		.then(extractEdgeAnswer)
		.then((suggestions) => JSON.parse(suggestions || '[]') as string[])
		.then((suggestions) => suggestions.slice(0, 3) as SuggestionsTuple)
		.catch((error) => {
			console.error(error);
			return STANDARD_QUESTIONS;
		})
		.finally(() => console.log(`created new [${mode}] edge suggestions`));
};
