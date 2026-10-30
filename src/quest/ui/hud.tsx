'use client';

import { Tooltip } from '@base-ui/react/tooltip';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import portrait from '@/components/ui/own-avatar/assets/pp.jpg';
import type { LandmarkId } from '../world/schema';
import { GRID_H, GRID_W, type CompiledWorld } from '../world/compile';
import type { Outside, TimeOfDay } from '../world/schema';
import { EDGE } from '../world/types';
import type { GameBus, Interactable } from '../scene/bus';
import { floorColors, LIGHTING } from '../scene/palette';
import styles from './hud.module.css';
import { Ability, MapPin, SkyBadge, Sparkle, type AbilityIcon } from './icons';
import { useLoadProgress } from './load-progress';
import { cx, useLayer } from './window';

// ---------------------------------------------------------------------------
// Zone text: the page's h1. A big pixel greeting on arrival; afterwards it steps aside (it stays
// in the accessibility tree) and Max's "Hello, my name is" tag in the corner carries the hello,
// so nothing sits over the place labels at the top of the screen.

export function ZoneText({
	state,
	worldName,
	tagline,
}: {
	state: 'hidden' | 'big' | 'small';
	worldName: string;
	tagline: string;
}) {
	return (
		<header className={styles.zone} data-state={state} data-hud={state === 'big' ? '' : undefined}>
			<h1 className={styles.zoneTitle}>Hello, I&rsquo;m Max</h1>
			<p className={styles.zoneSub}>
				Welcome to <b>{worldName}</b>
				{tagline ? <span className={styles.zoneTagline}>{tagline}</span> : null}
			</p>
			<span className={styles.zoneSparkles} aria-hidden="true">
				<Sparkle />
				<Sparkle />
				<Sparkle />
			</span>
		</header>
	);
}

// ---------------------------------------------------------------------------
// Max's name tag, clipped to a lanyard. Opens his employee file.

export function UnitFrame({
	level,
	compact,
	onOpen,
}: {
	level: number;
	/** After the hello: a small badge that opens up again on hover or focus. */
	compact: boolean;
	onOpen: () => void;
}) {
	return (
		<button
			type="button"
			className={styles.unit}
			data-compact={compact}
			data-hud=""
			onClick={onOpen}
			aria-label={`Max Zauner, level ${level} independent software engineer, open for new projects. Open his employee file`}
		>
			<span className={styles.unitBand} aria-hidden="true">
				Hello, my name is
			</span>
			<span className={styles.unitPortrait}>
				<img src={portrait} alt="" width={128} height={128} sizes="64px" fetchPriority="high" />
			</span>
			<span className={styles.unitBody} aria-hidden="true">
				<span className={styles.unitName}>Max Zauner</span>
				<span className={styles.unitClass}>Independent software engineer</span>
				<span className={styles.status}>
					<span className={styles.statusDot} />
					Open for new projects
				</span>
			</span>
		</button>
	);
}

// ---------------------------------------------------------------------------
// Floor plan: the whole office, north up, drawn with whole pixels per tile.

const CELL = 6;
const PAD = 6;
const MAP_W = GRID_W * CELL + PAD * 2;
const MAP_H = GRID_H * CELL + PAD * 2;

/** A pin's size on the plan, in plan pixels (the plan is drawn about 1:1 on desktop). */
const PIN = 24;

/**
 * Pin positions on the plan: nudged apart until no two overlap, and kept inside the frame (a
 * pin hangs above its point, see .mapIcon).
 */
export function spreadPins(points: { x: number; y: number }[], size = PIN, w = MAP_W, h = MAP_H) {
	const out = points.map((p) => ({ ...p }));
	const gap = size + 3;
	const clamp = (p: { x: number; y: number }) => {
		p.x = Math.min(w - size / 2 - 1, Math.max(size / 2 + 1, p.x));
		p.y = Math.min(h - size * 0.4 - 1, Math.max(size * 0.6 + 1, p.y));
	};
	out.forEach(clamp);
	for (let round = 0; round < 40; round++) {
		let moved = false;
		for (let i = 0; i < out.length; i++)
			for (let j = i + 1; j < out.length; j++) {
				const a = out[i];
				const b = out[j];
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const ox = gap - Math.abs(dx);
				const oy = gap - Math.abs(dy);
				if (ox <= 0 || oy <= 0) continue;
				moved = true;
				// Push along the axis that needs the smaller move; ties go sideways.
				if (ox <= oy) {
					const push = (ox / 2 + 0.5) * (dx > 0 || (dx === 0 && i < j) ? 1 : -1);
					a.x -= push;
					b.x += push;
				} else {
					const push = (oy / 2 + 0.5) * (dy > 0 ? 1 : -1);
					a.y -= push;
					b.y += push;
				}
				clamp(a);
				clamp(b);
			}
		if (!moved) break;
	}
	return out;
}

const PIN_LABEL: Record<LandmarkId, string> = {
	max: 'Walk to Max’s desk',
	library: 'Walk to the wiki shelf',
	stage: 'Walk to the stage',
	questboard: 'Walk to the ticket board',
	worldforge: 'Walk to the main server rack',
};

export function Minimap({
	world,
	bus,
	time,
	outside,
	name,
	collapsedByDefault,
	onPin,
	footer = null,
}: {
	world: CompiledWorld;
	bus: GameBus;
	time: TimeOfDay;
	outside: Outside;
	/** The company, whatever the compiled world says while a brief streams in. */
	name: string;
	/** Phones start with the plan folded away, to leave the office in view. */
	collapsedByDefault: boolean;
	onPin: (id: LandmarkId) => void;
	/** A strip under the plan that stays when it is folded (who else is here). */
	footer?: ReactNode;
}) {
	const base = useRef<HTMLCanvasElement>(null);
	const live = useRef<HTMLCanvasElement>(null);
	const [folded, setFolded] = useState<boolean | null>(null);
	const collapsed = folded ?? collapsedByDefault;

	useEffect(() => {
		const ctx = base.current?.getContext('2d');
		if (!ctx) return;
		const floors = floorColors(world);
		ctx.clearRect(0, 0, MAP_W, MAP_H);
		ctx.fillStyle = LIGHTING[world.meta.timeOfDay].ground;
		ctx.fillRect(0, 0, MAP_W, MAP_H);
		for (const room of world.rooms) {
			const colors = floors[room.floor];
			ctx.fillStyle = colors[0];
			ctx.fillRect(PAD + room.x * CELL, PAD + room.y * CELL, room.w * CELL, room.h * CELL);
		}
		ctx.fillStyle = 'rgba(43,36,51,0.3)';
		for (const f of world.furniture)
			if (f.blocks)
				ctx.fillRect(PAD + f.x * CELL + 1, PAD + f.y * CELL + 1, f.w * CELL - 2, f.d * CELL - 2);
		// Walls as 2px pixel strips: solid ink, glass pale, windows blue, the entrance mustard.
		const color = (kind: number) =>
			kind === EDGE.none || kind === EDGE.open || kind === EDGE.door || kind === EDGE.glassdoor
				? null
				: kind === EDGE.window
					? '#7fc4ee'
					: kind === EDGE.glass
						? '#cfeaf6'
						: kind === EDGE.entrance
							? '#f2b84b'
							: '#2b2433';
		for (let y = 0; y <= world.height; y++)
			for (let x = 0; x < world.width; x++) {
				const c = color(world.hEdge[y * world.width + x]);
				if (!c) continue;
				ctx.fillStyle = c;
				ctx.fillRect(PAD + x * CELL - 1, PAD + y * CELL - 1, CELL + 2, 2);
			}
		for (let y = 0; y < world.height; y++)
			for (let x = 0; x <= world.width; x++) {
				const c = color(world.vEdge[y * (world.width + 1) + x]);
				if (!c) continue;
				ctx.fillStyle = c;
				ctx.fillRect(PAD + x * CELL - 1, PAD + y * CELL - 1, 2, CELL + 2);
			}
	}, [world]);

	useEffect(() => {
		let frame = 0;
		let last = 0;
		const draw = (t: number) => {
			frame = requestAnimationFrame(draw);
			if (t - last < 33) return;
			last = t;
			const ctx = live.current?.getContext('2d');
			if (!ctx) return;
			ctx.clearRect(0, 0, MAP_W, MAP_H);
			// Coworkers: tiny mustard squares with an ink rim.
			for (const n of bus.npcs.values()) {
				const x = Math.round(PAD + n.x * CELL);
				const y = Math.round(PAD + n.y * CELL);
				ctx.fillStyle = '#2b2433';
				ctx.fillRect(x - 3, y - 3, 6, 6);
				ctx.fillStyle = '#f2b84b';
				ctx.fillRect(x - 2, y - 2, 4, 4);
			}
			// Other visitors: little yellow diamonds, like their nameplates.
			for (const v of bus.visitors.values()) {
				const x = Math.round(PAD + v.x * CELL);
				const y = Math.round(PAD + v.y * CELL);
				ctx.beginPath();
				ctx.moveTo(x, y - 5);
				ctx.lineTo(x + 5, y);
				ctx.lineTo(x, y + 5);
				ctx.lineTo(x - 5, y);
				ctx.closePath();
				ctx.fillStyle = '#ffe37a';
				ctx.strokeStyle = '#2b2433';
				ctx.lineWidth = 2;
				ctx.fill();
				ctx.stroke();
			}
			const p = bus.player;
			ctx.save();
			ctx.translate(PAD + p.x * CELL, PAD + p.y * CELL);
			ctx.rotate(Math.PI - p.heading);
			ctx.beginPath();
			ctx.moveTo(0, -9);
			ctx.lineTo(6.5, 7);
			ctx.lineTo(0, 3.5);
			ctx.lineTo(-6.5, 7);
			ctx.closePath();
			ctx.fillStyle = '#e8836b';
			ctx.strokeStyle = '#2b2433';
			ctx.lineWidth = 2;
			ctx.lineJoin = 'miter';
			ctx.fill();
			ctx.stroke();
			ctx.restore();
		};
		frame = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(frame);
	}, [bus]);

	const onMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		const px = ((e.clientX - r.left) / r.width) * MAP_W;
		const py = ((e.clientY - r.top) / r.height) * MAP_H;
		const x = Math.floor((px - PAD) / CELL);
		const y = Math.floor((py - PAD) / CELL);
		if (x >= 0 && y >= 0 && x < GRID_W && y < GRID_H) bus.walkTo({ kind: 'cell', x, y });
	};

	const pins = useMemo(
		() =>
			spreadPins(
				world.landmarks.map((l) => ({ x: PAD + l.x * CELL, y: PAD + l.y * CELL })),
				// The phone plan is drawn at about half size with 18px pins.
				collapsedByDefault ? 36 : PIN,
			),
		[world.landmarks, collapsedByDefault],
	);
	const timeLabel = { dawn: 'Dawn', day: 'Daytime', dusk: 'Dusk', night: 'Night' }[time];
	const sky = `${timeLabel}, ${outside === 'clear' ? 'clear skies' : outside} outside`;
	const company = name || world.meta.company || 'The office';
	return (
		<nav className={styles.minimap} data-collapsed={collapsed} data-hud="" aria-label={`Floor plan of ${company}`}>
			<div className={styles.mapHead}>
				<span className={styles.mapName} title={company}>
					{company}
				</span>
				<span className={styles.mapBadge} title={sky}>
					<SkyBadge time={time} />
					<span className={styles.srOnly}>{sky}</span>
				</span>
				<button
					type="button"
					className={styles.mapFold}
					aria-expanded={!collapsed}
					aria-label={collapsed ? 'Show the floor plan' : 'Hide the floor plan'}
					onClick={() => setFolded(!collapsed)}
				>
					<span aria-hidden="true" />
				</button>
			</div>
			<div
				hidden={collapsed}
				className={styles.mapInner}
				style={{ '--map-ratio': `${MAP_W} / ${MAP_H}` } as CSSProperties}
			>
				<canvas ref={base} width={MAP_W} height={MAP_H} aria-hidden="true" />
				<canvas
					ref={live}
					width={MAP_W}
					height={MAP_H}
					aria-hidden="true"
					onClick={onMapClick}
				/>
				{world.landmarks.map((l, i) => (
					<button
						key={l.id}
						type="button"
						className={styles.mapIcon}
						data-pin={l.landmark}
						style={{
							left: `${(pins[i].x / MAP_W) * 100}%`,
							top: `${(pins[i].y / MAP_H) * 100}%`,
						}}
						aria-label={`${PIN_LABEL[l.landmark]}: ${l.name}`}
						title={l.name}
						onClick={() => onPin(l.landmark)}
					>
						<MapPin name={l.landmark} />
					</button>
				))}
			</div>
			{footer}
		</nav>
	);
}

/**
 * Who is here, under the floor plan: the head count and a wave while in the live room, a quiet
 * note while the room is full. Nothing at all when solo for any other reason.
 */
export function PresenceStrip({
	status,
	count,
	onWave,
}: {
	status: 'off' | 'connecting' | 'live' | 'full' | 'offline';
	count: number;
	onWave: () => void;
}) {
	if (status === 'full')
		return (
			<p
				className={styles.presence}
				data-presence="full"
				title="Up to 50 visitors can be here together. You'll join automatically when someone leaves."
			>
				<span className={styles.presenceDot} aria-hidden="true" />
				<span className={styles.presenceText}>Office full: exploring solo</span>
			</p>
		);
	if (status !== 'live') return null;
	return (
		<div className={styles.presence} data-presence="live" data-count={count}>
			<span className={styles.presenceDot} aria-hidden="true" />
			<span className={styles.presenceText}>
				{count === 1 ? 'Just you here' : `${count} visitors here`}
			</span>
			<button type="button" className={styles.presenceWave} onClick={onWave} title="Wave (G)">
				Wave
			</button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// The dock: six little apps with sticky-note tooltips, the year bar and the "press F" bubble.

export type Action = {
	id: AbilityIcon;
	label: string;
	title: string;
	description: string;
	use: string;
	key: string;
	disabled?: boolean;
	cooldown?: { fraction: number; text: string } | null;
	busy?: boolean;
	extra?: ReactNode;
	onUse: () => void;
};

function Tip({
	children,
	content,
	offset = 16,
}: {
	children: ReactNode;
	content: ReactNode;
	offset?: number;
}) {
	const layer = useLayer();
	return (
		<Tooltip.Root>
			{children}
			<Tooltip.Portal>
				<Tooltip.Positioner side="top" sideOffset={offset} className={layer} style={{ zIndex: 60 }}>
					<Tooltip.Popup className={cx(layer, styles.tooltip)}>{content}</Tooltip.Popup>
				</Tooltip.Positioner>
			</Tooltip.Portal>
		</Tooltip.Root>
	);
}

export function Dock({
	actions,
	xp,
	nearby,
	touch,
	onInteract,
}: {
	actions: Action[];
	xp: { level: number; fraction: number };
	nearby: Interactable | null;
	touch: boolean;
	onInteract: () => void;
}) {
	const percent = Math.round(xp.fraction * 100);
	return (
		<Tooltip.Provider delay={150} closeDelay={60}>
			<div className={styles.dock} data-hud="">
				{nearby ? (
					<button type="button" className={styles.prompt} onClick={onInteract}>
						{touch ? null : <kbd className={styles.key}>F</kbd>}
						{promptText(nearby, touch)}
					</button>
				) : null}
				<div className={styles.tray}>
					<Tip
						content={
							<>
								<span className={styles.tipTitle}>Level {xp.level}</span>
								{percent}% of the way to level {xp.level + 1}.
								<span className={styles.tipMuted}>Max levels up every September.</span>
							</>
						}
					>
						<Tooltip.Trigger
							render={<div />}
							className={styles.xp}
							aria-label={`Experience: ${percent} percent to level ${xp.level + 1}`}
							tabIndex={0}
							role="img"
						>
							<span className={styles.xpLevel} aria-hidden="true">
								Lv {xp.level}
							</span>
							<span className={styles.xpTrack} aria-hidden="true">
								<span className={styles.xpFill} style={{ width: `${xp.fraction * 100}%` }} />
							</span>
						</Tooltip.Trigger>
					</Tip>
					<div className={styles.actionBar} role="toolbar" aria-label="Dock">
						{actions.map((a) => (
							<Tip
								key={a.id}
								offset={40}
								content={
									<>
										<span className={styles.tipTitle}>
											{a.title}
											<kbd className={styles.tipKey}>{a.key}</kbd>
										</span>
										{a.description}
										<span className={styles.tipUse}>{a.use}</span>
										{a.extra}
									</>
								}
							>
								<Tooltip.Trigger
									className={cx(styles.slot, a.busy && styles.forging)}
									data-app={a.id}
									aria-disabled={a.disabled || undefined}
									aria-label={`${a.label} (key ${a.key})`}
									onClick={a.onUse}
								>
									<span className={styles.slotIcon}>
										<Ability name={a.id} />
										{a.cooldown ? (
											<span
												className={styles.cooldown}
												style={{ ['--cd' as string]: `${a.cooldown.fraction * 360}deg` }}
												aria-hidden="true"
											>
												{a.cooldown.text}
											</span>
										) : null}
										<Sparkle className={styles.slotSparkle} />
									</span>
									<span className={styles.slotKey} aria-hidden="true">
										{a.key}
									</span>
									<span className={styles.slotLabel} aria-hidden="true">
										{a.label}
									</span>
								</Tooltip.Trigger>
							</Tip>
						))}
					</div>
				</div>
			</div>
		</Tooltip.Provider>
	);
}

export function promptText(target: Interactable, touch: boolean) {
	const verb = touch ? 'Tap to' : '';
	const text =
		target.kind === 'npc'
			? `say hi to ${target.name}`
			: {
					max: 'talk to Max',
					library: `browse ${target.name}`,
					stage: 'see Max’s talks',
					questboard: 'file a ticket for Max',
					worldforge: 'open the server rack',
				}[target.id];
	const s = verb ? `${verb} ${text}` : text;
	return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Build progress: while an office assembles, how many rooms are furnished so far, so an empty
// floor reads as work in progress rather than a broken page.

export function buildProgress(world: Pick<CompiledWorld, 'rooms'>) {
	const rooms = world.rooms.filter((r) => !r.hall);
	return { done: rooms.filter((r) => r.revealed && r.kind).length, total: rooms.length };
}

export function BuildProgress({ world, label }: { world: Pick<CompiledWorld, 'rooms'>; label: string }) {
	const { done, total } = buildProgress(world);
	const cells = Array.from({ length: total }, (_, i) => i < done);
	return (
		<div className={styles.build} data-hud="" role="status" aria-live="polite">
			<span className={styles.buildText}>
				{label} <span aria-hidden="true">&mdash;</span>{' '}
				<b>
					{done}/{total}
				</b>{' '}
				rooms
			</span>
			<span className={styles.buildTrack} aria-hidden="true">
				{cells.map((on, i) => (
					<span key={i} className={styles.buildCell} data-on={on} />
				))}
			</span>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Loading screen: the office floor tiles, a pixel progress bar, a friendly line.

const LOAD_CELLS = 24;

export function LoadingVeil({ ready, name }: { ready: boolean; name: string }) {
	const progress = useLoadProgress(ready);
	const lit = Math.round(progress * LOAD_CELLS);
	return (
		<div className={styles.veil} data-ready={ready} aria-hidden={ready}>
			<div className={styles.loadBar}>
				<span className={styles.loadText}>Clocking in at {name}…</span>
				<div
					className={styles.loadTrack}
					role="progressbar"
					aria-label={`Loading ${name}`}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(progress * 100)}
				>
					{Array.from({ length: LOAD_CELLS }, (_, i) => (
						<span key={i} className={styles.loadCell} data-on={i < lit} />
					))}
				</div>
				<span className={styles.loadHint}>Unpacking desks, plants and the coffee machine</span>
			</div>
		</div>
	);
}
