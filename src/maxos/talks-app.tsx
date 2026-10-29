'use client';

import type { LabContent } from '@/lab-shared/content';
import styles from './os.module.css';

function formatDate(ddmmyyyy: string) {
	const [d, m, y] = ddmmyyyy.split('.').map(Number);
	if (!d || !m || !y) return ddmmyyyy;
	return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
}

function toIso(ddmmyyyy: string) {
	const [d, m, y] = ddmmyyyy.split('.');
	return y && m && d ? `${y}-${m}-${d}` : undefined;
}

type Props = {
	talks: LabContent['talks'];
	events: LabContent['events'];
	index: number;
	onIndexChange: (index: number) => void;
};

export function TalksApp({ talks, events, index, onIndexChange }: Props) {
	if (talks.length === 0)
		return <p className={styles.wikiEmpty}>The carousel is empty.</p>;
	const current = Math.min(index, talks.length - 1);
	const talk = talks[current];
	const go = (delta: number) =>
		onIndexChange((current + delta + talks.length) % talks.length);

	return (
		<div
			className={styles.projector}
			onKeyDown={(event) => {
				if (event.target instanceof HTMLInputElement) return;
				if (event.key === 'ArrowRight') go(1);
				if (event.key === 'ArrowLeft') go(-1);
			}}
		>
			<div className={styles.screen} aria-live="polite">
				<article key={talk.slug} className={styles.slide}>
					<p className={styles.slideEvent}>{talk.event}</p>
					<h3 className={styles.slideTitle}>{talk.talk}</h3>
					<p className={styles.slideDate}>
						<time dateTime={toIso(talk.date)}>{formatDate(talk.date)}</time>
					</p>
					<a href={`https://zaunermax.at/talks/${talk.slug}`} className={styles.slideLink}>
						Open talk files
					</a>
				</article>
			</div>
			<div className={styles.projectorDeck}>
				<button
					type="button"
					className={styles.bevelButton}
					onClick={() => go(-1)}
					aria-label="Previous talk"
					aria-keyshortcuts="ArrowLeft"
				>
					<svg viewBox="0 0 16 16" width={16} height={16} aria-hidden>
						<path d="M11 2L4 8l7 6z" fill="currentColor" />
					</svg>
				</button>
				<p className={styles.slideCounter}>
					Slide {current + 1} of {talks.length}
				</p>
				<button
					type="button"
					className={styles.bevelButton}
					onClick={() => go(1)}
					aria-label="Next talk"
					aria-keyshortcuts="ArrowRight"
					data-autofocus
				>
					<svg viewBox="0 0 16 16" width={16} height={16} aria-hidden>
						<path d="M5 2l7 6-7 6z" fill="currentColor" />
					</svg>
				</button>
			</div>
			{events.length > 0 && (
				<p className={styles.eventsLine}>
					Max speaks at{' '}
					{events.map((event, i) => (
						<span key={event.url}>
							<a href={event.url} className={styles.mdLink}>
								{event.name}
							</a>
							{i < events.length - 2 ? ', ' : i === events.length - 2 ? ' and ' : '.'}
						</span>
					))}
				</p>
			)}
		</div>
	);
}
