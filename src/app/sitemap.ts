import { MetadataRoute } from 'next';
import { serverURL } from '@/lib/server-url';

export default function sitemap(): MetadataRoute.Sitemap {
	return [
		{
			url: serverURL,
			lastModified: new Date(),
		},
		{
			url: `${serverURL}/query`,
			lastModified: new Date(),
		},
	];
}