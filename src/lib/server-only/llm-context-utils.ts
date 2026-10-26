import 'server-only';
import { sanityFetch } from '../sanity-client';

export const getLlmContext = () =>
	sanityFetch<{ text: string; order: number }[]>({
		query: `*[_type == 'llm-content' && defined(text)] | order(order asc) { text, order }`,
		tags: ['llm-content'],
	});
