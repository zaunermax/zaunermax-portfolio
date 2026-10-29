import { IBM_Plex_Mono, Schibsted_Grotesk } from 'next/font/google';
import { business, getLabContent } from '../_shared/content';
import { MaxOS } from './maxos';

const ui = Schibsted_Grotesk({
	subsets: ['latin'],
	display: 'swap',
	variable: '--os-font-ui',
});

const mono = IBM_Plex_Mono({
	subsets: ['latin'],
	weight: ['400', '600'],
	display: 'swap',
	variable: '--os-font-mono',
});

export const metadata = {
	title: 'maxOS – Max Zauner',
};

export default async function MaxOSPage() {
	const content = await getLabContent();
	return (
		<MaxOS
			content={content}
			business={business}
			fontClass={`${ui.variable} ${mono.variable}`}
		/>
	);
}
