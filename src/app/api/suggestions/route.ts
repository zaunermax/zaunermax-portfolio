import { NextResponse } from 'next/server';
import { extractAnswer, getLlmContext } from '@/lib/llm-context-utils';
import { openai } from '@/lib/openai-client';

export const revalidate = 300;

export async function GET() {
	const content = await getLlmContext();

	const rawSuggestions = await openai
		.createChatCompletion({
			model: 'gpt-3.5-turbo',
			temperature: 0.8,
			messages: [
				{
					role: 'system',
					content: `
You are an assistant that that can provide questions about Max because you have information about him.
Try to provide questions that are as short as possible.
Max currently has no job. Avoid questions of when Max did anything.
The current year is ${new Date().getFullYear()}`,
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
Now generate 3 short questions about Max.
Note, that Max currently has not job but is looking for one.
Instead of "Max Zauner" which is his full name, just use his first name "Max".
Return them via a JavaScript array like this:
["question001", "question002", "question003"]
Make it so the response can be parsed via JavaScript's "JSON.parse" function.`,
				},
			],
		})
		.then(extractAnswer)
		.catch((error) => {
			if (error.response) {
				console.error(error.response.data.error.message);
			} else {
				console.error('No response from openai...', error);
			}
			return `["What technologies does Max use?", "What are Max' programming expertise areas?", "Where did Max study for his Master's degree?"]`;
		})
		.finally(() => console.log('created new suggestions'));

	try {
		const res = JSON.parse(rawSuggestions || '[]') as string[];
		return NextResponse.json({ suggestions: res });
	} catch (e: unknown) {
		console.warn('Weird suggestions format', rawSuggestions);
		console.error('Unknown response format', e);
		return NextResponse.json({ suggestions: [] });
	}
}
