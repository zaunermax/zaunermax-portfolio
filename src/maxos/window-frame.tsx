'use client';

import { useEffect, useId, useRef, type PointerEvent, type ReactNode } from 'react';
import styles from './os.module.css';
import { MENUBAR_HEIGHT, type AppId, type Win } from './window-layout';

type Props = {
	id: AppId;
	title: string;
	win: Win;
	active: boolean;
	/** Animates the next position change (used when a window slides into view). */
	sliding?: boolean;
	variant?: 'platinum' | 'sticky' | 'terminal';
	/** Changes whenever the window should take keyboard focus. */
	focusRequest: number;
	onRaise: (id: AppId) => void;
	/** Brings a window that hangs off-screen fully into view. */
	onReveal: (id: AppId) => void;
	onClose: (id: AppId) => void;
	onMinimize: (id: AppId) => void;
	onMove: (id: AppId, rect: Pick<Win, 'x' | 'y' | 'w' | 'h'>) => void;
	children: ReactNode;
};

type Gesture = {
	kind: 'move' | 'resize';
	startX: number;
	startY: number;
	rect: { x: number; y: number; w: number; h: number };
	moved: boolean;
};

const MIN_W = 280;
const MIN_H = 180;

// The title bar must stay grabbable, so a window can hang off an edge but never vanish.
function clampPosition(x: number, y: number, w: number) {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	return {
		x: Math.min(Math.max(x, 96 - w), vw - 96),
		y: Math.min(Math.max(y, MENUBAR_HEIGHT), vh - 32),
	};
}

export function WindowFrame({
	id,
	title,
	win,
	active,
	sliding = false,
	variant = 'platinum',
	focusRequest,
	onRaise,
	onReveal,
	onClose,
	onMinimize,
	onMove,
	children,
}: Props) {
	const ref = useRef<HTMLElement>(null);
	const gesture = useRef<Gesture | null>(null);
	const titleId = useId();

	useEffect(() => {
		if (!focusRequest) return;
		const frame = requestAnimationFrame(() => {
			const el = ref.current;
			if (!el) return;
			const target = el.querySelector<HTMLElement>('[data-autofocus]') ?? el;
			target.focus({ preventScroll: true });
		});
		return () => cancelAnimationFrame(frame);
	}, [focusRequest]);

	function startGesture(kind: Gesture['kind'], event: PointerEvent<HTMLElement>) {
		if (event.button !== 0) return;
		if (kind === 'move' && (event.target as HTMLElement).closest('button')) return;
		event.preventDefault();
		gesture.current = {
			kind,
			startX: event.clientX,
			startY: event.clientY,
			rect: { x: win.x, y: win.y, w: win.w, h: win.h },
			moved: false,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
		onRaise(id);
		if (!ref.current?.contains(document.activeElement))
			ref.current?.focus({ preventScroll: true });
	}

	function trackGesture(event: PointerEvent<HTMLElement>) {
		const g = gesture.current;
		const el = ref.current;
		if (!g || !el) return;
		const dx = event.clientX - g.startX;
		const dy = event.clientY - g.startY;
		if (!g.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
		g.moved = true;
		if (g.kind === 'move') {
			const { x, y } = clampPosition(g.rect.x + dx, g.rect.y + dy, g.rect.w);
			el.style.left = `${x}px`;
			el.style.top = `${y}px`;
		} else {
			el.style.width = `${Math.max(MIN_W, g.rect.w + dx)}px`;
			el.style.height = `${Math.max(MIN_H, g.rect.h + dy)}px`;
		}
	}

	function endGesture(event: PointerEvent<HTMLElement>) {
		// The window's own pointerup would otherwise treat the end of a drag as a click.
		event.stopPropagation();
		const g = gesture.current;
		const el = ref.current;
		gesture.current = null;
		if (!g || !el) return;
		if (!g.moved) {
			if (g.kind === 'move') onReveal(id);
			return;
		}
		onMove(id, {
			x: parseFloat(el.style.left),
			y: parseFloat(el.style.top),
			w: parseFloat(el.style.width),
			h: parseFloat(el.style.height),
		});
	}

	return (
		<section
			ref={ref}
			role="dialog"
			aria-modal="false"
			aria-labelledby={titleId}
			tabIndex={-1}
			hidden={win.minimized}
			data-active={active || undefined}
			data-sliding={sliding || undefined}
			data-variant={variant}
			data-window={id}
			className={styles.window}
			style={{ left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }}
			onPointerDownCapture={() => onRaise(id)}
			onPointerUp={(event) => {
				// A click anywhere on a peeking window pulls it into view.
				if (!gesture.current && event.button === 0) onReveal(id);
			}}
			onFocus={(event) => {
				onRaise(id);
				if (!gesture.current && event.target.matches(':focus-visible')) onReveal(id);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape' && !event.defaultPrevented) {
					event.preventDefault();
					onClose(id);
				}
			}}
		>
			<div
				className={styles.titlebar}
				onPointerDown={(event) => startGesture('move', event)}
				onPointerMove={trackGesture}
				onPointerUp={endGesture}
				onPointerCancel={endGesture}
			>
				<button
					type="button"
					className={styles.closeBox}
					aria-label={`Close ${title}`}
					title="Close (Esc)"
					onClick={() => onClose(id)}
				/>
				<h2 id={titleId} className={styles.windowTitle}>
					<span>{title}</span>
				</h2>
				<button
					type="button"
					className={styles.minimizeBox}
					aria-label={`Minimize ${title}`}
					title="Minimize"
					onClick={() => onMinimize(id)}
				/>
			</div>
			<div className={styles.windowBody}>{children}</div>
			<div
				className={styles.growBox}
				aria-hidden
				onPointerDown={(event) => startGesture('resize', event)}
				onPointerMove={trackGesture}
				onPointerUp={endGesture}
				onPointerCancel={endGesture}
			/>
		</section>
	);
}
