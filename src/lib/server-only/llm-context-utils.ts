import { cachedClientFetch } from '../sanity-client';
import { groq } from 'next-sanity';
import { OpenAI } from 'openai';
import 'server-only';

export const getLlmContext = async () => {
	return cachedClientFetch<{ text: string; order: number }[]>(
		groq`*[_type == 'llm-content'] | order(order asc)`,
	);
};

export const extractEdgeAnswer = async ({ choices }: OpenAI.ChatCompletion) => {
	return choices[0]?.message?.content;
};

export const extractModeration = async ({
	results,
}: OpenAI.Moderations.ModerationCreateResponse) => {
	return results.some(({ flagged }) => flagged);
};
