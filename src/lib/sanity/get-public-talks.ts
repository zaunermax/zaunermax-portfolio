import { cachedClientFetch } from '@/lib/sanity-client';
import { groq } from 'next-sanity';

export type PublicTalk = {
	event: string;
	talk: string;
	date: string;
	slug: string;
};

export const getPublicTalks = () => {
	return cachedClientFetch<PublicTalk[]>(groq`
*[_type == 'talk' && public == true]{
	"event": eventV2 -> name,
	talk,
	date,
	slug,
}
`);
};
