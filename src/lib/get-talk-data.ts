import { cachedClientFetch } from '@/lib/sanity-client';
import { groq } from 'next-sanity';

type TalkData = {
	event: string;
	talk: string;
	date: string;
	fileUrls: string[];
};

export const getTalkData = (slug: string) => {
	return cachedClientFetch<TalkData | null>(
		groq`*[_type == 'talk' && slug == $slug][0]{ event, talk, "fileUrls": files[].asset->url, date }`,
		{ slug },
	);
};
