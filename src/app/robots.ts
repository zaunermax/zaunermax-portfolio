import { MetadataRoute } from 'next';
import { serverURL } from '@/lib/server-only/server-url';

export default function robots(): MetadataRoute.Robots {
	const base = serverURL;

	return {
		rules: {
			userAgent: '*',
			allow: '/',
		},
		sitemap: `${serverURL}/sitemap.xml`,
	};
}
