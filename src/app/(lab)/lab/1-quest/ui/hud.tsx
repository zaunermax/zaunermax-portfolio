'use client';

import { Tooltip } from '@base-ui/react/tooltip';
import Image from 'next/image';
import { useEffect, useRef, type ReactNode } from 'react';
import portrait from '@/components/ui/own-avatar/assets/pp.jpg';
import type { LandmarkId } from '../world/schema';
import { GRID_H, GRID_W, type CompiledWorld, type TimeOfDay } from '../world/compile';
import type { GameBus, Interactable } from '../scene/bus';
import { BIOMES } from '../scene/palette';
import styles from './hud.module.css';
import { Ability, BarCap, MapPin, SkyBadge, type AbilityIcon } from './icons';
import { cx, useLayer } from './window';

// ---------------------------------------------------------------------------
// Zone text: the page's h1. Big on arrival, then a small title that stays.

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
		<header className={styles.zone} data-state={state}>
			<h1 className={styles.zoneTitle}>
				Hello, I&rsquo;m <span className={styles.zoneMax}>Max</span>
			</h1>
			<span className={styles.zoneSub}>
				Welcome to {worldName}
				{tagline ? <span className={styles.zoneTagline}>{tagline}</span> : null}
			</span>
		</header>
	);
}

// ---------------------------------------------------------------------------
// Max's unit frame.

export function UnitFrame({ level, onOpen }: { level: number; onOpen: () => void }) {
	return (
		<button
			type="button"
			className={styles.unit}
			onClick={onOpen}
			aria-label={`Max Zauner, level ${level} independent software engineer. Open character sheet`}
		>
			<span className={styles.unitPortrait}>
				<Image src={portrait} alt="" width={92} height={92} sizes="92px" priority />
				<span className={styles.level} aria-hidden="true">
					{level}
				</span>
			</span>
			<span className={styles.unitBody} aria-hidden="true">
				<span className={styles.unitName}>Max Zauner</span>
				<span className={styles.unitClass}>Independent software engineer</span>
				<span className={styles.bar}>
					<span className={styles.barFill} />
					<span className={styles.barText}>Open for new quests</span>
				</span>
			</span>
		</button>
	);
}

// ---------------------------------------------------------------------------
// Minimap: the whole valley, north up.

const MAP_PX = 256;
const SCALE = MAP_PX / 48.8;
const OX = (MAP_PX - GRID_W * SCALE) / 2;
const OY = (MAP_PX - GRID_H * SCALE) / 2;

const PIN_LABEL: Record<LandmarkId, string> = {
	max: 'Walk to Max’s camp',
	library: 'Walk to the library',
	stage: 'Walk to the stage',
	questboard: 'Walk to the quest board',
	worldforge: 'Walk to the world forge',
};

export function Minimap({
	world,
	bus,
	time,
	onPin,
}: {
	world: CompiledWorld;
	bus: GameBus;
	time: TimeOfDay;
	onPin: (id: LandmarkId) => void;
}) {
	const base = useRef<HTMLCanvasElement>(null);
	const live = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const ctx = base.current?.getContext('2d');
		if (!ctx) return;
		const pal = BIOMES[world.meta.biome];
		ctx.clearRect(0, 0, MAP_PX, MAP_PX);
		const rim = ctx.createRadialGradient(
			MAP_PX / 2,
			MAP_PX / 2,
			60,
			MAP_PX / 2,
			MAP_PX / 2,
			140,
		);
		rim.addColorStop(0, pal.rim[0]);
		rim.addColorStop(1, pal.rim[1]);
		ctx.fillStyle = rim;
		ctx.fillRect(0, 0, MAP_PX, MAP_PX);
		for (let y = 0; y < GRID_H; y++)
			for (let x = 0; x < GRID_W; x++) {
				const i = y * GRID_W + x;
				const kind = world.ground[i];
				const h = world.heights[i];
				let color: string =
					kind === 'water'
						? h < -0.75
							? pal.water.deep
							: pal.water.shallow
						: pal.ground[kind][0];
				if (!Number.isNaN(world.deck[i])) color = '#8a5a32';
				ctx.fillStyle = color;
				ctx.fillRect(
					OX + x * SCALE - 0.3,
					OY + y * SCALE - 0.3,
					SCALE + 0.6,
					SCALE + 0.6,
				);
				if (kind !== 'water' && h > 0.6) {
					ctx.fillStyle = `rgba(255,255,230,${Math.min(0.25, (h - 0.6) * 0.15)})`;
					ctx.fillRect(OX + x * SCALE, OY + y * SCALE, SCALE, SCALE);
				}
			}
		ctx.fillStyle = 'rgba(20,40,10,0.75)';
		for (const t of world.trees) {
			ctx.beginPath();
			ctx.arc(OX + t.x * SCALE, OY + t.y * SCALE, SCALE * 0.42, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.fillStyle = '#5a3a22';
		ctx.strokeStyle = '#1a0e06';
		ctx.lineWidth = 1;
		for (const b of world.buildings) {
			if (b.kind === 'dock') continue;
			const s = b.kind === 'tent' || b.kind === 'well' ? 1 : 2.4;
			ctx.fillRect(
				OX + (b.x - s / 2) * SCALE,
				OY + (b.y - s / 2) * SCALE,
				s * SCALE,
				s * SCALE,
			);
			ctx.strokeRect(
				OX + (b.x - s / 2) * SCALE,
				OY + (b.y - s / 2) * SCALE,
				s * SCALE,
				s * SCALE,
			);
		}
		// Soft edge: the valley fades into the mountains.
		const fade = ctx.createRadialGradient(
			MAP_PX / 2,
			MAP_PX / 2,
			100,
			MAP_PX / 2,
			MAP_PX / 2,
			130,
		);
		fade.addColorStop(0, 'rgba(0,0,0,0)');
		fade.addColorStop(1, 'rgba(0,0,0,0.35)');
		ctx.fillStyle = fade;
		ctx.fillRect(0, 0, MAP_PX, MAP_PX);
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
			ctx.clearRect(0, 0, MAP_PX, MAP_PX);
			ctx.fillStyle = '#ffd23a';
			ctx.strokeStyle = '#000';
			ctx.lineWidth = 1.5;
			for (const n of bus.npcs.values()) {
				ctx.beginPath();
				ctx.arc(OX + n.x * SCALE, OY + n.y * SCALE, 3.2, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
			}
			const p = bus.player;
			ctx.save();
			ctx.translate(OX + p.x * SCALE, OY + p.y * SCALE);
			ctx.rotate(Math.PI - p.heading);
			ctx.beginPath();
			ctx.moveTo(0, -11);
			ctx.lineTo(7.5, 8);
			ctx.lineTo(0, 4);
			ctx.lineTo(-7.5, 8);
			ctx.closePath();
			ctx.fillStyle = '#fff6d0';
			ctx.strokeStyle = '#1a0e06';
			ctx.lineWidth = 2;
			ctx.fill();
			ctx.stroke();
			ctx.restore();
		};
		frame = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(frame);
	}, [bus]);

	const onMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		const px = ((e.clientX - r.left) / r.width) * MAP_PX;
		const py = ((e.clientY - r.top) / r.height) * MAP_PX;
		const x = Math.floor((px - OX) / SCALE);
		const y = Math.floor((py - OY) / SCALE);
		if (x >= 0 && y >= 0 && x < GRID_W && y < GRID_H) bus.walkTo({ kind: 'cell', x, y });
	};

	const timeLabel = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' }[time];
	return (
		<nav className={styles.minimap} aria-label={`Map of ${world.meta.name}`}>
			<div className={styles.mapName}>{world.meta.name}</div>
			<div className={styles.mapDisc}>
				<div className={styles.mapInner}>
					<canvas ref={base} width={MAP_PX} height={MAP_PX} aria-hidden="true" />
					<canvas
						ref={live}
						width={MAP_PX}
						height={MAP_PX}
						aria-hidden="true"
						onClick={onMapClick}
						style={{ cursor: 'crosshair' }}
					/>
					{world.landmarks.map((l) => (
						<button
							key={l.id}
							type="button"
							className={styles.mapIcon}
							style={{
								left: `${((OX + l.x * SCALE) / MAP_PX) * 100}%`,
								top: `${((OY + l.y * SCALE) / MAP_PX) * 100}%`,
							}}
							aria-label={`${PIN_LABEL[l.landmark]}: ${l.name}`}
							title={l.name}
							onClick={() => onPin(l.landmark)}
						>
							<MapPin name={l.landmark} />
						</button>
					))}
				</div>
				<span
					className={styles.mapBadge}
					title={`${timeLabel}, ${world.meta.weather === 'clear' ? 'clear skies' : world.meta.weather}`}
				>
					<SkyBadge time={time} />
					<span className={styles.srOnly}>
						{timeLabel}, {world.meta.weather}
					</span>
				</span>
			</div>
		</nav>
	);
}

// ---------------------------------------------------------------------------
// Action bar with WoW-style tooltips, the XP bar and the interaction prompt.

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

function Tip({ children, content }: { children: ReactNode; content: ReactNode }) {
	const layer = useLayer();
	return (
		<Tooltip.Root>
			{children}
			<Tooltip.Portal>
				<Tooltip.Positioner
					side="top"
					sideOffset={12}
					className={layer}
					style={{ zIndex: 60 }}
				>
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
	return (
		<Tooltip.Provider delay={150} closeDelay={60}>
			<div className={styles.dock}>
				{nearby ? (
					<button type="button" className={styles.prompt} onClick={onInteract}>
						{touch ? null : <kbd className={styles.key}>F</kbd>}
						{promptText(nearby, touch)}
					</button>
				) : null}
				<Tip
					content={
						<>
							<span className={styles.tipTitle}>Level {xp.level}</span>
							{Math.round(xp.fraction * 100)}% of the way to level {xp.level + 1}.
							<span className={styles.tipMuted}>Max levels up every September.</span>
						</>
					}
				>
					<Tooltip.Trigger
						render={<div />}
						className={styles.xp}
						aria-label={`Experience: ${Math.round(xp.fraction * 100)} percent to level ${xp.level + 1}`}
						tabIndex={0}
						role="img"
					>
						<span className={styles.xpFill} style={{ width: `${xp.fraction * 100}%` }} />
						<span className={styles.xpTicks} />
					</Tooltip.Trigger>
				</Tip>
				<div className={styles.actionBar} role="toolbar" aria-label="Action bar">
					<BarCap className={cx(styles.cap, styles.capLeft)} />
					{actions.map((a) => (
						<Tip
							key={a.id}
							content={
								<>
									<span className={styles.tipTitle}>
										{a.title}
										<span className={styles.tipKey}>{a.key}</span>
									</span>
									{a.description}
									<span className={styles.tipUse}>Use: {a.use}</span>
									{a.extra}
								</>
							}
						>
							<Tooltip.Trigger
								className={cx(styles.slot, a.busy && styles.forging)}
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
					<BarCap className={cx(styles.cap, styles.capRight)} />
				</div>
			</div>
		</Tooltip.Provider>
	);
}

export function promptText(target: Interactable, touch: boolean) {
	const verb = touch ? 'Tap to' : '';
	const text =
		target.kind === 'npc'
			? `greet ${target.name}`
			: {
					max: 'talk to Max',
					library: `read in ${target.name}`,
					stage: 'see Max’s talks',
					questboard: 'read the quest board',
					worldforge: 'touch the waystone',
				}[target.id];
	const s = verb ? `${verb} ${text}` : text;
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export function LoadingVeil({ ready, name }: { ready: boolean; name: string }) {
	return (
		<div className={styles.veil} data-ready={ready} aria-hidden={ready}>
			<div className={styles.loadBar}>
				<span>Entering {name}…</span>
				<div className={styles.loadTrack}>
					<div className={styles.loadFill} />
				</div>
			</div>
		</div>
	);
}
