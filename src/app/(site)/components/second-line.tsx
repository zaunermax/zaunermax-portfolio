'use client';

import { TypeAnimation } from 'react-type-animation';
import { useEffect, useState } from 'react';
import { prepareTypeAnimationArray } from '@/lib/prepare-type-animation-array';
import { getGeneralInfo } from '@/lib/get-general-info';

export const SecondLine = () => {
	const [sequence, setSequence] = useState([] as (number | string)[]);

	useEffect(() => {
		getGeneralInfo(true).then(({ introSentences }) => {
			setSequence(prepareTypeAnimationArray(introSentences, 3000, 5000));
		});
	}, []);

	return sequence.length ? (
		<span className="relative">
			<ul className="sr-only">
				<li>
					Imagine some typewriter animation that types out some sentences about Max with a
					blinking cursor. The sentences are typed out, remain for a few milliseconds and
					are then removed again showing the next sentence:
				</li>
				{sequence.map((sentence, idx) =>
					typeof sentence === 'string' ? (
						<li key={idx} role={'text'}>
							{`${idx + 1}. sentence about Max: ${sentence}`}
						</li>
					) : null,
				)}
			</ul>
			<TypeAnimation
				aria-hidden={'true'}
				className="font-mono text-sm font-semibold text-gray-600 dark:text-gray-400 sm:text-xl md:text-2xl"
				speed={60}
				deletionSpeed={80}
				sequence={sequence}
				repeat={Infinity}
			/>
		</span>
	) : (
		<div className="font-mono text-sm font-semibold text-gray-600 dark:text-gray-400 sm:text-xl md:text-2xl">
			Loading ... |
		</div>
	);
};
