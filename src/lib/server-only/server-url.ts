import 'server-only';

const host =
	process.env.BASE_DOMAIN ??
	process.env.VERCEL_PROJECT_PRODUCTION_URL ??
	process.env.VERCEL_URL ??
	'localhost:3000';
const protocol =
	process.env.HTTP_PROTOCOL ?? (host.startsWith('localhost') ? 'http' : 'https');
export const serverURL = new URL(process.env.SITE_URL ?? `${protocol}://${host}`).origin;
