import { createClient, QueryParams } from 'next-sanity';

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET!;
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION!;

export const getClient = (useCdn: boolean) =>
	createClient({
		projectId,
		dataset,
		apiVersion,
		useCdn,
	});

const client = getClient(false);

type SanityFetchParameters = {
	query: string;
	params?: QueryParams;
	tags?: string[];
};

export const sanityFetch = async <QueryResponse>({
	query,
	params = {},
	tags,
}: SanityFetchParameters) =>
	client.fetch<QueryResponse>(query, params, {
		next: { tags },
	});
