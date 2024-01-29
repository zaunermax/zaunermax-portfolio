import { cachedClientFetch } from '@/lib/sanity-client';
import { groq } from 'next-sanity';
import { PortableTextProps } from '@portabletext/react';

export type EventType = {
	name: string;
	description: PortableTextProps['value'];
	url: string;
};

export const getEvents = () => {
	return cachedClientFetch<EventType[]>(
		groq`*[_type == 'event'] | order(order asc) { name, description, url }`,
	);
};
