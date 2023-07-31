import { clientFetch } from '@/lib/sanity-client';
import { groq } from 'next-sanity';

export const getIntroSentences = async () => {
	return clientFetch<{ introSentences: string[] }>(
		groq`*[_type == 'person' && name == 'Max'][0]{ introSentences }`,
	);
};

export const getCVUrl = async () => {
	return clientFetch<{ fileUrl: string }>(
		groq`*[_type == 'person' && name == 'Max'][0]{ "fileUrl": cv.asset->url}`,
	);
};
