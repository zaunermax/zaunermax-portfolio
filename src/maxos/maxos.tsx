'use client';

import { Dialog } from '@base-ui/react/dialog';
import {
	useEffect,
	useState,
	useSyncExternalStore,
	type ComponentType,
	type SVGProps,
} from 'react';
import type { LabContent } from '@/lab-shared/content';
import { useAsk } from '@/lab-shared/use-ask';
import { useMediaQuery, useReducedMotion } from './hooks';
import {
	AboutIcon,
	FactsIcon,
	MailIcon,
	MaxOSMark,
	TalksIcon,
	TerminalIcon,
	WikiIcon,
} from './icons';
import {
	APP_IDS,
	APP_TITLES,
	initialLayout,
	isOffscreen,
	revealed,
	type AppId,
	type Win,
	type Wins,
} from './window-layout';
import { MenuBar } from './menu-bar';
import styles from './os.module.css';
import { AboutApp, FactsNote, MailApp, type BusinessInfo } from './small-apps';
import { TalksApp } from './talks-app';
import { TerminalApp } from './terminal-app';
import { WikiApp } from './wiki-app';
import { WindowFrame } from './window-frame';

const ICONS: Record<AppId, ComponentType<SVGProps<SVGSVGElement>>> = {
	terminal: TerminalIcon,
	wiki: WikiIcon,
	talks: TalksIcon,
	mail: MailIcon,
	facts: FactsIcon,
	about: AboutIcon,
};

const DESKTOP_ICONS: { id: AppId; label: string }[] = [
	{ id: 'terminal', label: 'Terminal' },
	{ id: 'wiki', label: 'Wiki' },
	{ id: 'talks', label: 'Talks' },
	{ id: 'mail', label: 'Hire Max' },
	{ id: 'facts', label: 'facts.txt' },
];

const HOME_APPS: { id: AppId; label: string }[] = [
	{ id: 'terminal', label: 'Ask Max' },
	{ id: 'wiki', label: 'Wiki' },
	{ id: 'talks', label: 'Talks' },
	{ id: 'mail', label: 'Hire Max' },
];

const BOOT_KEY = 'maxos-booted';

function subscribeResize(onChange: () => void) {
	window.addEventListener('resize', onChange);
	return () => window.removeEventListener('resize', onChange);
}

function useViewport() {
	const size = useSyncExternalStore(
		subscribeResize,
		() => `${window.innerWidth}x${window.innerHeight}`,
		() => null,
	);
	if (!size) return null;
	const [w, h] = size.split('x').map(Number);
	return { w, h };
}

const noSubscribe = () => () => {};

/** One boot splash per session; Restart replays it. Skipped when motion is reduced. */
function useBoot() {
	const skip = useSyncExternalStore(
		noSubscribe,
		() =>
			sessionStorage.getItem(BOOT_KEY) === '1' ||
			window.matchMedia('(prefers-reduced-motion: reduce)').matches,
		() => false,
	);
	const [done, setDone] = useState(false);
	const [restarts, setRestarts] = useState(0);
	const [restarting, setRestarting] = useState(false);
	const showing = restarting || (!skip && !done);

	const finish = () => {
		sessionStorage.setItem(BOOT_KEY, '1');
		setDone(true);
		setRestarting(false);
	};

	// The splash times itself in CSS; this catches the case where it ended before hydration.
	useEffect(() => {
		if (!showing) return;
		const id = window.setTimeout(() => {
			sessionStorage.setItem(BOOT_KEY, '1');
			setDone(true);
			setRestarting(false);
		}, 1600);
		return () => window.clearTimeout(id);
	}, [showing, restarts]);

	return {
		showing,
		key: restarts,
		finish,
		restart: () => {
			setRestarts((n) => n + 1);
			setRestarting(true);
		},
	};
}

type Props = { content: LabContent; business: BusinessInfo; fontClass: string };

export function MaxOS({ content, business, fontClass }: Props) {
	const isMobile = useMediaQuery('(max-width: 767px)');
	const reducedMotion = useReducedMotion();
	const viewport = useViewport();
	const asker = useAsk();
	const boot = useBoot();

	const [wikiFile, setWikiFile] = useState(content.wiki[0]?.filename ?? '');
	const [talkIndex, setTalkIndex] = useState(0);
	const [wins, setWins] = useState<Wins | null>(null);
	const [focusRequest, setFocusRequest] = useState<{ id: AppId; n: number }>({
		id: 'terminal',
		n: 0,
	});
	const [sliding, setSliding] = useState<AppId | null>(null);
	const [sheet, setSheet] = useState<AppId>('terminal');
	const [sheetOpen, setSheetOpen] = useState(false);

	// Until someone touches a window, the arrangement follows the viewport.
	const layout = wins ?? (viewport ? initialLayout(viewport.w, viewport.h) : null);
	const openIds = layout ? APP_IDS.filter((id) => layout[id].open) : [];
	const visible = layout ? openIds.filter((id) => !layout[id].minimized) : [];
	const activeId = layout
		? visible.reduce<AppId | null>(
				(top, id) => (!top || layout[id].z > layout[top].z ? id : top),
				null,
			)
		: null;

	function update(fn: (ws: Wins) => Wins) {
		if (!viewport) return;
		setWins((prev) => fn(prev ?? initialLayout(viewport.w, viewport.h)));
	}

	const topZ = (ws: Wins) => Math.max(...APP_IDS.map((id) => ws[id].z));

	function raise(id: AppId) {
		update((ws) =>
			ws[id].z === topZ(ws) ? ws : { ...ws, [id]: { ...ws[id], z: topZ(ws) + 1 } },
		);
	}

	function slideIntoView(id: AppId) {
		if (!reducedMotion) {
			setSliding(id);
			window.setTimeout(() => setSliding((s) => (s === id ? null : s)), 260);
		}
	}

	function reveal(id: AppId) {
		if (!viewport || !layout || !isOffscreen(layout[id], viewport.w, viewport.h)) return;
		slideIntoView(id);
		update((ws) => ({ ...ws, [id]: revealed(ws[id], viewport.w, viewport.h) }));
	}

	function openApp(id: AppId) {
		if (isMobile) {
			setSheet(id);
			setSheetOpen(true);
			return;
		}
		if (!viewport) return;
		if (layout && layout[id].open && isOffscreen(layout[id], viewport.w, viewport.h))
			slideIntoView(id);
		update((ws) => ({
			...ws,
			[id]: revealed(
				{ ...ws[id], open: true, minimized: false, z: topZ(ws) + 1 },
				viewport.w,
				viewport.h,
			),
		}));
		setFocusRequest((r) => ({ id, n: r.n + 1 }));
	}

	function focusLater(selector: string) {
		requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
	}

	function close(id: AppId) {
		update((ws) => ({ ...ws, [id]: { ...ws[id], open: false, minimized: false } }));
		focusLater(`[data-app-icon="${id}"]`);
	}

	function minimize(id: AppId) {
		update((ws) => ({ ...ws, [id]: { ...ws[id], minimized: true } }));
		focusLater(`[data-dock-tab="${id}"]`);
	}

	function move(id: AppId, rect: Pick<Win, 'x' | 'y' | 'w' | 'h'>) {
		update((ws) => ({ ...ws, [id]: { ...ws[id], ...rect } }));
	}

	function openWikiFile(filename: string) {
		setWikiFile(filename);
		openApp('wiki');
	}

	function restart() {
		setWins(null);
		setSheetOpen(false);
		boot.restart();
	}

	function renderApp(id: AppId) {
		switch (id) {
			case 'terminal':
				return <TerminalApp asker={asker} onOpenWikiFile={openWikiFile} />;
			case 'facts':
				return (
					<FactsNote
						facts={content.facts}
						instant={reducedMotion}
						paused={boot.showing}
					/>
				);
			case 'mail':
				return <MailApp business={business} />;
			case 'wiki':
				return (
					<WikiApp pages={content.wiki} selected={wikiFile} onSelect={setWikiFile} />
				);
			case 'talks':
				return (
					<TalksApp
						talks={content.talks}
						events={content.events}
						index={talkIndex}
						onIndexChange={setTalkIndex}
					/>
				);
			case 'about':
				return <AboutApp business={business} onHire={() => openApp('mail')} />;
		}
	}

	const hero = (
		<div className={styles.hero}>
			<h1 className={styles.heroTitle}>
				<span className={styles.heroHello}>Hello, I&rsquo;m</span>{' '}
				<span className={styles.heroMax}>Max</span>
			</h1>
			<p className={styles.heroTag}>{business.tagline}.</p>
		</div>
	);

	return (
		<div className={`${styles.os} ${fontClass}`}>
			<MenuBar
				fontClass={fontClass}
				compact={isMobile !== false}
				content={content}
				business={business}
				hasWindow={visible.length > 0}
				onOpen={openApp}
				onOpenWikiFile={openWikiFile}
				onOpenTalk={(index) => {
					setTalkIndex(index);
					openApp('talks');
				}}
				onCloseTop={() => activeId && close(activeId)}
				onMinimizeTop={() => activeId && minimize(activeId)}
				onRestart={restart}
			/>

			{isMobile === false && layout ? (
				<main key={`desktop-${boot.key}`} className={styles.desktop}>
					{hero}
					<nav aria-label="Desktop" className={styles.desktopIcons}>
						<ul>
							{DESKTOP_ICONS.map(({ id, label }) => {
								const Icon = ICONS[id];
								return (
									<li key={id}>
										<button
											type="button"
											data-app-icon={id}
											data-open={layout[id].open || undefined}
											className={styles.desktopIcon}
											onClick={() => openApp(id)}
										>
											<Icon />
											<span>{label}</span>
										</button>
									</li>
								);
							})}
						</ul>
					</nav>

					{openIds.map((id) => (
						<WindowFrame
							key={id}
							id={id}
							title={APP_TITLES[id]}
							win={clampToViewport(layout[id], viewport)}
							active={id === activeId}
							sliding={sliding === id}
							variant={
								id === 'terminal' ? 'terminal' : id === 'facts' ? 'sticky' : 'platinum'
							}
							focusRequest={focusRequest.id === id ? focusRequest.n : 0}
							onRaise={raise}
							onReveal={reveal}
							onClose={close}
							onMinimize={minimize}
							onMove={move}
						>
							{renderApp(id)}
						</WindowFrame>
					))}

					{openIds.length > 0 && (
						<nav aria-label="Open windows" className={styles.dock}>
							<ul>
								{openIds.map((id) => {
									const Icon = ICONS[id];
									return (
										<li key={id}>
											<button
												type="button"
												data-dock-tab={id}
												data-minimized={layout[id].minimized || undefined}
												data-active={id === activeId || undefined}
												className={styles.dockTab}
												onClick={() => openApp(id)}
											>
												<Icon width={20} height={20} />
												{APP_TITLES[id]}
												{layout[id].minimized && (
													<span className={styles.srOnly}> (minimized)</span>
												)}
											</button>
										</li>
									);
								})}
							</ul>
						</nav>
					)}
				</main>
			) : (
				<main className={styles.home}>
					{hero}
					{isMobile && (
						<>
							<nav aria-label="Apps">
								<ul className={styles.appGrid}>
									{HOME_APPS.map(({ id, label }) => {
										const Icon = ICONS[id];
										return (
											<li key={id}>
												<button
													type="button"
													className={styles.appTile}
													onClick={() => openApp(id)}
												>
													<Icon width={56} height={56} />
													<span>{label}</span>
												</button>
											</li>
										);
									})}
								</ul>
							</nav>
							<section className={styles.homeNote} aria-labelledby="home-facts">
								<h2 id="home-facts" className={styles.homeNoteTitle}>
									facts.txt
								</h2>
								<FactsNote
									key={boot.key}
									facts={content.facts}
									instant={reducedMotion}
									paused={boot.showing}
								/>
							</section>
						</>
					)}
				</main>
			)}

			<Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
				<Dialog.Portal>
					<Dialog.Popup className={`${styles.sheet} ${fontClass}`} data-variant={sheet}>
						<div className={styles.sheetBar}>
							<Dialog.Close className={styles.backButton}>
								<svg viewBox="0 0 16 16" width={14} height={14} aria-hidden>
									<path
										d="M11 2L4 8l7 6"
										fill="none"
										stroke="currentColor"
										strokeWidth={2.4}
									/>
								</svg>
								Back
							</Dialog.Close>
							<Dialog.Title className={styles.sheetTitle}>
								{APP_TITLES[sheet]}
							</Dialog.Title>
						</div>
						<div className={styles.sheetBody}>{renderApp(sheet)}</div>
					</Dialog.Popup>
				</Dialog.Portal>
			</Dialog.Root>

			{boot.showing && (
				<div
					key={`boot-${boot.key}`}
					className={styles.boot}
					role="status"
					onAnimationEnd={(event) => {
						if (event.target === event.currentTarget) boot.finish();
					}}
				>
					<div className={styles.bootCard}>
						<MaxOSMark size={84} />
						<p className={styles.bootName}>maxOS</p>
						<p className={styles.bootLine}>Starting Max…</p>
						<div className={styles.bootBar} aria-hidden>
							<span />
						</div>
					</div>
					<ul className={styles.bootExtensions} aria-hidden>
						{DESKTOP_ICONS.map(({ id }) => {
							const Icon = ICONS[id];
							return (
								<li key={id}>
									<Icon width={32} height={32} />
								</li>
							);
						})}
					</ul>
				</div>
			)}
		</div>
	);
}

function clampToViewport(win: Win, viewport: { w: number; h: number } | null): Win {
	if (!viewport) return win;
	return {
		...win,
		x: Math.min(win.x, viewport.w - 96),
		y: Math.min(win.y, viewport.h - 32),
	};
}
