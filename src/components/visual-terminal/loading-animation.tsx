'use client';

import { useEffect, useState } from 'react';

const frames = ['-', '\\', '|', '/'];

export const LoadingAnimation = () => {
	const [currentFrame, setCurrentFrame] = useState(0);

	useEffect(() => {
		const id = setInterval(() => {
			setCurrentFrame((currentFrame + 1) % frames.length);
		}, 100);

		return () => clearInterval(id);
	}, [currentFrame]);

	return frames[currentFrame];
};
