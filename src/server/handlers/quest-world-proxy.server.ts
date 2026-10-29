import { env } from 'cloudflare:workers';
import { clientKey } from '@/quest/server/rate-limit.server';

async function forward(request: Request): Promise<Response> {
	const headers = new Headers(request.headers);
	// The caller cannot choose its trusted identity at the DO boundary.
	headers.set('X-Quest-Client-Key', clientKey(request));
	return env.QUEST_FORGE.getByName('global').fetch(new Request(request, { headers }));
}

export const GET = forward;
export const POST = forward;
