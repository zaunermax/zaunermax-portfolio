import { createClient } from 'next-sanity';
import { cache } from 'react';

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
const cdnClient = getClient(true);

export const cachedClientFetch = cache(client.fetch.bind(client));
export const cachedCdnClientFetch = cache(cdnClient.fetch.bind(cdnClient));
