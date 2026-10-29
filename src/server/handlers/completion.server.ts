import { getLlmContext } from '@/server/llm-context-utils.server';
import { createTextStreamResponse, streamText, toTextStream } from 'ai';
import { getOpenAI, getLanguageModel } from '@/server/openai-client.server';
import { completionRequestSchema } from '@/lib/question-schema';

const SYSTEM_PROMPT = `
You are an assistant that that can answer questions about Max because you have information about him.
A person will ask you a question and you will provide a helpful answer.
Write the answer in the same language as the question.
If you don't know the answer, just say that you don't know but be helpful and explain why you can't answer.
"He" is always referring to Max. For example: "What is he doing", "How does he do things", etc. People always ask questions about Max.
Try to answer questions as thoroughly as possible, utilizing every bit of information you got about that question.
The current year is ${new Date().getFullYear()}
`;

export async function POST(req: Request) {
	const parsed = completionRequestSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return Response.json(
			{ message: 'Please ask a question of 1–100 characters.' },
			{ status: 400 },
		);
	}

	try {
		const { prompt } = parsed.data;
		const moderation = await getOpenAI().moderations.create(
			{ model: 'omni-moderation-latest', input: prompt },
			{ signal: req.signal },
		);
		if (moderation.results.some(({ flagged }) => flagged)) {
			return Response.json({ message: 'Be nice 😭' }, { status: 400 });
		}

		const content = await getLlmContext();
		if (!content.length) throw new Error('No portfolio context is available');
		const result = streamText({
			model: getLanguageModel(),
			instructions: SYSTEM_PROMPT,
			messages: [
				...content.map(({ text }) => ({ role: 'user' as const, content: text })),
				{ role: 'user', content: prompt },
			],
			providerOptions: { openai: { store: false } },
			maxOutputTokens: 1500,
			maxRetries: 0,
			abortSignal: req.signal,
		});

		return createTextStreamResponse({
			// Plain text has no error frames: propagate provider errors as a failed stream.
			stream: toTextStream({
				stream: result.stream.pipeThrough(
					new TransformStream({
						transform(part, controller) {
							if (part.type === 'error') controller.error(part.error);
							else controller.enqueue(part);
						},
					}),
				),
			}),
			headers: { 'Cache-Control': 'no-store' },
		});
	} catch (error) {
		console.error('Unable to answer the question:', error);
		return Response.json(
			{ message: 'Something went wrong. Please try again 😭' },
			{ status: 503 },
		);
	}
}
