import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	reactCompiler: true,
	cacheComponents: true,
	partialPrefetching: true,
	async redirects() {
		return [
			{ source: '/main', destination: '/', permanent: false },
			{ source: '/main/:path*', destination: '/:path*', permanent: false },
			{ source: '/impressum', destination: '/wiki/IMPRESSUM.md', permanent: false },
		];
	},
};

export default nextConfig;
