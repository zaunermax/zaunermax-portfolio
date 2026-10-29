import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/lab/1-quest')({
	beforeLoad: () => {
		throw redirect({ to: '/', statusCode: 307 });
	},
});
