import { openai } from '@/lib/openai-client';
import { Badge } from '@/components/ui/badge';
import { extractAnswer, getLlmContext } from '@/lib/llm-context-utils';

const getSuggestions = async () => {
	const content = await getLlmContext();

	const suggestions = await openai
		.createChatCompletion({
			model: 'gpt-3.5-turbo',
			temperature: 0.8,
			messages: [
				{
					role: 'system',
					content: `
					You are an assistant that that can provide questions about Max Zauner because you have information about him.
          Try to provide questions that are as short as possible.
          Max currently has not job. Avoid questions of when Max Zauner did anything and about his current location.
          The current year is ${new Date().getFullYear()}
          `,
				},
				...content.map(
					({ text }) =>
						({
							role: 'user',
							content: text,
						} as const),
				),
				{
					role: 'user',
					content: `
				Now generate 3 questions about Max Zauner and return them via a JavaScript array like this:
				["question001", "question002", "question003"]
				Make it so the response can be parsed via JavaScript's "JSON.parse" function.
				`,
				},
			],
		})
		.then(extractAnswer)
		.catch((error) => {
			if (error.response) {
				console.error(error.response.data.error.message);
			} else {
				console.error('No response from openai...');
			}
			return `["What technologies does Max Zauner use?", "What are Max Zauner's programming expertise areas?", "Where did Max Zauner study for his Master's degree?"]`;
		});

	try {
		return JSON.parse(suggestions || '[]') as string[];
	} catch (e: unknown) {
		console.warn('Weird suggestions format', suggestions);
		console.error('Unknown response format', e);
		return [];
	}
};

export const Suggestions = async () => {
	const res = await getSuggestions();

	return (
		<div>
			{res.map((suggestion, idx) => (
				<Badge className="mr-1" key={idx}>
					{suggestion}
				</Badge>
			))}
		</div>
	);
};
