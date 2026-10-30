'use client';

import { ClientOnly } from '@tanstack/react-router';
import {
	lazy,
	Suspense,
	useEffect,
	useEffectEvent,
	useMemo,
	useState,
	useSyncExternalStore,
} from 'react';
import type { LabContent } from '@/lab-shared/content';
import { useMaxChat } from '../chat/use-max-chat';
import { lookFor } from '../room/presence';
import { useRoom } from '../room/use-room';
import { GameBus, type Interactable } from '../scene/bus';
import { compileWorld } from '../world/compile';
import { defaultBrief, DEFAULT_SEED } from '../world/default-world';
import { briefForSeed } from '../world/offline-briefs';
import type { WorldState } from '../world/contract';
import { briefSteps } from '../world/replay';
import { eventKinds, outsides, timesOfDay, vibes, type LandmarkId } from '../world/schema';
import { useWorld } from '../world/use-world';
import { ChatLog, ChatLogView } from './chat-log';
import { Labels } from './labels';
import styles from './hud.module.css';
import {
	BuildProgress,
	Dock,
	LoadingVeil,
	Minimap,
	PresenceStrip,
	UnitFrame,
	ZoneText,
	type Action,
} from './hud';
import {
	isTypingTarget,
	setSessionFlag,
	setStoredFlag,
	useDocumentHidden,
	useMedia,
	useNow,
	useSearch,
	useSessionFlag,
	useStoredFlag,
} from './hooks';
import { reportLoad } from './load-progress';
import { cx, LayerContext } from './window';
import {
	CharacterWindow,
	ControlsWindow,
	ForgeWindow,
	GossipWindow,
	LibraryWindow,
	QuestBoardWindow,
	StageWindow,
	untilLabel,
	type Business,
} from './windows';

const WorldCanvas = lazy(() => import('../scene/world-canvas'));

type WindowId =
	'gossip' | 'library' | 'stage' | 'questboard' | 'forge' | 'character' | 'controls';

const LANDMARK_WINDOW: Record<LandmarkId, WindowId> = {
	max: 'gossip',
	library: 'library',
	stage: 'stage',
	questboard: 'questboard',
	worldforge: 'forge',
};

const INTRO_KEY = 'quest-v2-intro-seen';
const TOUCH_HINT_KEY = 'quest-touch-hint-seen';
const INTRO_MS = 4200;
const HOUR = 60 * 60 * 1000;

/** Max was born in September 1993: one level per year, experience is the year so far. */
function levelAt(now: number) {
	if (!now) return { level: 33, fraction: 0.15 };
	const d = new Date(now);
	const level = d.getFullYear() - 1993 - (d.getMonth() < 8 ? 1 : 0);
	const last = new Date(1993 + level, 8, 1).getTime();
	const next = new Date(1993 + level + 1, 8, 1).getTime();
	return { level, fraction: Math.min(1, Math.max(0, (now - last) / (next - last))) };
}

/**
 * Review helpers: ?time=night&vibe=neon&event=deploy previews other moods of the same office,
 * ?world=default shows the hand-written starter office, ?seed=42 lays out another floorplan with
 * a hand-written brief picked by the seed (world/offline-briefs.ts),
 * ?view=overview shows the whole floor from above, ?outside=rain sets the weather, ?build=5 freezes the build replay at step 5.
 */
function parsePreview(search: string) {
	const q = new URLSearchParams(search);
	const pick = <T extends string>(key: string, list: readonly T[]) => {
		const v = q.get(key);
		return v && (list as readonly string[]).includes(v) ? (v as T) : undefined;
	};
	const time = pick('time', timesOfDay);
	const vibe = pick('vibe', vibes);
	const event = pick('event', eventKinds);
	const outside = pick('outside', outsides);
	const seed = Number(q.get('seed'));
	return {
		brief: {
			...(time ? { timeOfDay: time } : {}),
			...(vibe ? { vibe } : {}),
			...(event ? { event: { kind: event, title: 'Preview', story: '' } } : {}),
			...(outside ? { outside } : {}),
		},
		seed: Number.isSafeInteger(seed) && seed > 0 ? seed : null,
		starter: q.get('world') === 'default' || q.has('seed'),
		/** ?world=default is always the canonical office; a bare ?seed=N gets a pooled brief. */
		canonical: q.get('world') === 'default',
		overview: q.get('view') === 'overview',
		/** Freeze the build replay at this step. */
		build: q.has('build') ? Math.max(0, Number(q.get('build')) || 0) : null,
	};
}

const clip = (s: string, n: number) =>
	s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

export function QuestApp({
	initial,
	content,
	business,
	multiplayer = false,
	fontVars,
}: {
	initial: WorldState;
	content: LabContent;
	business: Business;
	/** The live room is switched on (QUEST_MULTIPLAYER). */
	multiplayer?: boolean;
	fontVars: string;
}) {
	const [bus] = useState(() => new GameBus());
	const search = useSearch();
	const preview = useMemo(() => parsePreview(search), [search]);
	// Preview offices (?world=default, ?seed=N) are not the shared office: play those solo.
	const room = useRoom({ enabled: multiplayer && !preview.starter, bus });
	const world = useWorld(initial, { live: room.status === 'live', subscribe: room.subscribe });
	const chat = useMaxChat();
	const visitors = useSyncExternalStore(
		room.presence.subscribe,
		room.presence.getIds,
		room.presence.getIds,
	);
	const ownLook = useMemo(() => (room.you ? lookFor(room.you) : null), [room.you]);
	const [log] = useState(() => new ChatLog());
	const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
	const touch = useMedia('(pointer: coarse)');
	const compact = useMedia('(max-width: 640px)');
	const hidden = useDocumentHidden();
	const seenIntro = useSessionFlag(INTRO_KEY);
	const seenTouchHint = useStoredFlag(TOUCH_HINT_KEY);
	const now = useNow(1000);
	const nearby = useSyncExternalStore(bus.subscribeNearby, bus.getNearby, () => null);

	const [sceneReady, setSceneReady] = useState(false);
	const [open, setOpen] = useState<WindowId | null>(null);
	const [wikiFile, setWikiFile] = useState(content.wiki[0]?.filename ?? '');
	const [intro, setIntro] = useState({ step: 0, done: false });
	const [zone, setZone] = useState({ key: '', small: false });
	const [born, setBorn] = useState({
		id: initial.world.id,
		at: Date.parse(initial.world.createdAt) || 0,
	});
	if (born.id !== world.worldId && now) setBorn({ id: world.worldId, at: now });

	// The page's data is in and the app is up: the first stretch of the loading bar.
	useEffect(() => reportLoad('page', 1), []);

	// Dev-only handle for poking at the scene from the console and screenshot scripts.
	useEffect(() => {
		if (import.meta.env.DEV) Object.assign(window, { __questBus: bus });
	}, [bus]);

	// --- which brief is on screen: the intro replays the current office quickly, once per session
	const generating = world.status === 'generating';
	const starter = preview.starter && !generating;
	const seed = starter ? (preview.seed ?? DEFAULT_SEED) : world.seed;
	const baseBrief = starter ? (preview.canonical ? defaultBrief : briefForSeed(seed)) : world.brief;
	const brief = useMemo(() => ({ ...baseBrief, ...preview.brief }), [baseBrief, preview]);
	const steps = useMemo(() => briefSteps(brief), [brief]);
	const introActive =
		seenIntro === false && !reducedMotion && world.status === 'ready' && !intro.done;
	const introRunning = introActive && sceneReady;
	const frozen = preview.build !== null && !generating;
	const partial = introActive || generating || frozen;
	const step = frozen
		? Math.min(preview.build!, steps.length - 1)
		: introActive
			? Math.min(intro.step, steps.length - 1)
			: steps.length - 1;

	const shown = introActive || frozen ? steps[step] : brief;
	const compiled = useMemo(() => compileWorld(shown, seed, { partial }), [shown, seed, partial]);
	const worldName = brief.company || (generating ? 'A new office' : 'the office');
	const tagline = brief.tagline;

	useEffect(() => {
		if (!introRunning) return;
		const total = steps.length;
		const id = window.setInterval(
			() =>
				setIntro((s) =>
					s.done
						? s
						: s.step + 1 >= total
							? { step: total, done: true }
							: { step: s.step + 1, done: false },
				),
			Math.max(20, INTRO_MS / total),
		);
		return () => window.clearInterval(id);
	}, [introRunning, steps.length]);

	useEffect(() => {
		if (intro.done) setSessionFlag(INTRO_KEY);
	}, [intro.done]);

	// Any key or click skips the intro.
	useEffect(() => {
		if (!introRunning) return;
		const skip = () => setIntro({ step: steps.length, done: true });
		window.addEventListener('keydown', skip);
		window.addEventListener('pointerdown', skip);
		return () => {
			window.removeEventListener('keydown', skip);
			window.removeEventListener('pointerdown', skip);
		};
	}, [introRunning, steps.length]);

	// Narrate the replay with the office's own build log, zones only, so it stays readable.
	useEffect(() => {
		if (!introRunning) return;
		if (intro.step === 0)
			log.push({
				id: `intro-${world.worldId}-start`,
				kind: 'forge',
				text: `Replaying how ${worldName} was set up…`,
			});
		const zone = steps[intro.step]?.zones.at(-1);
		const before = steps[intro.step - 1]?.zones.length ?? 0;
		if (zone && steps[intro.step].zones.length > before && zone.story)
			log.push({ id: `intro-${world.worldId}-${intro.step}`, kind: 'forge', text: zone.story });
	}, [introRunning, intro.step, steps, log, world.worldId, worldName]);

	// --- zone text: big on arrival, small after a few seconds, again for each new world
	const zoneKey = world.worldId;
	const zoneState: 'hidden' | 'big' | 'small' = !sceneReady
		? 'big'
		: introActive || generating
			? 'hidden'
			: zone.key === zoneKey && zone.small
				? 'small'
				: 'big';
	useEffect(() => {
		if (!sceneReady || introActive || generating) return;
		const id = window.setTimeout(() => setZone({ key: zoneKey, small: true }), 5500);
		return () => window.clearTimeout(id);
	}, [sceneReady, introActive, generating, zoneKey]);

	// --- chat log feeds
	useEffect(() => {
		for (const e of world.log)
			log.push({
				id: `w-${e.id}`,
				kind: e.kind === 'story' ? 'forge' : e.kind === 'error' ? 'error' : 'system',
				text: e.text,
			});
	}, [world.log, log]);

	useEffect(() => {
		for (const l of chat.lines)
			log.push({
				id: `c-${l.id}`,
				kind: 'whisper',
				speaker: 'Max',
				direction: l.role === 'visitor' ? 'out' : 'in',
				text:
					clip(l.text, 280) +
					(l.draft ? ' (A ticket draft is waiting in the chat.)' : ''),
			});
	}, [chat.lines, log]);

	useEffect(() => {
		if (chat.error)
			log.push({
				id: `ce-${chat.lines.length}-${chat.error}`,
				kind: 'error',
				text: chat.error,
			});
	}, [chat.error, chat.lines.length, log]);

	useEffect(() => {
		if (!sceneReady || introActive || generating) return;
		log.push({
			id: `welcome-${world.worldId}`,
			kind: 'system',
			text: touch
				? `Welcome to ${worldName}. Tap the floor to walk, tap Max to talk, or use the buttons below.`
				: `Welcome to ${worldName}. Walk with WASD or click the floor, turn the view with Q and E. Press F near Max to talk, or open an app from the dock.`,
		});
	}, [sceneReady, introActive, generating, world.worldId, worldName, touch, log]);

	useEffect(() => {
		if (nearby?.kind === 'landmark')
			log.push({
				id: `disc-${world.worldId}-${nearby.id}`,
				kind: 'discovery',
				text: nearby.name,
			});
	}, [nearby, log, world.worldId]);

	// --- what happens when the visitor arrives somewhere or presses F
	const onInteract = useEffectEvent((t: Interactable) => {
		if (t.kind === 'npc') {
			bus.say(t.id, t.line);
			log.push({
				id: `npc-${t.id}-${Date.now()}`,
				kind: 'npc',
				speaker: t.name,
				text: t.line,
			});
			return;
		}
		setOpen(LANDMARK_WINDOW[t.id]);
	});
	useEffect(() => bus.onInteract((t) => onInteract(t)), [bus]);

	const toggle = (id: WindowId) => setOpen((o) => (o === id ? null : id));

	const tellMax = () => {
		setOpen('gossip');
		if (!chat.isBusy) chat.send('I have a project for you');
	};

	const readDisclaimer = () => {
		const page = content.wiki.find((p) => /disclaimer/i.test(p.filename));
		if (page) setWikiFile(page.filename);
		setOpen('library');
	};

	const forge = () => {
		if (!world.canGenerate) return;
		void world.generate();
		setOpen(null);
	};

	const landmarkName = (id: LandmarkId) => compiled.landmark[id]?.name ?? '';
	const cooldownMs =
		world.nextGenerationAt && now
			? Math.max(0, world.nextGenerationAt.getTime() - now)
			: 0;
	const xp = levelAt(now);

	const actions: Action[] = [
		{
			id: 'talk',
			label: 'Talk',
			title: 'Talk to Max',
			description:
				'Ask Max’s echo anything about his work, or tell it about a project you have in mind.',
			use: 'Opens a chat with Max.',
			key: '1',
			onUse: () => toggle('gossip'),
		},
		{
			id: 'library',
			label: 'Wiki',
			title: landmarkName('library') || 'The Wiki Shelf',
			description:
				'Max’s wiki: who he is, what he uses, what he thinks. Kept like a git repo, joke commits included.',
			use: 'Opens the wiki.',
			key: '2',
			onUse: () => toggle('library'),
		},
		{
			id: 'stage',
			label: 'Stage',
			title: landmarkName('stage') || 'The Stage',
			description: 'Talks Max has given at meetups and conferences.',
			use: 'Lists every talk.',
			key: '3',
			onUse: () => toggle('stage'),
		},
		{
			id: 'quest',
			label: 'Hire',
			title: landmarkName('questboard') || 'The Ticket Board',
			description:
				'Got a project? Max builds web products end to end, AI features included.',
			use: 'Shows how to hire Max.',
			key: '4',
			onUse: () => toggle('questboard'),
		},
		{
			id: 'forge',
			label: 'Redeploy',
			title: 'Redeploy the office',
			description: generating
				? 'A new office is being deployed right now. Watch it come together.'
				: cooldownMs > 0
					? `The main rack is cooling down. Ready ${untilLabel(cooldownMs)}.`
					: 'Ask the main rack for a brand-new office. An AI writes it, the office builds itself live.',
			use: 'Opens the server rack.',
			key: '5',
			disabled: !world.canGenerate,
			busy: generating,
			cooldown:
				cooldownMs > 0 && !generating
					? {
							fraction: Math.min(1, cooldownMs / HOUR),
							text: `${Math.ceil(cooldownMs / 60000)}m`,
						}
					: null,
			onUse: () => toggle('forge'),
		},
		{
			id: 'controls',
			label: 'Controls',
			title: 'Controls',
			description: 'Keys, mouse and touch, all in one place.',
			use: 'Shows the controls.',
			key: '6',
			onUse: () => toggle('controls'),
		},
	];

	const onHotkey = useEffectEvent((e: KeyboardEvent) => {
		if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target) || introRunning)
			return;
		const n = Number(e.key);
		if (Number.isInteger(n) && n >= 1 && n <= actions.length) {
			e.preventDefault();
			actions[n - 1].onUse();
		}
	});
	useEffect(() => {
		const h = (e: KeyboardEvent) => onHotkey(e);
		window.addEventListener('keydown', h);
		return () => window.removeEventListener('keydown', h);
	}, []);

	const places = compiled.landmarks.map((l) => l.name).join(', ');
	const layer = cx(fontVars, styles.layer);

	return (
		<LayerContext.Provider value={layer}>
			<div className={cx(styles.root, fontVars)}>
				<div
					className={styles.stage}
					role="img"
					aria-label={`A 3D office of ${worldName}`}
					aria-describedby="quest-world-summary"
				>
					<ClientOnly fallback={null}>
						<Suspense fallback={null}>
							<WorldCanvas
								world={compiled}
								bus={bus}
								mode={introActive || generating || frozen || preview.overview ? 'overview' : 'play'}
								animate={
									sceneReady &&
									(introActive || generating || world.worldId !== initial.world.id)
								}
								reducedMotion={reducedMotion}
								quality={touch || compact ? 'low' : 'high'}
								paused={hidden || (compact && open !== null)}
								inputEnabled={open === null}
								respawnKey={`${world.worldId}|${generating ? 'gen' : 'live'}|${introActive ? 'intro' : 'play'}`}
								presence={room.status === 'live' ? room.presence : null}
								appearance={ownLook}
								onReady={() => setSceneReady(true)}
							/>
						</Suspense>
					</ClientOnly>
					<Labels world={compiled} bus={bus} touch={touch} visitors={visitors} />
				</div>
				<p id="quest-world-summary" className={styles.srOnly}>
					{worldName}. {tagline} Places: {places || 'still being built'}. Everything here
					is also reachable from the dock and the floor plan.
				</p>
				<LoadingVeil ready={sceneReady} name={worldName} />
				<ZoneText state={zoneState} worldName={worldName} tagline={tagline} />
				{(generating || frozen || introRunning) && sceneReady ? (
					<BuildProgress brief={shown} world={compiled} live={generating} />
				) : null}
				{touch && seenTouchHint === false && sceneReady && !introActive && !generating && open === null ? (
					<div className={styles.touchHint} role="note">
						<span className={styles.touchHintIcon} aria-hidden="true" />
						<p>
							Tap or hold the floor to walk <span aria-hidden="true">&middot;</span> tap people to chat
						</p>
						<button type="button" onClick={() => setStoredFlag(TOUCH_HINT_KEY)}>
							Got it
						</button>
					</div>
				) : null}
				{introRunning ? (
					<p className={styles.skipHint} aria-hidden="true">
						The office is setting itself up. Press any key or click to skip.
					</p>
				) : null}
				<UnitFrame
					level={xp.level}
					compact={compact || zoneState !== 'big'}
					onOpen={() => toggle('character')}
				/>
				<Minimap
					world={compiled}
					bus={bus}
					time={compiled.meta.timeOfDay}
					outside={compiled.meta.outside}
					name={worldName}
					collapsedByDefault={compact}
					onPin={(id) => {
						setOpen(null);
						bus.walkTo({ kind: 'landmark', id });
					}}
					footer={
						<PresenceStrip status={room.status} count={room.count} onWave={() => bus.wave()} />
					}
				/>
				<ChatLogView log={log} compact={compact} hidden={open === 'gossip'} />
				<Dock
					actions={actions}
					xp={xp}
					nearby={open ? null : nearby}
					touch={touch}
					onInteract={() => bus.interact()}
				/>

				<GossipWindow
					open={open === 'gossip'}
					onClose={() => setOpen(null)}
					chat={chat}
					onDisclaimer={readDisclaimer}
				/>
				<LibraryWindow
					open={open === 'library'}
					onClose={() => setOpen(null)}
					pages={content.wiki}
					file={wikiFile}
					onFile={setWikiFile}
					name={landmarkName('library') || 'The Wiki Shelf'}
				/>
				<StageWindow
					open={open === 'stage'}
					onClose={() => setOpen(null)}
					talks={content.talks}
					events={content.events}
					name={landmarkName('stage') || 'The Stage'}
				/>
				<QuestBoardWindow
					open={open === 'questboard'}
					onClose={() => setOpen(null)}
					business={business}
					name={landmarkName('questboard') || 'The Ticket Board'}
					onTellMax={tellMax}
				/>
				<ForgeWindow
					open={open === 'forge'}
					onClose={() => setOpen(null)}
					worldName={worldName}
					tagline={tagline}
					createdAt={born.at}
					source={born.id === initial.world.id ? initial.world.source : 'generated'}
					nextAt={world.nextGenerationAt}
					canGenerate={world.canGenerate}
					generating={generating}
					error={world.error}
					now={now}
					onForge={forge}
				/>
				<CharacterWindow
					open={open === 'character'}
					onClose={() => setOpen(null)}
					business={business}
					level={xp.level}
					onHire={() => setOpen('questboard')}
				/>
				<ControlsWindow open={open === 'controls'} onClose={() => setOpen(null)} />
			</div>
		</LayerContext.Provider>
	);
}
