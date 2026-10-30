'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { CompiledWorld } from '../world/compile';
import { MAX_ANCHOR, type GameBus } from '../scene/bus';
import { visitorAnchor } from '../room/presence';
import styles from './labels.module.css';

type Label = {
	id: string;
	name: string;
	title?: string;
	tone: 'friendly' | 'max' | 'place' | 'visitor';
	/** A small call to action under the name (touch screens: Max says "tap to talk"). */
	hint?: string;
	/** Fully visible up to this camera distance, gone 4 units later. */
	fade: number;
	/** Hidden while the camera hovers over the whole office. */
	hideInOverview?: boolean;
};

/**
 * Nameplates and speech bubbles as plain HTML over the canvas. One rAF loop projects every
 * anchor the scene reports; no React work per frame and no per-label React roots.
 */
export function Labels({
	world,
	bus,
	touch = false,
	visitors = [],
}: {
	world: CompiledWorld;
	bus: GameBus;
	touch?: boolean;
	/** Public ids of the other visitors in the live room. */
	visitors?: readonly string[];
}) {
	const layer = useRef<HTMLDivElement>(null);
	const nodes = useRef(new Map<string, HTMLElement>());
	const speech = useSyncExternalStore(bus.subscribeSpeech, bus.getSpeech, bus.getSpeech);

	const labels: Label[] = [];
	for (const l of world.landmarks)
		if (l.landmark !== 'max')
			labels.push({ id: l.id, name: l.name, tone: 'place', fade: 300 });
	if (world.landmark.max)
		labels.push({
			id: MAX_ANCHOR,
			name: 'Max Zauner',
			title: 'Software engineer',
			hint: touch ? 'Tap to talk' : undefined,
			tone: 'max',
			// Max's sign stays readable from anywhere in play; only the overview drops it.
			fade: 70,
		});
	for (const n of world.npcs)
		if (n.interactive)
			labels.push({
				id: n.id,
				name: n.name,
				tone: 'friendly',
				fade: 34,
				hideInOverview: true,
			});
	for (const id of visitors)
		labels.push({ id: visitorAnchor(id), name: 'Visitor', tone: 'visitor', fade: 34, hideInOverview: true });

	useEffect(() => {
		let frame = 0;
		let seen = -1;
		/** HUD panels in layer coordinates, refreshed a few times a second. */
		let hud: { l: number; t: number; r: number; b: number }[] = [];
		let hudAt = -1e9;
		const sizes = new WeakMap<HTMLElement, { w: number; h: number; lift: number; text: string | null }>();
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
			if (now - hudAt > 250) {
				hudAt = now;
				const box = el.getBoundingClientRect();
				hud = [...document.querySelectorAll<HTMLElement>('[data-hud]')]
					.map((n) => n.getBoundingClientRect())
					.filter((r) => r.width > 0 && r.height > 0)
					.map((r) => ({ l: r.left - box.left - 6, t: r.top - box.top - 6, r: r.right - box.left + 6, b: r.bottom - box.top + 6 }));
			}
			for (const [key, node] of nodes.current) {
				const bubble = key.startsWith('bubble:');
				const caption = key.startsWith('caption:');
				const id = bubble ? key.slice(7) : caption ? key.slice(8) : key;
				const a = bus.anchors.get(id);
				const fade = Number(node.dataset.fade || 20);
				// Read every frame: a bubble may be held open while the visitor stays near.
				const until = bubble ? (bus.getSpeech().get(id)?.until ?? 0) : 0;
				let opacity = 0;
				let x = 0;
				let y = 0;
				if (
					a &&
					!(v.overview && node.dataset.overview === 'hide') &&
					(!bubble || until > now) &&
					// A caption steps aside while its actor is saying something.
					!(caption && (bus.getSpeech().get(id)?.until ?? 0) > now)
				) {
					const cw = m[3] * a.x + m[7] * a.y + m[11] * a.z + m[15];
					if (cw > 0.2) {
						x = ((m[0] * a.x + m[4] * a.y + m[8] * a.z + m[12]) / cw) * 0.5 * w + w / 2;
						y = (-(m[1] * a.x + m[5] * a.y + m[9] * a.z + m[13]) / cw) * 0.5 * h + h / 2;
						const d = Math.hypot(a.x - v.x, a.y - v.y, a.z - v.z);
						opacity = Math.max(0, Math.min(1, (fade + 4 - d) / 4));
					}
				}
				let dx = 0;
				const plate = node.firstElementChild as HTMLElement | null;
				if (opacity > 0 && (x < 0 || x > w || y < 0 || y > h)) opacity = 0;
				if (opacity > 0) {
					// Keep labels in the open: whole or not at all, never under a HUD panel, never cut
					// off by an edge (people's names and bubbles slide in from the sides, pointing back
					// at their owner), and place signs fade out towards the edges of the screen.
					let size = plate ? sizes.get(plate) : undefined;
					// A bubble's text can change in place, so it is measured again when it does.
					if (plate && (!size || size.w === 0 || (bubble && size.text !== plate.textContent))) {
						const lift = bubble ? 38 : caption ? 30 : node.dataset.tone === 'max' ? 24 : 0;
						size = { w: plate.offsetWidth, h: plate.offsetHeight, lift, text: plate.textContent };
						sizes.set(plate, size);
					}
					if (size) {
						const margin = 8;
						const left = x - size.w / 2;
						if (node.dataset.tone !== 'place') {
							if (left < margin) dx = margin - left;
							else if (left + size.w > w - margin) dx = w - margin - (left + size.w);
							// The owner is too close to the edge for the sign to still point at them.
							if (Math.abs(dx) > size.w / 2 - 10) opacity = 0;
						}
						const r = { l: left + dx, r: left + dx + size.w, b: y - size.lift, t: y - size.lift - size.h };
						if (hud.some((p) => r.l < p.r && r.r > p.l && r.t < p.b && r.b > p.t)) opacity = 0;
						if (r.t < 6) opacity = 0;
						if (node.dataset.tone === 'place') {
							const edge = Math.min(r.l, w - r.r, r.t, h - y);
							opacity *= Math.max(0, Math.min(1, (edge - 12) / 28));
						}
					}
				}
				node.style.opacity = String(opacity);
				if (opacity > 0) {
					node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
					if (plate && plate.dataset.dx !== dx.toFixed(0)) {
						plate.dataset.dx = dx.toFixed(0);
						plate.style.setProperty('--dx', `${dx.toFixed(0)}px`);
					}
				}
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
					data-tone={l.tone}
					data-overview={l.hideInOverview ? 'hide' : 'show'}
				>
					<div className={styles.plate} data-tone={l.tone}>
						<span className={styles.plateName}>{l.name}</span>
						{l.title ? <span className={styles.plateTitle}>{l.title}</span> : null}
						{l.hint ? <span className={styles.plateHint}>{l.hint}</span> : null}
					</div>
				</div>
			))}
			{world.npcs.map((n) =>
				n.caption ? (
					<div
						key={`caption:${n.id}`}
						ref={bind(`caption:${n.id}`)}
						className={styles.anchor}
						data-fade={30}
						data-overview="hide"
					>
						<div className={styles.caption}>{n.caption}</div>
					</div>
				) : null,
			)}
			{world.npcs.map((n) => {
				const s = speech.get(n.id);
				if (!s) return null;
				return (
					<div
						key={`bubble:${n.id}:${s.run}`}
						ref={bind(`bubble:${n.id}`)}
						className={styles.anchor}
						data-fade={30}
						data-overview="hide"
					>
						<div className={styles.bubble}>{s.text}</div>
					</div>
				);
			})}
		</div>
	);
}
