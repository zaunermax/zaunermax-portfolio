import { sanityFetch } from '@/lib/sanity-client';
import { type PortableTextBlock } from '@portabletext/react';

export type EventType = {
	name: string;
	description: PortableTextBlock;
	url: string;
};

export const getEvents = () =>
	sanityFetch<EventType[]>({
		query: `*[_type == 'event'] | order(order asc) { name, description, url }`,
		tags: ['event'],
	});
