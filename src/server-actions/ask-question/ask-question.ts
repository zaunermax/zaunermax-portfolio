'use server';

import { openai } from '@/lib/openai-client';
import { extractAnswer, getLlmContext } from '@/lib/llm-context-utils';

export const askQuestion = async (rawQuestion: string) => {
	console.log('question?', rawQuestion);

	const question = rawQuestion.slice(0, 100);

	const isFlagged = await openai
		.createModeration({
			input: question,
		})
		.then(({ data }) => data.results.some(({ flagged }) => flagged))
		.catch((e) => {
			console.error('Moderation error', e);
			return true;
		});

	if (isFlagged) return 'Be nice :(';

	const content = await getLlmContext();

	return await openai
		.createChatCompletion({
			model: 'gpt-3.5-turbo',
			temperature: 0.8,
			messages: [
				{
					role: 'system',
					content: `
					You are an assistant that that can answer questions about Max Zauner because you have information about him.
          A person will ask you a question and you will provide a helpful answer.
          Write the answer in the same language as the question.
          If you don't know the answer, just say that you don't know but be helpful and explain why you can't answer.
          "He" is always referring to Max Zauner.
          Try to answer as short as possible.
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
					content: question,
				},
			],
		})
		.then(extractAnswer)
		.catch((error) => {
			if (error.response) {
				return error.response.data.error.message;
			} else {
				return 'No response received from OpenAI';
			}
		});
};
