import { cachedCdnClientFetch, cachedClientFetch } from '@/lib/sanity-client';
import { groq } from 'next-sanity';

export type GeneralInfoType = {
	name: string;
	introSentences: string[];
	fileUrl: string;
};

export const getGeneralInfo = (useCdn = false) =>
	(useCdn ? cachedClientFetch : cachedCdnClientFetch)<GeneralInfoType>(
		groq`*[_type == 'general'][0]{ name, introSentences, "fileUrl": cv.asset->url }`,
	);
