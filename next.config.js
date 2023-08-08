/** @type {import('next').NextConfig} */
const nextConfig = {
	experimental: {
		serverActions: true,
	},
	redirects: () => {
		return [
			{
				source: '/main',
				destination: '/',
				permanent: false,
			},
			{
				source: '/main/:path*',
				destination: '/:path*',
				permanent: false,
			},
			{
				source: '/impressum',
				destination: '/wiki/IMPRESSUM.md',
				permanent: false,
			},
		];
	},
};

module.exports = nextConfig;
