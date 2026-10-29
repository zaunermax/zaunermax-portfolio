import { createFileRoute } from '@tanstack/react-router';
import { methodNotAllowed } from '@/lib/method-not-allowed';

export const Route = createFileRoute('/api/completion')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const { POST } = await import('@/server/handlers/completion.server');
				return POST(request);
			},
			ANY: methodNotAllowed('POST'),
		},
	},
});
