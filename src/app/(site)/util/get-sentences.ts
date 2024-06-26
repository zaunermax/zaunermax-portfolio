import { prepareTypeAnimationArray } from '@/lib/prepare-type-animation-array';
import { getIntroSentencesV2 } from '@/lib/sanity/get-intro-sentences-v2';

export const getSentences = () =>
	getIntroSentencesV2().then(({ introSentencesV2 }) =>
		prepareTypeAnimationArray(introSentencesV2, 3000, 5000),
	);
