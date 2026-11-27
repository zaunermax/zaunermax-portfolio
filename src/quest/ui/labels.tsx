'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { CompiledWorld } from '../world/compile';
import type { LandmarkId } from '../world/schema';
import { MAX_ANCHOR, PLAYER_ANCHOR, type GameBus, type SpeechKind } from '../scene/bus';
import { isPerson } from '../scene/chatter';
import { visitorAnchor } from '../room/presence';
import {
	clampBelow,
	declutter,
	labelRect,
	overlaps,
	project,
	type Candidate,
	type LabelBox,
	type Placement,
	type Rect,
} from './placement';
import styles from './labels.module.css';

type Tone = 'friendly' | 'critter' | 'max' | 'place' | 'visitor' | 'you';

type Label = {
	id: string;
	name: string;
	title?: string;
	tone: Tone;
	/** A small call to action under the name (touch screens: Max says "tap to talk"). */
	hint?: string;
	/** Fully visible up to this camera distance, gone 4 units later. */
	fade: number;
	/** Hidden while the camera hovers over the whole office. */
	hideInOverview?: boolean;
	/** Clicking or tapping the sign goes there (Max, the places). */
	landmark?: LandmarkId;
};

/** Speech bubbles are readable up to this camera distance. */
const BUBBLE_FADE = 30;
/** A vignette's caption only shows to a visitor this close (cells), and only the closest one. */
const CAPTION_RANGE = 4;
/** …and steps aside while someone this close to it (its own little scene) is talking. */
const CAPTION_SCENE = 2.5;
/** What hangs below a label's box: a bubble's tail, Max's pointer (labels.module.css). */
const TAIL = 10;
const MAX_POINTER = 14;
/**
 * Max's sign and the line about Max move this far at most to clear the panels at the top; any
 * further and they would float over something unrelated, so they wait out of sight instead.
 */
const CLAMP_MAX = 72;
/** A person's own line moves less: it has to stay over its speaker. */
const CLAMP_OWN = 48;

/** Who wins a crowded spot: Max's sign and the line about Max, then the rest in order. */
const PRIORITY = {
	max: 100,
	'about-max': 99,
	dim: 95,
	own: 90,
	nearby: 85,
	friendly: 80,
	you: 70,
	place: 60,
	visitor: 55,
	critter: 50,
	ambient: 40,
	caption: 30,
} as const;

/**
 * Whether a bubble over this anchor could be read right now: in play (not the overview), close
 * enough, on screen and clear of the HUD panels. The chatter asks before it says a line, so
 * nothing is said where nobody can read it.
 */
export function speechVisible(bus: GameBus, id: string) {
	const a = bus.anchors.get(id);
	const v = bus.view;
	const { w, h, hud } = bus.screen;
	if (!a || v.overview || !w || !h) return false;
	if (Math.hypot(a.x - v.x, a.y - v.y, a.z - v.z) > BUBBLE_FADE) return false;
	const p = project(v.matrix, a, w, h);
	if (!p || p.x < 24 || p.x > w - 24 || p.y > h - 8) return false;
	// Where a two-line bubble would go (it slides in from the edges, so only the middle counts):
	// readable if it clears the panels at the top as the loop below would move it.
	const r = labelRect(p.x, p.y, 0, { w: 120, h: 60, top: -98, below: TAIL });
	const down = clampBelow(r, hud, h);
	return down !== null && down <= CLAMP_MAX;
}

/**
 * Nameplates and speech bubbles as plain HTML over the canvas. One rAF loop projects every
 * anchor the scene reports, sorts out who gets which spot (placement.ts), and writes styles only
 * when they change; no React work per frame and no per-label React roots.
 */
export function Labels({
	world,
	bus,
	touch = false,
	visitors = [],
	onVisit,
}: {
	world: CompiledWorld;
	bus: GameBus;
	touch?: boolean;
	/** Public ids of the other visitors in the live room. */
	visitors?: readonly string[];
	/** A tap on Max's sign or a place sign: walk over, like the dock and the floor plan do. */
	onVisit?: (landmark: LandmarkId) => void;
}) {
	const layer = useRef<HTMLDivElement>(null);
	const nodes = useRef(new Map<string, HTMLElement>());
	const speech = useSyncExternalStore(bus.subscribeSpeech, bus.getSpeech, bus.getSpeech);

	const labels: Label[] = [];
	for (const l of world.landmarks)
		if (l.landmark !== 'max')
			labels.push({ id: l.id, name: l.name, tone: 'place', fade: 300, landmark: l.landmark });
	if (world.landmark.max)
		labels.push({
			id: MAX_ANCHOR,
			name: 'Max Zauner',
			title: 'Software engineer',
			hint: touch ? 'Tap to talk' : undefined,
			tone: 'max',
			// Max's sign stays readable from anywhere in play; only the overview drops it.
			fade: 70,
			landmark: 'max',
		});
	for (const n of world.npcs)
		if (n.interactive)
			labels.push({
				id: n.id,
				name: n.name,
				// Robots and pets get a quieter name than people.
				tone: isPerson(n) ? 'friendly' : 'critter',
				fade: isPerson(n) ? 34 : 26,
				hideInOverview: true,
			});
	for (const id of visitors)
		labels.push({ id: visitorAnchor(id), name: 'Visitor', tone: 'visitor', fade: 34, hideInOverview: true });
	// Which one is me: everyone starts in the same crowd.
	labels.push({ id: PLAYER_ANCHOR, name: 'You', tone: 'you', fade: 34, hideInOverview: true });

	useEffect(() => {
		let frame = 0;
		let seen = -1;
		/** HUD panels in layer coordinates, refreshed a few times a second. */
		let hud: Rect[] = [];
		let hudAt = -1e9;
		let placed = new Map<string, Placement>();
		const sizes = new WeakMap<HTMLElement, LabelBox & { text: string | null }>();
		/** What each anchor's style says now, so unchanged values are never written again. */
		const written = new WeakMap<HTMLElement, { opacity: string; transform: string; fadeUntil: number }>();
		type Slot = { key: string; node: HTMLElement; plate: HTMLElement | null; opacity: number; x: number; y: number; dx: number; dy: number };
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
				bus.screen.w = w;
				bus.screen.h = h;
				bus.screen.hud = hud;
			}
			const speaking = bus.getSpeech();
			const talkers: { x: number; z: number }[] = [];
			for (const [id, s] of speaking) {
				const a = s.until > now ? bus.anchors.get(id) : undefined;
				if (a) talkers.push(a);
			}
			const nearby = bus.getNearby();
			const nearbyId = nearby?.kind === 'npc' ? nearby.id : null;
			// The prompt over the dock already says "Tap to talk to Max": his sign drops its tag.
			const prompted = nearby?.kind === 'landmark' && nearby.id === 'max';
			// Only the closest vignette near the visitor tells its little story, and it steps aside
			// while its own people talk (anything else in its way is sorted out by priority).
			let caption: string | null = null;
			let best = CAPTION_RANGE;
			for (const key of nodes.current.keys()) {
				if (!key.startsWith('caption:')) continue;
				const a = bus.anchors.get(key.slice(8));
				if (!a || talkers.some((t) => Math.hypot(t.x - a.x, t.z - a.z) <= CAPTION_SCENE)) continue;
				const d = Math.hypot(a.x - bus.player.x, a.z - bus.player.y);
				if (d <= best) [caption, best] = [key, d];
			}

			const slots: Slot[] = [];
			const candidates: Candidate[] = [];
			for (const [key, node] of nodes.current) {
				const bubble = key.startsWith('bubble:');
				const isCaption = key.startsWith('caption:');
				const id = bubble ? key.slice(7) : isCaption ? key.slice(8) : key;
				const a = bus.anchors.get(id);
				const fade = Number(node.dataset.fade || 20);
				const tone = node.dataset.tone as Tone | SpeechKind | undefined;
				// Read every frame: a bubble may be held open while the visitor stays near.
				const said = bubble ? speaking.get(id) : undefined;
				const plate = node.firstElementChild as HTMLElement | null;
				const slot: Slot = { key, node, plate, opacity: 0, x: 0, y: 0, dx: 0, dy: 0 };
				slots.push(slot);
				if (
					!a ||
					(v.overview && node.dataset.overview === 'hide') ||
					(bubble && !(said && said.until > now)) ||
					(isCaption && key !== caption)
				)
					continue;
				const p = project(m, a, w, h);
				if (!p) continue;
				const d = Math.hypot(a.x - v.x, a.y - v.y, a.z - v.z);
				let opacity = Math.max(0, Math.min(1, (fade + 4 - d) / 4));
				const { x, y } = p;
				if (opacity <= 0 || x < 0 || x > w || y < 0 || y > h || !plate) continue;
				// Keep labels in the open: whole or not at all, never under a HUD panel, never cut
				// off by an edge (people's names and bubbles slide in from the sides, pointing back
				// at their owner), and place signs fade out towards the edges of the screen.
				const kind = bubble ? (said?.kind ?? 'own') : undefined;
				const dim = bubble && !!said?.dim;
				if (tone === 'max' && (node.dataset.prompted === '') !== prompted) {
					if (prompted) node.dataset.prompted = '';
					else delete node.dataset.prompted;
					sizes.delete(plate);
				}
				let size = sizes.get(plate);
				// Measured where it really draws (offsetTop from the anchor point), again whenever a
				// bubble's text changes in place.
				if (!size || size.w === 0 || (bubble && size.text !== plate.textContent)) {
					const hint = tone === 'max' && !prompted ? plate.querySelector<HTMLElement>('[data-hint]') : null;
					size = {
						w: plate.offsetWidth,
						h: plate.offsetHeight,
						top: plate.offsetTop,
						// The tag above Max's sign pulses a little bigger.
						above: hint ? 2 - hint.offsetTop : 0,
						below: tone === 'max' ? MAX_POINTER : bubble && kind !== 'ambient' ? TAIL : 0,
						text: plate.textContent,
					};
					sizes.set(plate, size);
				}
				// Max's sign and the line about Max never just vanish at an edge or under a panel;
				// the line about Max also wins any crowded spot (even over Max's sign, for a moment).
				const important = tone === 'max' || (kind === 'about-max' && !dim);
				const keep = kind === 'about-max' && !dim;
				const margin = 8;
				const left = x - size.w / 2;
				let dx = 0;
				if (tone !== 'place') {
					if (left < margin) dx = margin - left;
					else if (left + size.w > w - margin) dx = w - margin - (left + size.w);
					// The owner is too close to the edge for the sign to still point at them.
					if (!important && Math.abs(dx) > size.w / 2 - 10) continue;
				}
				const r = labelRect(x, y, dx, size);
				let dy = 0;
				if (important || bubble) {
					// Max's sign and bubbles move down below the top panels rather than vanish, but
					// only so far: past that they would hang over something else, so they wait.
					const down = clampBelow(r, hud, h);
					if (down === null || down > (important ? CLAMP_MAX : CLAMP_OWN)) continue;
					dy = down;
					r.t += dy;
					r.b += dy;
				} else if (r.t < 6 || hud.some((panel) => overlaps(r, panel))) continue;
				if (tone === 'place') {
					const edge = Math.min(r.l, w - r.r, r.t, h - y);
					opacity *= Math.max(0, Math.min(1, (edge - 12) / 28));
					// From above, a sign is there or not: half-faded signs read as grey smears.
					if (v.overview) opacity = opacity >= 0.5 ? 1 : 0;
					if (opacity <= 0) continue;
				}
				slot.opacity = opacity;
				slot.x = x;
				slot.y = y;
				slot.dx = dx;
				slot.dy = dy;
				const priority = bubble
					? PRIORITY[dim ? 'dim' : kind!]
					: isCaption
						? PRIORITY.caption
						: id === nearbyId
							? PRIORITY.nearby
							: PRIORITY[(tone as Tone) ?? 'friendly'];
				// The setup of a talk climbs out of the way of its punchline: the two stack.
				candidates.push({
					key,
					priority,
					rect: r,
					keep,
					// Max's sign only moves to make room for the line about Max (see declutter).
					nudge: bubble ? (kind === 'ambient' ? 18 : dim ? 96 : 36) : tone === 'max' ? 18 : 0,
					// Sideways too, as far as the tail (or Max's pointer) can still reach its owner.
					slide: bubble ? Math.max(0, Math.min(120, size.w / 2 - 24)) : tone === 'max' ? 36 : 0,
				});
			}
			placed = declutter(candidates, placed, now, 6, w);

			for (const { key, node, plate, opacity: wanted, x, y, dx, dy: clamp } of slots) {
				const spot = wanted > 0 ? placed.get(key) : undefined;
				const opacity = spot?.shown ? wanted : 0;
				let style = written.get(node);
				if (!style) written.set(node, (style = { opacity: '0', transform: '', fadeUntil: 0 }));
				// Hundredths are finer than the eye can tell apart, and keep still labels still.
				const o = opacity <= 0 ? '0' : opacity >= 1 ? '1' : opacity.toFixed(2);
				if (o !== style.opacity) {
					// Showing or hiding fades over 0.15 s (labels.module.css); everything else is direct.
					if ((o === '0') !== (style.opacity === '0')) {
						node.dataset.fading = '';
						style.fadeUntil = now + 200;
						// Only a sign that can be seen can be tapped.
						if (o === '0') delete node.dataset.shown;
						else node.dataset.shown = '';
					}
					style.opacity = o;
					node.style.opacity = o;
				}
				if (style.fadeUntil && now > style.fadeUntil) {
					style.fadeUntil = 0;
					delete node.dataset.fading;
				}
				if (opacity > 0) {
					const transform = `translate3d(${x.toFixed(1)}px, ${(y + clamp + (spot?.dy ?? 0)).toFixed(1)}px, 0)`;
					if (transform !== style.transform) {
						style.transform = transform;
						node.style.transform = transform;
					}
					const slid = (dx + (spot?.dx ?? 0)).toFixed(0);
					if (plate && plate.dataset.dx !== slid) {
						plate.dataset.dx = slid;
						plate.style.setProperty('--dx', `${slid}px`);
					}
				}
			}
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [bus, touch]);

	const bind = (key: string) => (el: HTMLElement | null) => {
		if (el) nodes.current.set(key, el);
		else nodes.current.delete(key);
	};

	return (
		<div ref={layer} className={styles.layer} aria-hidden="true">
			{labels.map((l) => {
				const content = (
					<>
						<span className={styles.plateName}>{l.name}</span>
						{l.title ? <span className={styles.plateTitle}>{l.title}</span> : null}
						{l.hint ? (
							<span className={styles.plateHint} data-hint="">
								{l.hint}
							</span>
						) : null}
					</>
				);
				return (
					<div
						key={l.id}
						ref={bind(l.id)}
						className={styles.anchor}
						data-fade={l.fade}
						data-tone={l.tone}
						data-overview={l.hideInOverview ? 'hide' : 'show'}
					>
						{l.landmark && onVisit ? (
							// A pointer shortcut only: the dock and the floor plan are the keyboard way there.
							<button
								type="button"
								tabIndex={-1}
								className={styles.plate}
								data-tone={l.tone}
								data-action=""
								onClick={() => onVisit(l.landmark!)}
							>
								{content}
							</button>
						) : (
							<div className={styles.plate} data-tone={l.tone}>
								{content}
							</div>
						)}
					</div>
				);
			})}
			{world.npcs.map((n) =>
				n.caption ? (
					<div
						key={`caption:${n.id}`}
						ref={bind(`caption:${n.id}`)}
						className={styles.anchor}
						data-fade={24}
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
						data-tone={s.kind}
						data-fade={BUBBLE_FADE}
						data-overview="hide"
					>
						<div className={styles.bubble} data-kind={s.kind} data-dim={s.dim ? '' : undefined}>
							{s.text}
						</div>
					</div>
				);
			})}
		</div>
	);
}
