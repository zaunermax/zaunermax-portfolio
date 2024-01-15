import { getGeneralInfo } from '@/lib/get-general-info';
import { prepareTypeAnimationArray } from '@/lib/prepare-type-animation-array';

export const getSentences = () =>
	getGeneralInfo().then(({ introSentences }) =>
		prepareTypeAnimationArray(introSentences, 3000, 5000),
	);
