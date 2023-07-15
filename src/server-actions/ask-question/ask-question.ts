'use server';

import { Configuration, OpenAIApi } from 'openai';
import { ageContext, cvContext, generalInfo } from './assets/cvContext';

const config = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(config);

export const askQuestion = async (question: string) => {
	console.log('question?', question);
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
          `,
				},
				{
					role: 'user',
					content: cvContext,
				},
				{
					role: 'user',
					content: generalInfo,
				},
				{
					role: 'user',
					content: ageContext,
				},
				{
					role: 'user',
					content: question,
				},
			],
		})
		.then(({ data }) => {
			console.log(data);
			return data.choices[0].message?.content;
		})
		.catch((error) => {
			if (error.response) {
				return error.response.data.error.message;
			} else {
				return 'No response received from OpenAI';
			}
		});
};
