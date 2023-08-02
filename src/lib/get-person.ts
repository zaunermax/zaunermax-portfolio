import { cachedCdnClientFetch, cachedClientFetch, getClient } from '@/lib/sanity-client';
import { groq } from 'next-sanity';

export const getIntroSentences = async () => {
	return cachedCdnClientFetch<{ introSentences: string[] }>(
		groq`*[_type == 'person' && name == 'Max'][0]{ introSentences }`,
	);
};

export const getCVUrl = async () => {
	return cachedClientFetch<{ fileUrl: string }>(
		groq`*[_type == 'person' && name == 'Max'][0]{ "fileUrl": cv.asset->url}`,
	);
};
