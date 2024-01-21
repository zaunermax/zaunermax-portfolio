import { extractModeration, getLlmContext } from '@/lib/server-only/llm-context-utils';
import { OpenAIStream, StreamingTextResponse } from 'ai';
import { NextResponse } from 'next/server';
import { openai } from '@/lib/server-only/openai-client';

export const runtime = 'edge';

const SYSTEM_PROMPT = `
You are an assistant that that can answer questions about Max because you have information about him.
A person will ask you a question and you will provide a helpful answer.
Write the answer in the same language as the question.
If you don't know the answer, just say that you don't know but be helpful and explain why you can't answer.
"He" is always referring to Max.
Try to answer questions as thoroughly as possible, utilizing every bit of information you got about that question.
The current year is ${new Date().getFullYear()}
`;

export async function POST(req: Request) {
	const { prompt = '' } = (await req.json()) as { prompt: string };

	console.log('question?', prompt);

	const question = prompt?.slice(0, 100);

	if (!question) return NextResponse.json({ message: '💔' }, { status: 400 });

	const isFlagged = await openai.moderations
		.create({ input: question })
		.then(extractModeration)
		.catch((e) => {
			console.error(e);
			return true;
		});

	if (isFlagged) return NextResponse.json({ message: 'Be nice 😭' }, { status: 400 });

	const content = await getLlmContext();

	const response = await openai.chat.completions.create({
		model: process.env.OPENAI_MODEL!,
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
				content: prompt,
			},
		],
		stream: true,
	});

	const stream = OpenAIStream(response);

	return new StreamingTextResponse(stream);
}
