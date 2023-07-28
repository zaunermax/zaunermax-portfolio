'use client';

import { TypeAnimation } from 'react-type-animation';

export const SecondLine = () => {
	return (
		<TypeAnimation
			className="font-mono text-sm font-semibold text-gray-600 dark:text-gray-400 sm:text-xl md:text-2xl"
			speed={60}
			deletionSpeed={80}
			sequence={[
				'Web Technology Solution Architect 🏗️',
				3000,
				'feat(👶): initial commit | Sept 21, 1993',
				3000,
				'Låt oss prater lite Svenska 🇸🇪',
				3000,
				'Why not ask something about me 😉',
				5000,
			]}
			repeat={Infinity}
		/>
	);
};
