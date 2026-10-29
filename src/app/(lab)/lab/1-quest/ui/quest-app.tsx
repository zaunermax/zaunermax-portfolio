'use client';

import dynamic from 'next/dynamic';
import {
	useEffect,
	useEffectEvent,
	useMemo,
	useState,
	useSyncExternalStore,
} from 'react';
import type { LabContent } from '../../_shared/content';
import { useMaxChat } from '../chat/use-max-chat';
import { GameBus, type Interactable } from '../scene/bus';
import { compileWorld } from '../world/compile';
import { defaultWorldOps } from '../world/default-world';
import type { WorldState } from '../world/contract';
import { biomes, timesOfDay, weathers, type LandmarkId } from '../world/schema';
import { useWorld } from '../world/use-world';
import { ChatLog, ChatLogView } from './chat-log';
import { Labels } from './labels';
import styles from './hud.module.css';
import { Dock, LoadingVeil, Minimap, UnitFrame, ZoneText, type Action } from './hud';
import {
	isTypingTarget,
	setSessionFlag,
	useDocumentHidden,
	useMedia,
	useNow,
	useSearch,
	useSessionFlag,
} from './hooks';
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

const WorldCanvas = dynamic(() => import('../scene/world-canvas'), { ssr: false });

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
 * Review helpers: ?time=night&biome=winter&weather=snow previews other moods of the same world,
 * ?world=default shows the hand-built starter world instead of the current one.
 */
function parsePreview(search: string) {
	const q = new URLSearchParams(search);
	const pick = <T extends string>(key: string, list: readonly T[]) => {
		const v = q.get(key);
		return v && (list as readonly string[]).includes(v) ? (v as T) : undefined;
	};
	const meta = {
		...(pick('time', timesOfDay) ? { timeOfDay: pick('time', timesOfDay)! } : {}),
		...(pick('biome', biomes) ? { biome: pick('biome', biomes)! } : {}),
		...(pick('weather', weathers) ? { weather: pick('weather', weathers)! } : {}),
	};
	return {
		meta,
		any: Object.keys(meta).length > 0,
		starter: q.get('world') === 'default',
	};
}

const clip = (s: string, n: number) =>
	s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

export function QuestApp({
	initial,
	content,
	business,
	fontVars,
}: {
	initial: WorldState;
	content: LabContent;
	business: Business;
	fontVars: string;
}) {
	const world = useWorld(initial);
	const chat = useMaxChat();
	const [bus] = useState(() => new GameBus());
	const [log] = useState(() => new ChatLog());
	const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
	const touch = useMedia('(pointer: coarse)');
	const compact = useMedia('(max-width: 640px)');
	const hidden = useDocumentHidden();
	const seenIntro = useSessionFlag(INTRO_KEY);
	const search = useSearch();
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

	// Dev-only handle for poking at the scene from the console and screenshot scripts.
	useEffect(() => {
		if (process.env.NODE_ENV !== 'production') Object.assign(window, { __questBus: bus });
	}, [bus]);

	// --- which ops are on screen: the intro replays the current world quickly, once per session
	const preview = useMemo(() => parsePreview(search), [search]);
	const generating = world.status === 'generating';
	const ops = preview.starter && !generating ? defaultWorldOps : world.ops;
	const introActive =
		seenIntro === false &&
		!reducedMotion &&
		world.status === 'ready' &&
		ops.length > 0 &&
		!intro.done;
	const introRunning = introActive && sceneReady;
	const partial = introActive || generating;
	const step = introActive ? intro.step : ops.length;

	const compiledRaw = useMemo(
		() => compileWorld(introActive ? ops.slice(0, step) : ops, { partial }),
		[ops, step, introActive, partial],
	);
	const compiled = useMemo(
		() =>
			preview.any
				? { ...compiledRaw, meta: { ...compiledRaw.meta, ...preview.meta } }
				: compiledRaw,
		[compiledRaw, preview],
	);
	const finalMeta = useMemo(
		() => compileWorld(ops, { partial: generating }).meta,
		[ops, generating],
	);
	const worldName = generating ? compiled.meta.name : finalMeta.name;
	const tagline = generating ? compiled.meta.tagline : finalMeta.tagline;

	useEffect(() => {
		if (!introRunning) return;
		const total = ops.length;
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
	}, [introRunning, ops.length]);

	useEffect(() => {
		if (intro.done) setSessionFlag(INTRO_KEY);
	}, [intro.done]);

	// Any key or click skips the intro.
	useEffect(() => {
		if (!introRunning) return;
		const skip = () => setIntro({ step: ops.length, done: true });
		window.addEventListener('keydown', skip);
		window.addEventListener('pointerdown', skip);
		return () => {
			window.removeEventListener('keydown', skip);
			window.removeEventListener('pointerdown', skip);
		};
	}, [introRunning, ops.length]);

	// Narrate the replay with the world's own build log, landmarks only, so it stays readable.
	useEffect(() => {
		if (!introRunning || intro.step === 0) return;
		const op = ops[intro.step - 1];
		if (op?.type === 'meta')
			log.push({
				id: `intro-${world.worldId}-meta`,
				kind: 'forge',
				text: `Replaying how ${op.name} was forged…`,
			});
		if (op?.type === 'landmark' && op.story)
			log.push({
				id: `intro-${world.worldId}-${intro.step}`,
				kind: 'forge',
				text: op.story,
			});
	}, [introRunning, intro.step, ops, log, world.worldId]);

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
					(l.draft ? ' (A quest scroll is waiting in the conversation.)' : ''),
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
				? `Welcome to ${worldName}. Tap the ground to walk, tap Max to talk, or use the buttons below.`
				: `Welcome to ${worldName}. Walk with WASD or click the ground. Press F near Max to talk, or use the action bar.`,
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
			use: 'Opens a conversation with Max.',
			key: '1',
			onUse: () => toggle('gossip'),
		},
		{
			id: 'library',
			label: 'Library',
			title: landmarkName('library') || 'The Library',
			description:
				'Max’s wiki: who he is, what he uses, what he thinks. Kept like a git repo, joke commits included.',
			use: 'Opens the book.',
			key: '2',
			onUse: () => toggle('library'),
		},
		{
			id: 'stage',
			label: 'Stage',
			title: landmarkName('stage') || 'The Stage',
			description: 'Talks Max has given at meetups and conferences.',
			use: 'Opens the list of talks.',
			key: '3',
			onUse: () => toggle('stage'),
		},
		{
			id: 'quest',
			label: 'Hire',
			title: landmarkName('questboard') || 'The Quest Board',
			description:
				'Got a project? Max builds web products end to end, AI features included.',
			use: 'Shows how to hire Max.',
			key: '4',
			onUse: () => toggle('questboard'),
		},
		{
			id: 'forge',
			label: 'Forge',
			title: 'Forge a New World',
			description: generating
				? 'A new world is being forged right now. Watch it rise.'
				: cooldownMs > 0
					? `The waystone is cooling down. Ready ${untilLabel(cooldownMs)}.`
					: 'Ask the waystone for a brand-new valley. An AI builds it live, block by block.',
			use: 'Opens the World Forge.',
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
					aria-label={`A 3D valley called ${worldName}`}
					aria-describedby="quest-world-summary"
				>
					<WorldCanvas
						world={compiled}
						bus={bus}
						mode={introActive || generating ? 'overview' : 'play'}
						animate={
							sceneReady &&
							(introActive || generating || world.worldId !== initial.world.id)
						}
						reducedMotion={reducedMotion}
						quality={touch || compact ? 'low' : 'high'}
						paused={hidden || (compact && open !== null)}
						inputEnabled={open === null}
						respawnKey={`${world.worldId}|${generating ? 'gen' : 'live'}|${introActive ? 'intro' : 'play'}`}
						onReady={() => setSceneReady(true)}
					/>
					<Labels world={compiled} bus={bus} />
				</div>
				<p id="quest-world-summary" className={styles.srOnly}>
					{worldName}. {tagline} Places: {places || 'still being built'}. Everything here
					is also reachable with the action bar and the map buttons.
				</p>
				<LoadingVeil ready={sceneReady} name={worldName} />
				<ZoneText state={zoneState} worldName={worldName} tagline={tagline} />
				{introRunning ? (
					<p className={styles.skipHint} aria-hidden="true">
						The world is assembling. Press any key or click to skip.
					</p>
				) : null}
				<UnitFrame level={xp.level} onOpen={() => toggle('character')} />
				<Minimap
					world={compiled}
					bus={bus}
					time={compiled.meta.timeOfDay}
					onPin={(id) => {
						setOpen(null);
						bus.walkTo({ kind: 'landmark', id });
					}}
				/>
				<ChatLogView log={log} compact={compact} />
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
					name={landmarkName('library') || 'The Library'}
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
					name={landmarkName('questboard') || 'The Quest Board'}
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
