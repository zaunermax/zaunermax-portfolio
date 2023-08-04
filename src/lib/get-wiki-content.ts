import { cachedClientFetch } from '@/lib/sanity-client';
import { groq } from 'next-sanity';
import { PortableTextProps } from '@portabletext/react';

export const getWikiContent = async () => {
	return cachedClientFetch<
		{ filename: string; commitMsg: string; relativeTimeAgo: string }[]
	>(
		groq`*[_type == 'wiki-page'] | order(order asc) { filename, commitMsg, relativeTimeAgo }`,
	);
};

export const getWikiPageContent = async (docName: string) => {
	return cachedClientFetch<{
		content: PortableTextProps['value'];
		filename: string;
		commitMsg: string;
	}>(
		groq`*[_type == 'wiki-page' && filename == '${docName}'][0]{ content, filename, commitMsg }`,
	);
};
