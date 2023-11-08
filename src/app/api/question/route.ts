import { openaiEdge } from '@/lib/server-only/openai-edge-client';
import { NextResponse } from 'next/server';
import {
	extractEdgeAnswer,
	extractModeration,
	getLlmContext,
} from '@/lib/server-only/llm-context-utils';

export const runtime = 'edge';

const SYSTEM_PROMPT = `
You are an assistant that that can answer questions about Max because you have information about him.
A person will ask you a question and you will provide a helpful answer.
Write the answer in the same language as the question.
If you don't know the answer, just say that you don't know but be helpful and explain why you can't answer.
"He" is always referring to Max.
The current year is ${new Date().getFullYear()}
`;

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const rawQuestion = searchParams.get('q');

	console.log('question?', rawQuestion);

	const question = rawQuestion?.slice(0, 100);

	if (!question) return NextResponse.json({ message: '💔' }, { status: 400 });

	const isFlagged = await openaiEdge
		.createModeration({ input: question })
		.then(extractModeration)
		.catch((e) => {
			console.error(e);
			return true;
		});

	if (isFlagged) return NextResponse.json({ message: 'Be nice 😭' }, { status: 400 });

	const content = await getLlmContext();

	const message = await openaiEdge
		.createChatCompletion({
			model: 'gpt-3.5-turbo',
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
					content: question,
				},
			],
		})
		.then(extractEdgeAnswer)
		.then(
			(answer) => answer ?? 'No answer received from openai 💔 Something went wrong 😔',
		)
		.catch((e) => {
			console.error(e);
			return 'There was en error receiving an answer from openai 💔';
		});

	return NextResponse.json({ message });
}
