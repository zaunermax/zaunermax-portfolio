import type { IntroSentenceV2 } from '@/lib/get-intro-sentences-v2';

const shuffleArray = <T>(unShuffledArray: T[]) =>
	unShuffledArray
		.map((value) => ({ value, sort: Math.random() }))
		.sort((a, b) => a.sort - b.sort)
		.map(({ value }) => value);

export function prepareTypeAnimationArray(
	sentences: IntroSentenceV2[],
	delay: number,
	lastDelay: number,
): (string | number)[] {
	const firstRandomIndex = sentences.findIndex((s) => s.isRandom);
	const lastRandomIndex = sentences.findLastIndex((s) => s.isRandom);

	if (firstRandomIndex === -1 || lastRandomIndex === -1) {
		return sentences.map((s) => s.sentence);
	}

	const initialFixed = sentences.slice(0, firstRandomIndex);
	const randomPart = sentences.slice(firstRandomIndex, lastRandomIndex + 1);
	const finalFixed = sentences.slice(lastRandomIndex + 1);

	const shuffledRandomPart = shuffleArray(randomPart);

	const shuffled = [...initialFixed, ...shuffledRandomPart, ...finalFixed];
	const shuffledSentences = shuffled.map((s) => s.sentence);

	return shuffledSentences.reduce(
		(accumulator: (string | number)[], current: string, index: number) => {
			return index < sentences.length - 1
				? [...accumulator, current, delay]
				: [...accumulator, current, lastDelay];
		},
		[],
	);
}
