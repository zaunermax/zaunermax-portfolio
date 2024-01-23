import { cachedClientFetch } from '@/lib/sanity-client';
import { groq } from 'next-sanity';

export type TalkFile = {
	filename: string;
	commitMsg: string;
	relativeTimeAgo: string;
	fileUrl: string;
};

export type TalkData = {
	event: string;
	talk: string;
	date: string;
	files: TalkFile[];
};

export const getTalkData = (slug: string) => {
	return cachedClientFetch<TalkData | null>(
		groq`
*[_type == 'talk' && slug == $slug][0]{
	event,
	talk,
	"files": files[]{
    filename,
    commitMsg,
    relativeTimeAgo,
    "fileUrl": file.asset->url
  },
	date
}`,
		{ slug },
	);
};
