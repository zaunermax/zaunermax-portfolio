import { Atkinson_Hyperlegible_Next, Jersey_15 } from 'next/font/google';
import { Suspense } from 'react';
import { business, getLabContent } from '../_shared/content';
import { LoadingVeil, ZoneText } from './ui/hud';
import styles from './ui/hud.module.css';
import { QuestApp } from './ui/quest-app';
import { getWorldState } from './world/store';

/**
 * Pixel type for everything that is HUD chrome: titles, labels, keycaps, nameplates. Jersey 15
 * keeps B/G, C/O and Z/8 apart at small sizes (Pixelify Sans read "Byte" as "Gyte").
 */
const pixel = Jersey_15({
	subsets: ['latin', 'latin-ext'],
	weight: '400',
	variable: '--q-pixel',
	display: 'swap',
});
/** A calm, very legible face for anything you actually read: chat, docs, forms. */
const read = Atkinson_Hyperlegible_Next({
	subsets: ['latin'],
	weight: 'variable',
	style: ['normal', 'italic'],
	variable: '--q-read',
	display: 'swap',
	// next/font has no metrics for the "Next" cut yet; skip the generated fallback instead of warning.
	adjustFontFallback: false,
	fallback: ['system-ui', 'sans-serif'],
});
const fontVars = `${pixel.variable} ${read.variable}`;

export const metadata = {
	title: 'Max Zauner – Quest',
	description:
		'Hello, I’m Max. Wander a tiny voxel office that an AI redeploys every hour, chat with me, or file a ticket for your project.',
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
			<LoadingVeil ready={false} name="the office" />
			<ZoneText state="big" worldName="the office" tagline="" />
		</div>
	);
}
