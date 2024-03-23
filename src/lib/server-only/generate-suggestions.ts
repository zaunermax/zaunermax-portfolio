import { extractEdgeAnswer, getLlmContext } from '@/lib/server-only/llm-context-utils';
import { SuggestionMode } from '@/types/suggestion-mode';
import { openai } from '@/lib/server-only/openai-client';
import 'server-only';

type ResponseObject = { questions: string[] | undefined };
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
Generate exactly 3 ${shortMode ? 'SUPER SHORT ' : ''}questions about Max.
Avoid questions about locations.
${
	!shortMode
		? 'Try to create questions that lead to interesting answers while keeping the questions UNDER 90 characters.'
		: 'Keep the questions UNDER 60 characters.'
}
Return a JSON object containing a property called "questions" which contains an array of EXACTLY 3 questions which adhere to the previously mentioned constraints.
`;

export const generateSuggestions = async (
	mode: SuggestionMode,
): Promise<SuggestionsTuple> => {
	const content = await getLlmContext();

	return openai.chat.completions
		.create({
			model: process.env.OPENAI_MODEL!,
			response_format: { type: 'json_object' },
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
		.then((response) => JSON.parse(response || '{}') as ResponseObject)
		.then(({ questions }) => {
			if (!questions) throw new Error('Response did not contain questions');
			return questions.slice(0, 3) as SuggestionsTuple;
		})
		.catch((error) => {
			console.error('Error generating suggestions:', error);
			return STANDARD_QUESTIONS;
		})
		.finally(() => console.log(`created new [${mode}] edge suggestions`));
};
