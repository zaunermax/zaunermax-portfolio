import { cachedClientFetch } from '../sanity-client';
import { groq } from 'next-sanity';
import OpenAI from 'openai';
import { ResponseTypes } from 'openai-edge';
import 'server-only';

export const getLlmContext = async () => {
	return cachedClientFetch<{ text: string; order: number }[]>(
		groq`*[_type == 'llm-content'] | order(order asc)`,
	);
};

export const extractAnswer = (data: OpenAI.Chat.ChatCompletion) =>
	data.choices[0].message?.content;

export const extractEdgeAnswer = async (data: Response) => {
	const res = (await data.json()) as ResponseTypes['createChatCompletion'];
	return res.choices[0].message?.content;
};
