'use client';

import { Menu } from '@base-ui/react/menu';
import { Menubar } from '@base-ui/react/menubar';
import { useRef, type ReactNode } from 'react';
import type { LabContent } from '@/lab-shared/content';
import { useViennaClock } from './hooks';
import { MaxOSMark } from './icons';
import type { AppId } from './window-layout';
import styles from './os.module.css';
import type { BusinessInfo } from './small-apps';

type Props = {
	fontClass: string;
	compact: boolean;
	content: LabContent;
	business: BusinessInfo;
	hasWindow: boolean;
	onOpen: (app: AppId) => void;
	onOpenWikiFile: (filename: string) => void;
	onOpenTalk: (index: number) => void;
	onCloseTop: () => void;
	onMinimizeTop: () => void;
	onRestart: () => void;
};

export function MenuBar(props: Props) {
	const {
		fontClass,
		compact,
		content,
		business,
		hasWindow,
		onOpen,
		onOpenWikiFile,
		onOpenTalk,
	} = props;
	// When an item opens a window, that window takes focus instead of the menu trigger.
	const handedOff = useRef(false);
	const act = (fn: () => void) => () => {
		handedOff.current = true;
		fn();
	};
	const finalFocus = () => {
		const keep = !handedOff.current;
		handedOff.current = false;
		return keep;
	};

	const popupProps = { fontClass, finalFocus };

	return (
		<header className={styles.menubarWrap}>
			<Menubar className={styles.menubar} aria-label="maxOS">
				<Menu.Root>
					<Menu.Trigger className={styles.menuTrigger} aria-label="maxOS menu">
						<MaxOSMark />
						<span className={styles.menuBrand}>maxOS</span>
					</Menu.Trigger>
					<MenuPopup {...popupProps}>
						<Menu.Item className={styles.menuItem} onClick={act(() => onOpen('about'))}>
							About maxOS
						</Menu.Item>
						<Menu.Item className={styles.menuItem} onClick={act(() => onOpen('mail'))}>
							Hire Max…
						</Menu.Item>
						<Menu.Separator className={styles.menuSeparator} />
						<Menu.Item className={styles.menuItem} onClick={act(props.onRestart)}>
							Restart
						</Menu.Item>
					</MenuPopup>
				</Menu.Root>

				{!compact && (
					<>
						<Menu.Root>
							<Menu.Trigger className={styles.menuTrigger}>File</Menu.Trigger>
							<MenuPopup {...popupProps}>
								<Menu.Item
									className={styles.menuItem}
									onClick={act(() => onOpen('terminal'))}
								>
									Ask Max a question
								</Menu.Item>
								<Menu.Item
									className={styles.menuItem}
									onClick={act(() => onOpen('mail'))}
								>
									New message to Max
								</Menu.Item>
								<Menu.Item
									className={styles.menuItem}
									onClick={act(() => onOpen('facts'))}
								>
									Open facts.txt
								</Menu.Item>
								<Menu.Separator className={styles.menuSeparator} />
								<Menu.Item
									className={styles.menuItem}
									disabled={!hasWindow}
									onClick={props.onMinimizeTop}
								>
									Minimize window
								</Menu.Item>
								<Menu.Item
									className={styles.menuItem}
									disabled={!hasWindow}
									onClick={props.onCloseTop}
								>
									Close window
									<kbd className={styles.menuKbd}>Esc</kbd>
								</Menu.Item>
							</MenuPopup>
						</Menu.Root>

						<Menu.Root>
							<Menu.Trigger className={styles.menuTrigger}>Go</Menu.Trigger>
							<MenuPopup {...popupProps}>
								<Menu.Item
									className={styles.menuItem}
									onClick={act(() => onOpen('terminal'))}
								>
									Terminal
								</Menu.Item>
								<Submenu label="Wiki" {...popupProps}>
									{content.wiki.map((page) => (
										<Menu.Item
											key={page.filename}
											className={styles.menuItem}
											onClick={act(() => onOpenWikiFile(page.filename))}
										>
											{page.filename}
										</Menu.Item>
									))}
								</Submenu>
								<Submenu label="Talks" {...popupProps}>
									{content.talks.map((talk, index) => (
										<Menu.Item
											key={talk.slug}
											className={styles.menuItem}
											onClick={act(() => onOpenTalk(index))}
										>
											{talk.talk}
										</Menu.Item>
									))}
								</Submenu>
								<Menu.Item
									className={styles.menuItem}
									onClick={act(() => onOpen('mail'))}
								>
									Hire Max
								</Menu.Item>
								<Menu.Separator className={styles.menuSeparator} />
								<Menu.LinkItem
									className={styles.menuItem}
									href="https://zaunermax.at/query"
								>
									Full-screen terminal
								</Menu.LinkItem>
								<Menu.LinkItem className={styles.menuItem} href={business.links.github}>
									GitHub
								</Menu.LinkItem>
								<Menu.LinkItem className={styles.menuItem} href={business.links.linkedin}>
									LinkedIn
								</Menu.LinkItem>
							</MenuPopup>
						</Menu.Root>
					</>
				)}
			</Menubar>

			<div className={styles.menuStatus}>
				<button
					type="button"
					className={styles.statusLight}
					onClick={() => onOpen('mail')}
				>
					<span className={styles.statusDot} aria-hidden />
					Open for projects
				</button>
				<ViennaClock />
			</div>
		</header>
	);
}

type PopupProps = { fontClass: string; finalFocus: () => boolean; children: ReactNode };

function MenuPopup({ fontClass, finalFocus, children }: PopupProps) {
	return (
		<Menu.Portal>
			<Menu.Positioner
				className={`${styles.menuPositioner} ${fontClass}`}
				sideOffset={0}
				align="start"
			>
				<Menu.Popup className={styles.menuPopup} finalFocus={finalFocus}>
					{children}
				</Menu.Popup>
			</Menu.Positioner>
		</Menu.Portal>
	);
}

function Submenu({
	label,
	fontClass,
	finalFocus,
	children,
}: PopupProps & { label: string }) {
	return (
		<Menu.SubmenuRoot>
			<Menu.SubmenuTrigger className={styles.menuItem}>
				{label}
				<svg viewBox="0 0 10 10" width={10} height={10} aria-hidden>
					<path d="M3 1l5 4-5 4z" fill="currentColor" />
				</svg>
			</Menu.SubmenuTrigger>
			<Menu.Portal>
				<Menu.Positioner
					className={`${styles.menuPositioner} ${fontClass}`}
					sideOffset={-2}
					alignOffset={-6}
				>
					<Menu.Popup className={styles.menuPopup} finalFocus={finalFocus}>
						{children}
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.SubmenuRoot>
	);
}

function ViennaClock() {
	const clock = useViennaClock();
	return (
		<span className={styles.clock}>
			<span className={styles.srOnly}>Time in Vienna: </span>
			{clock}
		</span>
	);
}
