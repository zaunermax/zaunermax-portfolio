import { sanityFetch } from '@/lib/sanity-client';
import { type PortableTextBlock } from '@portabletext/react';

export type TalksSectionContent = {
	talksContent: PortableTextBlock;
};

export const getTalksSectionContent = () =>
	sanityFetch<TalksSectionContent | null>({
		query: `*[_type == 'general'][0]{ talksContent }`,
		tags: ['general'],
	});
