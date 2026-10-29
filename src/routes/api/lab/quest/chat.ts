import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/lab/quest/chat')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const { POST } = await import('@/server/handlers/quest-chat.server');
				return POST(request);
			},
		},
	},
});
