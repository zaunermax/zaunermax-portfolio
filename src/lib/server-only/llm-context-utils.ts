import { cachedClientFetch } from '../sanity-client';
import { groq } from 'next-sanity';
import { ResponseTypes } from 'openai-edge';
import 'server-only';

export const getLlmContext = async () => {
	return cachedClientFetch<{ text: string; order: number }[]>(
		groq`*[_type == 'llm-content'] | order(order asc)`,
	);
};

export const extractEdgeAnswer = async (data: Response) => {
	const res = (await data.json()) as ResponseTypes['createChatCompletion'];
	return res.choices[0].message?.content;
};

export const extractModeration = async (data: Response) => {
	const { results } = (await data.json()) as ResponseTypes['createModeration'];
	return results.some(({ flagged }) => flagged);
};
