'use client';

import { Dialog } from '@base-ui/react/dialog';
import {
	createContext,
	useContext,
	useEffect,
	useRef,
	type CSSProperties,
	type KeyboardEvent,
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

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
	/** What had focus before the window opened (a dock button, a pin), to hand focus back to. */
	const opener = useRef<HTMLElement | null>(null);
	useEffect(() => {
		const onFocus = (e: FocusEvent) => {
			const t = e.target;
			if (t instanceof HTMLElement && t !== document.body && !t.closest('[role="dialog"]')) opener.current = t;
		};
		document.addEventListener('focusin', onFocus);
		return () => document.removeEventListener('focusin', onFocus);
	}, []);
	// Closing hands focus back to whatever opened the window (a kept-mounted window must not keep
	// it either: its input would swallow the dock hotkeys and Escape), or to the page.
	useEffect(() => {
		const el = popup.current;
		if (open || !el || !el.contains(document.activeElement)) return;
		if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
		else (document.activeElement as HTMLElement).blur();
	}, [open]);
	// Tab and Shift+Tab go round the window's own controls, however fast they are pressed.
	const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		if (e.key !== 'Tab' || !popup.current) return;
		const stops = [...popup.current.querySelectorAll<HTMLElement>(TABBABLE)].filter((n) => n.getClientRects().length > 0);
		if (!stops.length) return;
		const first = stops[0];
		const last = stops[stops.length - 1];
		const at = document.activeElement;
		if (e.shiftKey ? at === first || !popup.current.contains(at) : at === last) {
			e.preventDefault();
			(e.shiftKey ? last : first).focus();
		}
	};
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
					finalFocus={false}
					onKeyDown={onKeyDown}
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
