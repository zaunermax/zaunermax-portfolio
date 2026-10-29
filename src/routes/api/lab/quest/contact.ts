import { createFileRoute } from '@tanstack/react-router';
import { methodNotAllowed } from '@/lib/method-not-allowed';

export const Route = createFileRoute('/api/lab/quest/contact')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const { POST } = await import('@/server/handlers/quest-contact.server');
				return POST(request);
			},
			ANY: methodNotAllowed('POST'),
		},
	},
});
