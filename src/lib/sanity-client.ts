import 'server-only';
import { createClient, type QueryParams } from 'next-sanity';
import { cacheLife, cacheTag } from 'next/cache';

const client = createClient({
	projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
	dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
	// Keep the API date pinned: SDK upgrades should not change GROQ semantics.
	apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2023-07-28',
	perspective: 'published',
	useCdn: false,
});

type SanityFetchParameters = {
	query: string;
	params?: QueryParams;
	tags?: string[];
};

export async function sanityFetch<QueryResponse>({
	query,
	params = {},
	tags = [],
}: SanityFetchParameters): Promise<QueryResponse> {
	'use cache';
	cacheLife('minutes');
	if (tags.length) cacheTag(...tags);
	return client.fetch<QueryResponse>(query, params, { cache: 'no-store' });
}
