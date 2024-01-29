import { cachedCdnClientFetch, cachedClientFetch } from '@/lib/sanity-client';
import { groq } from 'next-sanity';

export type IntroSentenceV2 = {
	sentence: string;
	isRandom: boolean;
};

export type IntroSentencesV2Type = {
	introSentencesV2: IntroSentenceV2[];
};

export const getIntroSentencesV2 = (useCdn = false): Promise<IntroSentencesV2Type> =>
	(useCdn ? cachedClientFetch : cachedCdnClientFetch)(
		groq`*[_type == 'general'][0]{ introSentencesV2 }`,
	);
