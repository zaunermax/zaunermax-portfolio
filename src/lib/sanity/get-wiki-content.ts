import { cachedClientFetch } from '@/lib/sanity-client';
import { groq } from 'next-sanity';
import { PortableTextProps } from '@portabletext/react';

export type WikiContent = {
	filename: string;
	commitMsg: string;
	relativeTimeAgo: string;
};

export const getWikiContent = async () => {
	return cachedClientFetch<WikiContent[]>(
		groq`*[_type == 'wiki-page'] | order(order asc) { filename, commitMsg, relativeTimeAgo }`,
	);
};

export type WikiPageContent = {
	content: PortableTextProps['value'];
	filename: string;
	commitMsg: string;
};

export const getWikiPageContent = async (docName: string) => {
	return cachedClientFetch<WikiPageContent | null>(
		groq`*[_type == 'wiki-page' && filename == $docName][0]{ content, filename, commitMsg }`, { docName }
	);
};
