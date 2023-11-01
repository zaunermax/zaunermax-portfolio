import { cachedClientFetch } from './sanity-client';
import { groq } from 'next-sanity';
import 'server-only';
import OpenAI from 'openai';

export const getLlmContext = async () => {
	return cachedClientFetch<{ text: string; order: number }[]>(
		groq`*[_type == 'llm-content'] | order(order asc)`,
	);
};

export const extractAnswer = (data: OpenAI.Chat.ChatCompletion) =>
	data.choices[0].message?.content;
