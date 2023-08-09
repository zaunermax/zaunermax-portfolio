'use client';

import { NextStudio } from 'next-sanity/studio';

import { config } from '@/sanity';

export function Studio() {
	return <NextStudio config={config} />;
}
