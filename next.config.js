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

const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig(
	nextConfig,
	{
		// https://github.com/getsentry/sentry-webpack-plugin#options
		silent: true,
		org: 'dcosam',
		project: 'zaunermax-portfolio',
	},
	{
		// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
		widenClientFileUpload: true,
		transpileClientSDK: false,
		tunnelRoute: '/monitoring',
		hideSourceMaps: true,
		disableLogger: true,
	},
);
