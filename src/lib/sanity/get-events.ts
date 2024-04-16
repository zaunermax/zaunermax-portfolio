import { sanityFetch } from '@/lib/sanity-client';
import { PortableTextProps } from '@portabletext/react';

export type EventType = {
	name: string;
	description: PortableTextProps['value'];
	url: string;
};

export const getEvents = () =>
	sanityFetch<EventType[]>({
		query: `*[_type == 'event'] | order(order asc) { name, description, url }`,
		tags: ['event'],
	});
