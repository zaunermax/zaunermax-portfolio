import { cacheLife } from 'next/cache';
import { prepareTypeAnimationArray } from '@/lib/prepare-type-animation-array';
import { getIntroSentencesV2 } from '@/lib/sanity/get-intro-sentences-v2';

export async function getSentences() {
	'use cache';
	cacheLife({ stale: 300, revalidate: 18000, expire: 86400 });
	const content = await getIntroSentencesV2();
	return prepareTypeAnimationArray(content?.introSentencesV2 ?? [], 3000, 5000);
}
