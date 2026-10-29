import { createFileRoute } from '@tanstack/react-router';
import { MaxOS } from '@/maxos/maxos';
import { business } from '@/lab-shared/content';
import { loadMaxOS } from '@/server/portfolio.functions';

export const Route = createFileRoute('/os')({
	loader: () => loadMaxOS(),
	head: () => ({ meta: [{ title: 'maxOS – Max Zauner' }] }),
	component: MaxOSPage,
});

function MaxOSPage() {
	return <MaxOS content={Route.useLoaderData()} business={business} fontClass="" />;
}
