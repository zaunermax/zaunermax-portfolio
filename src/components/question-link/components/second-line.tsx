'use client';

import { TypeAnimation } from 'react-type-animation';

export const SecondLine = () => {
	return (
		<TypeAnimation
			className="text-xl font-semibold text-gray-600 dark:text-gray-400 sm:text-2xl md:text-3xl"
			speed={85}
			deletionSpeed={99}
			sequence={[
				'I am a Web Technology Solution Architect',
				3000,
				'feat(👶): initial commit | Sept 21, 1993',
				3000,
				'Ask me anything!',
				5000,
			]}
			repeat={Infinity}
		/>
	);
};
