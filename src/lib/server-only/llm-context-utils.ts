import { sanityFetch } from '../sanity-client';
import { OpenAI } from 'openai';
import 'server-only';

export const getLlmContext = async () => {
	return sanityFetch<{ text: string; order: number }[]>({
		query: `*[_type == 'llm-content'] | order(order asc)`,
		tags: ['llm-content'],
	});
};

export const extractEdgeAnswer = async ({ choices }: OpenAI.ChatCompletion) => {
	return choices[0]?.message?.content;
};

export const extractModeration = async ({
	results,
}: OpenAI.Moderations.ModerationCreateResponse) => {
	return results.some(({ flagged }) => flagged);
};
