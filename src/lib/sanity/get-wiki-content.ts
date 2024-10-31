import { sanityFetch } from '@/lib/sanity-client';
import { PortableTextProps } from '@portabletext/react';

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
	content: PortableTextProps['value'];
	filename: string;
	commitMsg: string;
};

export const getWikiPageContent = async (docName: string) => {
	return sanityFetch<WikiPageContent | null>({
		query: `*[_type == 'wiki-page' && filename == $docName][0]{ content, filename, commitMsg }`,
		params: { docName },
		tags: ['wiki-page'],
	});
};
