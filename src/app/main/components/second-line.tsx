'use client';

import { TypeAnimation } from 'react-type-animation';
import React, { useEffect, useState } from 'react';
import { getIntroSentences } from '@/lib/get-person';
import { prepareTypeAnimationArray } from '@/lib/prepare-type-animation-array';

export const SecondLine = () => {
	const [sequence, setSequence] = useState([] as (number | string)[]);

	useEffect(() => {
		getIntroSentences().then(({ introSentences }) =>
			setSequence(prepareTypeAnimationArray(introSentences, 3000, 5000)),
		);
	}, []);

	return sequence.length ? (
		<TypeAnimation
			className="font-mono text-sm font-semibold text-gray-600 dark:text-gray-400 sm:text-xl md:text-2xl"
			speed={60}
			deletionSpeed={80}
			sequence={sequence}
			repeat={Infinity}
		/>
	) : (
		<div className="font-mono text-sm font-semibold text-gray-600 dark:text-gray-400 sm:text-xl md:text-2xl">
			Loading ... |
		</div>
	);
};
