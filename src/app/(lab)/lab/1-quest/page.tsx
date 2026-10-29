import { Alegreya, Alegreya_Sans, Marcellus } from 'next/font/google';
import { Suspense } from 'react';
import { business, getLabContent } from '../_shared/content';
import { LoadingVeil, ZoneText } from './ui/hud';
import styles from './ui/hud.module.css';
import { QuestApp } from './ui/quest-app';
import { getWorldState } from './world/store';

const title = Marcellus({
	weight: '400',
	subsets: ['latin'],
	variable: '--q-title',
	display: 'swap',
});
const read = Alegreya({
	subsets: ['latin'],
	weight: ['400', '500', '700'],
	style: ['normal', 'italic'],
	variable: '--q-read',
	display: 'swap',
});
const ui = Alegreya_Sans({
	subsets: ['latin'],
	weight: ['400', '500', '700'],
	style: ['normal', 'italic'],
	variable: '--q-ui',
	display: 'swap',
});
const fontVars = `${title.variable} ${read.variable} ${ui.variable}`;

export const metadata = {
	title: 'Max Zauner – Quest',
	description:
		'Hello, I’m Max. Walk around a little valley that an AI rebuilds every hour, talk to me, or post a quest.',
};

export default function QuestPage() {
	return (
		<Suspense fallback={<Arriving />}>
			<Quest />
		</Suspense>
	);
}

async function Quest() {
	const [content, state] = await Promise.all([getLabContent(), getWorldState()]);
	return (
		<QuestApp initial={state} content={content} business={business} fontVars={fontVars} />
	);
}

/** The static shell: a loading screen that already says hello. */
function Arriving() {
	return (
		<div className={`${styles.root} ${fontVars}`}>
			<LoadingVeil ready={false} name="the valley" />
			<ZoneText state="big" worldName="the valley" tagline="" />
		</div>
	);
}
