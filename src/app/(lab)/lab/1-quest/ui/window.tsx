'use client';

import { Dialog } from '@base-ui/react/dialog';
import {
	createContext,
	useContext,
	type CSSProperties,
	type ReactNode,
	type RefObject,
} from 'react';
import styles from './hud.module.css';
import { CloseX } from './icons';

/** Classes for anything portalled out of the HUD root: font variables and design tokens. */
export const LayerContext = createContext('');

export const cx = (...c: (string | false | null | undefined)[]) =>
	c.filter(Boolean).join(' ');

export function useLayer() {
	return cx(useContext(LayerContext), styles.layer);
}

/** A Base UI dialog dressed as an old-school game frame: gilded border, title, round close. */
export function WowWindow({
	open,
	onClose,
	title,
	sub,
	portrait,
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
	width?: string;
	side?: 'left';
	initialFocus?: RefObject<HTMLElement | null>;
	keepMounted?: boolean;
	children: ReactNode;
}) {
	const layer = useLayer();
	return (
		<Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
			<Dialog.Portal keepMounted={keepMounted}>
				<Dialog.Backdrop className={cx(layer, styles.backdrop)} />
				<Dialog.Popup
					className={cx(layer, styles.window)}
					data-side={side}
					initialFocus={initialFocus}
					style={width ? ({ '--w': width } as CSSProperties) : undefined}
				>
					<header className={styles.windowHead}>
						{portrait}
						<div>
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
