import type { PortableTextProps } from '@portabletext/react';

export type LabWikiPage = {
	filename: string;
	commitMsg: string;
	relativeTimeAgo: string;
	content: PortableTextProps['value'];
	/** Plain text of the page, handy for previews. */
	text: string;
};

export type LabTalk = {
	event: string;
	talk: string;
	/** dd.MM.yyyy as stored in the CMS */
	date: string;
	slug: string;
};

export type LabContent = {
	/** Fun facts that the old landing page typed out one after another. */
	facts: string[];
	wiki: LabWikiPage[];
	talks: LabTalk[];
	events: { name: string; url: string }[];
};

// Business copy is not in the CMS yet; keep it here until the content pass.
export const business = {
	name: 'Max Zauner',
	tagline: 'Independent software engineer in Vienna',
	pitch:
		'I build web products end to end, from the first prototype to the thing that runs in production. AI features included, when they actually help.',
	email: 'hello@zaunermax.at',
	services: ['Product prototypes', 'Web apps with Next.js & React', 'AI features that ship'],
	links: {
		github: 'https://github.com/zaunermax',
		linkedin: 'https://www.linkedin.com/in/zaunermax/',
	},
} as const;
