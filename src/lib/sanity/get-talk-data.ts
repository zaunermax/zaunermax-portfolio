import { sanityFetch } from '@/lib/sanity-client';

export type TalkFile = {
	filename: string;
	commitMsg: string;
	relativeTimeAgo: string;
	url: string;
};

export type TalkData = {
	event: string;
	talk: string;
	date: string;
	files: TalkFile[];
};

const query = `
*[_type == 'talk' && slug == $slug][0]{
	event,
	talk,
	"files": files[]{
    filename,
    commitMsg,
    relativeTimeAgo,
    "url": coalesce(file.asset->url, url)
  },
	date
}`;

export const getTalkData = (slug: string) =>
	sanityFetch<TalkData | null>({
		query,
		params: { slug },
		tags: ['talk'],
	});
