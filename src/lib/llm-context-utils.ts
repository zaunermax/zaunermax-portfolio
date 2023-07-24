import { clientFetch } from './sanity-client';
import { groq } from 'next-sanity';
import 'server-only';
import { CreateChatCompletionResponse } from 'openai';

export const getLlmContext = async () => {
	return clientFetch<{ text: string; order: number }[]>(
		groq`*[_type == 'llm-content'] | order(order asc)`,
	);
};

export const extractAnswer = ({ data }: { data: CreateChatCompletionResponse }) =>
	data.choices[0].message?.content;
