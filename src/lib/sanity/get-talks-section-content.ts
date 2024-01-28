import { cachedClientFetch } from '@/lib/sanity-client';
import { groq } from 'next-sanity';
import { PortableTextProps } from '@portabletext/react';

export type TalksSectionContent = {
	talksContent: PortableTextProps['value'];
};

export const getTalksSectionContent = async () => {
	return cachedClientFetch<TalksSectionContent | null>(
		groq`*[_type == 'general'][0]{ talksContent }`,
	);
};
