import { env } from 'cloudflare:workers';
import { clientKey } from '@/quest/server/rate-limit.server';

async function forward(request: Request): Promise<Response> {
	const headers = new Headers(request.headers);
	// The caller cannot choose its trusted identity at the DO boundary.
	headers.set('X-Quest-Client-Key', clientKey(request));
	// Start answers HEAD with the GET handler; the DO only knows GET (Start drops the body).
	const method = request.method === 'HEAD' ? 'GET' : request.method;
	return env.QUEST_FORGE.getByName('global').fetch(new Request(request, { method, headers }));
}

export const GET = forward;
export const POST = forward;
