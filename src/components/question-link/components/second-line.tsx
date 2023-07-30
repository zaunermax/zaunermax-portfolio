'use client';

import { TypeAnimation } from 'react-type-animation';
import { useEffect, useState } from 'react';

export const SecondLine = () => {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		if (!mounted) setMounted(true);
	}, [mounted]);

	return mounted ? (
		<TypeAnimation
			className="font-mono text-sm font-semibold text-gray-600 dark:text-gray-400 sm:text-xl md:text-2xl"
			speed={60}
			deletionSpeed={80}
			sequence={[
				'Web Technology Solution Architect 🏗️',
				3000,
				'feat(👶): initial commit | Sept 21, 1993',
				3000,
				'Låt oss prata lite Svenska 🇸🇪',
				3000,
				'Why not ask something about me 😉',
				5000,
			]}
			repeat={Infinity}
		/>
	) : (
		<div className="font-mono text-sm font-semibold text-gray-600 dark:text-gray-400 sm:text-xl md:text-2xl">
			|
		</div>
	);
};
