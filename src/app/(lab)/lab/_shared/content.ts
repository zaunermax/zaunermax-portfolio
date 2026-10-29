import 'server-only';
import type { PortableTextProps } from '@portabletext/react';
import { sanityFetch } from '@/lib/sanity-client';

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

export async function getLabContent(): Promise<LabContent> {
	const data = await sanityFetch<{
		facts: { sentence: string }[] | null;
		wiki: LabWikiPage[];
		talks: LabTalk[];
		events: { name: string; url: string }[];
	}>({
		query: `{
			"facts": *[_type == 'general'][0].introSentencesV2[]{ sentence },
			"wiki": *[_type == 'wiki-page'] | order(order asc) {
				filename, commitMsg, relativeTimeAgo, content, "text": pt::text(content)
			},
			"talks": *[_type == 'talk' && public == true] | order(_createdAt desc) {
				"event": eventV2 -> name, talk, date, slug
			},
			"events": *[_type == 'event'] | order(order asc) { name, url }
		}`,
		tags: ['general', 'wiki-page', 'talk', 'event'],
	});

	return {
		facts: (data.facts ?? []).map(({ sentence }) => sentence).filter(Boolean),
		wiki: data.wiki ?? [],
		talks: data.talks ?? [],
		events: data.events ?? [],
	};
}
