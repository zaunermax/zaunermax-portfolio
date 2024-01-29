import { MetadataRoute } from 'next';
import { serverURL } from '@/lib/server-only/server-url';
import { getWikiContent } from '@/lib/sanity/get-wiki-content';
import { getPublicTalks } from '@/lib/sanity/get-public-talks';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const content = await getWikiContent();
	const talks = await getPublicTalks();

	return [
		{
			url: serverURL,
			lastModified: new Date(),
		},
		{
			url: `${serverURL}/query`,
			lastModified: new Date(),
		},
		{
			url: `${serverURL}/wiki`,
			lastModified: new Date(),
		},
		{
			url: `${serverURL}/talks`,
			lastModified: new Date(),
		},
		{
			url: `${serverURL}/impressum`,
			lastModified: new Date(),
		},
		...content.map((c) => ({
			url: `${serverURL}/wiki/${c.filename}`,
			lastModified: new Date(),
		})),
		...talks.map((t) => ({
			url: `${serverURL}/talks/${t.slug}`,
			lastModified: new Date(),
		})),
	];
}
