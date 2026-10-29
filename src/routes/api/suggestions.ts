import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/suggestions')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const { GET } = await import('@/server/handlers/suggestions.server');
				return GET(request);
			},
			POST: async ({ request }) => {
				const { POST } = await import('@/server/handlers/suggestions.server');
				return POST(request);
			},
		},
	},
});
