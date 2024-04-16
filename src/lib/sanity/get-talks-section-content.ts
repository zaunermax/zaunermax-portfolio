import { sanityFetch } from '@/lib/sanity-client';
import { PortableTextProps } from '@portabletext/react';

export type TalksSectionContent = {
	talksContent: PortableTextProps['value'];
};

export const getTalksSectionContent = () =>
	sanityFetch<TalksSectionContent | null>({
		query: `*[_type == 'general'][0]{ talksContent }`,
		tags: ['general'],
	});
