import { createServerFn } from '@tanstack/react-start';

export const loadQuest = createServerFn({ method: 'GET' }).handler(async () => {
	const { setResponseHeader } = await import('@tanstack/react-start/server');
	setResponseHeader('Cache-Control', 'no-store');
	const [{ env }, { multiplayerEnabled }] = await Promise.all([
		import('cloudflare:workers'),
		import('./multiplayer.server'),
	]);
	const [{ getLabContent }, { GET }] = await Promise.all([
		import('./lab-content.server'),
		import('./handlers/quest-world-proxy.server'),
	]);
	const [content, initial] = await Promise.all([
		getLabContent(),
		GET(new Request('https://quest.internal/api/lab/quest/world')).then(
			(response) =>
				response.json() as Promise<import('@/quest/world/contract').WorldState>,
		),
	]);
	return { content, initial, multiplayer: multiplayerEnabled(env) };
});

export const loadMaxOS = createServerFn({ method: 'GET' }).handler(async () => {
	const { getLabContent } = await import('./lab-content.server');
	return getLabContent();
});
