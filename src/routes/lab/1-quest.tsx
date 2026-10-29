import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/lab/1-quest')({
	beforeLoad: ({ location }) => {
		// Keep the query: Quest's review links carry seed/at/dist/fx parameters.
		throw redirect({ href: `/${location.searchStr}`, statusCode: 307 });
	},
});
