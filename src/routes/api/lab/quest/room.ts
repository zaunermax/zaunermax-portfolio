import { createFileRoute } from '@tanstack/react-router';
import { methodNotAllowed } from '@/lib/method-not-allowed';

export const Route = createFileRoute('/api/lab/quest/room')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const { GET } = await import('@/server/handlers/quest-room-proxy.server');
				return GET(request);
			},
			ANY: methodNotAllowed('GET'),
		},
	},
});
