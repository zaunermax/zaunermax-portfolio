import { sanityFetch } from '@/lib/sanity-client';

export type GeneralInfoType = {
	name: string;
	introSentences: string[];
	fileUrl: string;
};

export const getGeneralInfo = () =>
	sanityFetch<GeneralInfoType>({
		query: `*[_type == 'general'][0]{ name, introSentences, "fileUrl": cv.asset->url }`,
		tags: ['general'],
	});
