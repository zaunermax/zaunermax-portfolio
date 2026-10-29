import { sanityFetch } from './sanity.server';
import type { LabContent, LabTalk, LabWikiPage } from '@/lab-shared/content';

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
