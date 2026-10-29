import { createClient, type QueryParams } from '@sanity/client';

export function getSanityClient() {
	return createClient({
		projectId: process.env.SANITY_PROJECT_ID!,
		dataset: process.env.SANITY_DATASET!,
		// Pin GROQ semantics independently of SDK upgrades.
		apiVersion: process.env.SANITY_API_VERSION || '2023-07-28',
		perspective: 'published',
		useCdn: true,
	});
}

export async function sanityFetch<T>({ query, params = {} }: {
	query: string;
	params?: QueryParams;
	tags?: string[];
}): Promise<T> {
	return getSanityClient().fetch<T>(query, params);
}
