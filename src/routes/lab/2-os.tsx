import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/lab/2-os')({
	beforeLoad: () => {
		throw redirect({ to: '/os', statusCode: 307 });
	},
});
