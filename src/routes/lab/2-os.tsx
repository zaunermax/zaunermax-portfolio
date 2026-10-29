import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/lab/2-os')({
	beforeLoad: ({ location }) => {
		// Keep the query: Quest's review links carry seed/at/dist/fx parameters.
		throw redirect({ href: `/os${location.searchStr}`, statusCode: 307 });
	},
});
