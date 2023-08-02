import { NextResponse } from 'next/server';
import { extractAnswer, getLlmContext } from '@/lib/llm-context-utils';
import { openai } from '@/lib/openai-client';
import { captureException, captureMessage } from '@sentry/nextjs';

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const rawMode = searchParams.get('mode') || 'short';

	const shortMode = rawMode === 'short';

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
Avoid questions of when Max did anything.
The current year is ${new Date().getFullYear()}`,
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
					content: `
Generate exactly 3 ${shortMode ? 'short ' : ''}questions about Max.
Avoid questions about locations.
${
	!shortMode
		? 'Try to create questions that lead to interesting long answers while keeping the questions under 90 characters.'
		: 'Try to keep the questions under 60 characters if possible.'
}
Return them via a JavaScript array like this:
["question001", "question002", "question003"]
Make it so the response can be parsed via JavaScript's "JSON.parse" function.`,
				},
			],
		})
		.then(extractAnswer)
		.catch((error) => {
			captureException(error);
			return `["What technologies does Max use?", "What are Max' programming expertise areas?", "Where did Max study for his Master's degree?"]`;
		})
		.finally(() =>
			console.log(`created new ${shortMode ? 'short' : 'long'} suggestions`),
		);

	try {
		const res = JSON.parse(rawSuggestions || '[]') as string[];
		return NextResponse.json({ suggestions: res.slice(0, 3) });
	} catch (e: unknown) {
		captureMessage(`Weird suggestions format: ${rawSuggestions}`);
		captureException(e);
		return NextResponse.json({ suggestions: [] });
	}
}
