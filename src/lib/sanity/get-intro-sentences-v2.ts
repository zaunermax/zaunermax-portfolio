import { sanityFetch } from '@/lib/sanity-client';

export type IntroSentenceV2 = {
	sentence: string;
	isRandom: boolean;
};

export type IntroSentencesV2Type = {
	introSentencesV2: IntroSentenceV2[];
};

export const getIntroSentencesV2 = (useCdn = false) =>
	sanityFetch<IntroSentencesV2Type>({
		query: `*[_type == 'general'][0]{ introSentencesV2 }`,
		tags: ['general'],
	});
