/** @type {import('next').NextConfig} */
const nextConfig = {
	experimental: {
		serverActions: true,
	},
	redirects: () => {
		return [
			{
				source: '/',
				destination: '/main',
				permanent: false,
			},
		];
	},
};

module.exports = nextConfig;
