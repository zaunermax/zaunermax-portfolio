import { sanityFetch } from '@/lib/sanity-client';

export type PublicTalk = {
	event: string;
	talk: string;
	date: string;
	slug: string;
};

const query = `
*[_type == 'talk' && public == true] | order(_createdAt desc) {
	"event": eventV2 -> name,
	talk,
	date,
	slug,
}`;

export const getPublicTalks = () =>
	sanityFetch<PublicTalk[]>({
		query,
		tags: ['talk'],
	});
