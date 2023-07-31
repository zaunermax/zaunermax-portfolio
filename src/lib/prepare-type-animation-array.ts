export function prepareTypeAnimationArray(
	myStrings: string[],
	delay: number,
	lastDelay: number,
): (string | number)[] {
	return myStrings.reduce(
		(accumulator: (string | number)[], current: string, index: number) => {
			return index < myStrings.length - 1
				? [...accumulator, current, delay]
				: [...accumulator, current, lastDelay];
		},
		[],
	);
}
