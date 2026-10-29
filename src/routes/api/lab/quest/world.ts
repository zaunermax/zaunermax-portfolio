import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/lab/quest/world')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const { GET } = await import('@/server/handlers/quest-world-proxy.server');
				return GET(request);
			},
			POST: async ({ request }) => {
				const { POST } = await import('@/server/handlers/quest-world-proxy.server');
				return POST(request);
			},
		},
	},
});
