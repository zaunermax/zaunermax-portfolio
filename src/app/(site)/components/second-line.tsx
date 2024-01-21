'use client';

import { TypeAnimation } from 'react-type-animation';
import { useQuery } from '@tanstack/react-query';
import { getSentences } from '@/app/(site)/util/get-sentences';

export const SecondLine = () => {
	const { data: sequence = [], isLoading } = useQuery({
		queryKey: ['sentences'],
		queryFn: getSentences,
	});

	return !isLoading && sequence.length ? (
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
