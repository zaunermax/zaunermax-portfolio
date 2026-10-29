'use client';

import { Dialog } from '@base-ui/react/dialog';
import {
	createContext,
	useContext,
	useEffect,
	useRef,
	type CSSProperties,
	type ReactNode,
	type RefObject,
} from 'react';
import styles from './hud.module.css';
import { Ability, CloseX, type AbilityIcon } from './icons';

/** Classes for anything portalled out of the HUD root: font variables and design tokens. */
export const LayerContext = createContext('');

export const cx = (...c: (string | false | null | undefined)[]) =>
	c.filter(Boolean).join(' ');

export function useLayer() {
	return cx(useContext(LayerContext), styles.layer);
}

/** Each app has its own colour; its dock tile and its window title bar share it. */
export type Tone = 'coral' | 'teal' | 'lilac' | 'mustard' | 'navy' | 'sage';

/**
 * A Base UI dialog dressed as a little pixel app window: chunky ink outline, a coloured title
 * bar with the app's icon, a square close button.
 */
export function AppWindow({
	open,
	onClose,
	title,
	sub,
	portrait,
	icon,
	tone = 'teal',
	width,
	side,
	initialFocus,
	keepMounted,
	children,
}: {
	open: boolean;
	onClose: () => void;
	title: ReactNode;
	sub?: ReactNode;
	portrait?: ReactNode;
	icon?: AbilityIcon;
	tone?: Tone;
	width?: string;
	side?: 'left';
	initialFocus?: RefObject<HTMLElement | null>;
	keepMounted?: boolean;
	children: ReactNode;
}) {
	const layer = useLayer();
	const popup = useRef<HTMLDivElement>(null);
	// A kept-mounted window must not keep focus once it is hidden: its input would swallow the
	// dock hotkeys and Escape. Hand focus back to the page instead.
	useEffect(() => {
		const el = popup.current;
		if (!open && el && el.contains(document.activeElement))
			(document.activeElement as HTMLElement).blur();
	}, [open]);
	return (
		<Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
			<Dialog.Portal keepMounted={keepMounted}>
				<Dialog.Backdrop className={cx(layer, styles.backdrop)} />
				<Dialog.Popup
					ref={popup}
					className={cx(layer, styles.window)}
					data-side={side}
					data-tone={tone}
					initialFocus={initialFocus}
					style={width ? ({ '--w': width } as CSSProperties) : undefined}
				>
					<header className={styles.windowHead}>
						{portrait ??
							(icon ? (
								<span className={styles.windowIcon} aria-hidden="true">
									<Ability name={icon} />
								</span>
							) : null)}
						<div className={styles.windowTitles}>
							<Dialog.Title className={styles.windowTitle}>{title}</Dialog.Title>
							{sub ? <span className={styles.windowSub}>{sub}</span> : null}
						</div>
						<Dialog.Close className={styles.close} aria-label="Close window">
							<CloseX />
						</Dialog.Close>
					</header>
					{children}
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
