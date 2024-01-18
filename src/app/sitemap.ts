import { MetadataRoute } from 'next';
import { serverURL } from '@/lib/server-only/server-url';
import { getWikiContent } from '@/lib/get-wiki-content';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const content = await getWikiContent();
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
			url: `${serverURL}/impressum`,
			lastModified: new Date(),
		},
		...content.map((c) => ({
			url: `${serverURL}/wiki/${c.filename}`,
			lastModified: new Date(),
		})),
	];
}
