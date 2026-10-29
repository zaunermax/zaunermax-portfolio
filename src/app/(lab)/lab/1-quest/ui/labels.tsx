'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { CompiledWorld } from '../world/compile';
import { MAX_ANCHOR, type GameBus } from '../scene/bus';
import styles from '../scene/scene.module.css';

type Label = {
	id: string;
	name: string;
	title?: string;
	tone: 'friendly' | 'max' | 'place';
	/** Fully visible up to this camera distance, gone 5 units later. */
	fade: number;
	/** Hidden while the camera circles above the valley. */
	hideInOverview?: boolean;
};

/**
 * Nameplates and speech bubbles as plain HTML over the canvas. One rAF loop projects every
 * anchor the scene reports; no React work per frame and no per-label React roots.
 */
export function Labels({ world, bus }: { world: CompiledWorld; bus: GameBus }) {
	const layer = useRef<HTMLDivElement>(null);
	const nodes = useRef(new Map<string, HTMLElement>());
	const speech = useSyncExternalStore(bus.subscribeSpeech, bus.getSpeech, bus.getSpeech);

	const labels: Label[] = [];
	for (const l of world.landmarks)
		if (l.landmark !== 'max')
			labels.push({ id: l.id, name: l.name, tone: 'place', fade: 75 });
	if (world.landmark.max)
		labels.push({
			id: MAX_ANCHOR,
			name: 'Max Zauner',
			title: 'Independent Software Engineer',
			tone: 'max',
			fade: 42,
		});
	for (const n of world.npcs)
		labels.push({
			id: n.id,
			name: n.name,
			tone: 'friendly',
			fade: 17,
			hideInOverview: true,
		});

	useEffect(() => {
		let frame = 0;
		let seen = -1;
		const tick = () => {
			frame = requestAnimationFrame(tick);
			const v = bus.view;
			const el = layer.current;
			if (!el || v.frame === seen) return;
			seen = v.frame;
			const w = el.clientWidth;
			const h = el.clientHeight;
			const m = v.matrix;
			const now = performance.now();
			for (const [key, node] of nodes.current) {
				const bubble = key.startsWith('bubble:');
				const id = bubble ? key.slice(7) : key;
				const a = bus.anchors.get(id);
				const fade = Number(node.dataset.fade || 20);
				const until = Number(node.dataset.until || 0);
				let opacity = 0;
				let x = 0;
				let y = 0;
				if (
					a &&
					!(v.overview && node.dataset.overview === 'hide') &&
					(!bubble || until > now)
				) {
					const cw = m[3] * a.x + m[7] * a.y + m[11] * a.z + m[15];
					if (cw > 0.2) {
						x = ((m[0] * a.x + m[4] * a.y + m[8] * a.z + m[12]) / cw) * 0.5 * w + w / 2;
						y = (-(m[1] * a.x + m[5] * a.y + m[9] * a.z + m[13]) / cw) * 0.5 * h + h / 2;
						const d = Math.hypot(a.x - v.x, a.y - v.y, a.z - v.z);
						opacity = Math.max(0, Math.min(1, (fade + 5 - d) / 5));
					}
				}
				node.style.opacity = String(opacity);
				if (opacity > 0)
					node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
			}
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [bus]);

	const bind = (key: string) => (el: HTMLElement | null) => {
		if (el) nodes.current.set(key, el);
		else nodes.current.delete(key);
	};

	return (
		<div ref={layer} className={styles.layer} aria-hidden="true">
			{labels.map((l) => (
				<div
					key={l.id}
					ref={bind(l.id)}
					className={styles.anchor}
					data-fade={l.fade}
					data-overview={l.hideInOverview ? 'hide' : 'show'}
				>
					<div className={styles.plate} data-tone={l.tone}>
						<span className={styles.plateName}>{l.name}</span>
						{l.title ? (
							<span className={styles.plateTitle}>&lt;{l.title}&gt;</span>
						) : null}
					</div>
				</div>
			))}
			{world.npcs.map((n) => {
				const s = speech.get(n.id);
				if (!s) return null;
				return (
					<div
						key={`bubble:${n.id}:${s.until}`}
						ref={bind(`bubble:${n.id}`)}
						className={styles.anchor}
						data-fade={30}
						data-until={s.until}
						data-overview="hide"
					>
						<div className={styles.bubble}>{s.text}</div>
					</div>
				);
			})}
		</div>
	);
}
