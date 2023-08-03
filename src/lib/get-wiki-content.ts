import { cachedClientFetch } from '@/lib/sanity-client';
import { groq } from 'next-sanity';
import { PortableTextProps } from '@portabletext/react';

export const getWikiContent = async () => {
	return cachedClientFetch<
		{ filename: string; commitMsg: string; relativeTimeAgo: string }[]
	>(
		groq`*[_type == 'wiki-page']{ filename, commitMsg, relativeTimeAgo } | order(order asc)`,
	);
};

export const getWikiPageContent = async (docName: string) => {
	return cachedClientFetch<{ content: PortableTextProps['value'] }>(
		groq`*[_type == 'wiki-page' && name == ${docName}][0]{ content }`,
	);
};
