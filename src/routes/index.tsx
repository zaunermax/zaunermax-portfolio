import { Suspense } from 'react';
import { Await, createFileRoute } from '@tanstack/react-router';
import { business } from '@/lab-shared/content';
import { QuestApp } from '@/quest/ui/quest-app';
import { LoadingVeil, ZoneText } from '@/quest/ui/hud';
import styles from '@/quest/ui/hud.module.css';
import { loadQuest } from '@/server/portfolio.functions';
import pixelFont from '@fontsource/jersey-15/files/jersey-15-latin-400-normal.woff2?url';
import readFont from '@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2?url';
import readItalicFont from '@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-italic.woff2?url';

// The loading screen and the big hello use these straight away: fetch them alongside the CSS
// instead of after it, so the first paint already has them.
const fontPreloads = [pixelFont, readFont, readItalicFont].map((href) => ({
	rel: 'preload',
	href,
	as: 'font',
	type: 'font/woff2',
	crossOrigin: 'anonymous' as const,
}));

export const Route = createFileRoute('/')({
	loader: () => ({ quest: loadQuest() }),
	staleTime: 0,
	gcTime: 0,
	headers: () => ({ 'Cache-Control': 'no-store' }),
	head: () => ({
		meta: [
			{ title: 'Max Zauner – Quest' },
			{
				name: 'description',
				content:
					'Hello, I’m Max. Wander a tiny voxel office that an AI redeploys every hour, chat with me, or file a ticket for your project.',
			},
		],
		links: fontPreloads,
	}),
	pendingComponent: Arriving,
	component: QuestPage,
});

function QuestPage() {
	const { quest } = Route.useLoaderData();
	return (
		<Suspense fallback={<Arriving />}>
			<Await promise={quest}>
				{({ content, initial, multiplayer }) => (
					<QuestApp
						initial={initial}
						content={content}
						business={business}
						multiplayer={multiplayer}
						fontVars=""
					/>
				)}
			</Await>
		</Suspense>
	);
}

function Arriving() {
	return (
		<div className={styles.root}>
			<LoadingVeil ready={false} name="the office" />
			<ZoneText state="big" worldName="the office" tagline="" />
		</div>
	);
}
