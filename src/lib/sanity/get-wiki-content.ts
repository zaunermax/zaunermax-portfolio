import { sanityFetch } from '@/lib/sanity-client';
import { type PortableTextBlock } from '@portabletext/react';

export type WikiContent = {
	filename: string;
	commitMsg: string;
	relativeTimeAgo: string;
};

export const getWikiContent = () => {
	return sanityFetch<WikiContent[]>({
		query: `*[_type == 'wiki-page'] | order(order asc) { filename, commitMsg, relativeTimeAgo }`,
		tags: ['wiki-page'],
	});
};

export type WikiPageContent = {
	content: PortableTextBlock;
	filename: string;
	commitMsg: string;
};

export const getWikiPageContent = async (docName: string) => {
	return sanityFetch<WikiPageContent | null>({
		query: `*[_type == 'wiki-page' && filename == $docName][0]{ content, filename, commitMsg }`,
		params: { docName },
	});
};
