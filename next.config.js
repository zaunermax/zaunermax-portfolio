/** @type {import('next').NextConfig} */
const nextConfig = {
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
