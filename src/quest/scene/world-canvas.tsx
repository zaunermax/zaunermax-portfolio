'use client';

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { Presence } from '../room/presence';
import type { Appearance } from '../world/appearance';
import type { CompiledWorld } from '../world/compile';
import { Anchor, Npc, setCursor } from './actors';
import { MAX_ANCHOR, type GameBus } from './bus';
import { Controller } from './controller';
import { FrameLoop } from './frame-loop';
import { Props } from './furniture';
import { KitProvider, useKit } from './kit';
import { Life } from './life';
import { materials } from './materials';
import { EventScreen, NightLights, RainOnGlass } from './night';
import { Grounds } from './grounds';
import { Floors, Seams, WallCut, Walls, WindowLight } from './office';
import { LIGHTING, type Lighting } from './palette';
import type { FramePath } from './pipeline';
import { ContactShade, Render } from './shading';
import { markShadows } from './shadows';
import { Spawns } from './spawn';
import { Visitors } from './visitors';
import { Weather, weatherLighting } from './weather';

export type WorldCanvasProps = {
	world: CompiledWorld;
	bus: GameBus;
	/** Overview: the camera rises over the whole office (while one is being built). */
	mode: 'play' | 'overview';
	/** Pop new things in with a bounce; off for the first paint and reduced motion. */
	animate: boolean;
	reducedMotion: boolean;
	quality: 'high' | 'low';
	paused: boolean;
	/** A window and its backdrop cover the office: it keeps moving, at half the frame rate. */
	covered?: boolean;
	inputEnabled: boolean;
	/** Changes when the visitor should be placed next to Max again. */
	respawnKey: string;
	/** Everyone else in the live room; null when playing solo. */
	presence: Presence | null;
	/** The visitor's own look while in the room (as others see them); null for the default. */
	appearance: Appearance | null;
	onReady: () => void;
};

/** How long the veil waits for the kit before showing whatever there is. */
const KIT_TIMEOUT_MS = 30000;

/** Review aids: ?fx=full keeps full quality however slow the frames (headless software GL),
 * ?fx=lite starts in lite quality, ?fps=max renders on every vsync instead of about 60 fps. */
function reviewFlags() {
	const q = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
	return { adaptive: q.get('fx') !== 'full', lite: q.get('fx') === 'lite', uncapped: q.get('fps') === 'max' };
}

export default function WorldCanvas(props: WorldCanvasProps) {
	const { quality, paused, covered = false, onReady } = props;
	const [flags] = useState(reviewFlags);
	// Once the frame rate sags for a few seconds (Firefox on a laptop, say), drop the ambient
	// occlusion and render at one pixel per CSS pixel for the rest of the visit.
	const [lite, setLite] = useState(flags.lite);
	const [settled, setSettled] = useState(false);
	const pipeline = useRef<FramePath | null>(null);
	const high = quality === 'high';
	// Phones (low quality from the start) keep an antialiased canvas and draw straight to it, as
	// they always have; everyone else renders through the MSAA target (pipeline.ts).
	const [direct] = useState(() => quality === 'low');
	const ready = useRef(onReady);
	useEffect(() => {
		ready.current = onReady;
	}, [onReady]);
	useEffect(() => {
		const id = window.setTimeout(() => {
			setSettled(true);
			ready.current();
		}, KIT_TIMEOUT_MS);
		return () => window.clearTimeout(id);
	}, []);
	return (
		<Canvas
			flat
			// Variance shadows: soft edges that also survive software GL, where blurred PCF does not.
			shadows={quality === 'high' ? 'variance' : false}
			// Rendering stops at 1.5x; a denser canvas would only be upscaled.
			dpr={lite ? 1 : [1, 1.5]}
			// FrameLoop drives the frames.
			frameloop="never"
			camera={{ fov: 30, near: 0.5, far: 400, position: [20, 30, 50] }}
			// The scene renders into its own MSAA target (pipeline.ts) and covers every pixel with
			// an opaque sky: the canvas needs no antialiasing, alpha or depth of its own (unless
			// low quality draws straight to it).
			gl={{ antialias: direct, alpha: false, depth: direct, powerPreference: 'high-performance' }}
			style={{ touchAction: 'none' }}
		>
			<FrameLoop
				paused={paused}
				covered={covered}
				uncapped={flags.uncapped}
				judge={high && !lite && flags.adaptive && settled}
				onDecline={() => setLite(true)}
			/>
			<KitProvider>
				<Scene
					{...props}
					ao={high && !lite}
					direct={direct && !high}
					onPipeline={(p) => {
						pipeline.current = p;
					}}
				/>
				<ReadyWithKit
					pipeline={pipeline}
					onReady={() => {
						setSettled(true);
						ready.current();
					}}
				/>
			</KitProvider>
		</Canvas>
	);
}

/**
 * Tells the app the office is ready once the voxel kit has arrived (or failed for good), its
 * shaders have linked in the background and a couple of frames have drawn it, so the veil never
 * lifts on placeholder boxes or on frames stalled by shader compiles.
 */
function ReadyWithKit({ onReady, pipeline }: { onReady: () => void; pipeline: RefObject<FramePath | null> }) {
	const kit = useKit();
	const scene = useThree((state) => state.scene);
	const camera = useThree((state) => state.camera);
	const stage = useRef<'kit' | 'compiling' | 'drawing' | 'done'>('kit');
	const frames = useRef(0);
	useFrame(() => {
		if (stage.current === 'done' || !kit.ready) return;
		if (stage.current === 'kit') {
			const p = pipeline.current;
			if (!p) return;
			stage.current = 'compiling';
			const drawn = () => {
				stage.current = 'drawing';
			};
			p.compile(scene, camera).then(drawn, drawn);
			return;
		}
		if (stage.current === 'compiling' || ++frames.current < 3) return;
		stage.current = 'done';
		onReady();
	});
	return null;
}

function Lights({ world, lighting, shadows }: { world: CompiledWorld; lighting: Lighting; shadows: boolean }) {
	const sun = useRef<THREE.DirectionalLight>(null);
	const cx = world.width / 2;
	const cz = world.height / 2;
	useEffect(() => {
		materials().glow.color.setScalar(lighting.glow);
		materials().actor.glow.color.setScalar(lighting.glow);
	}, [lighting]);
	useEffect(() => {
		const light = sun.current;
		if (!light) return;
		light.target.position.set(cx, 0, cz);
		light.target.updateMatrixWorld();
		// The shadow camera's bounds only apply once its projection is rebuilt.
		const camera = light.shadow.camera;
		camera.left = -26;
		camera.right = 26;
		camera.top = 26;
		camera.bottom = -26;
		camera.near = 1;
		camera.far = 140;
		camera.updateProjectionMatrix();
		light.shadow.needsUpdate = true;
		markShadows();
	}, [cx, cz]);
	useEffect(() => markShadows(), [lighting, shadows]);
	const [dx, dy, dz] = lighting.sunDir;
	return (
		<>
			<color attach="background" args={[lighting.sky]} />
			{/* Cool sky fill from above, warm bounce from the floor, warm lamps at night. */}
			<hemisphereLight args={[lighting.hemiSky, lighting.hemiGround, lighting.hemi]} />
			{/* Warm fill by day; at night a cool, dim moonlit fill, so the lamps' pools stand out. */}
			<ambientLight
				color={lighting.indoor >= 1 ? '#9792d6' : '#ffd9a8'}
				intensity={lighting.indoor >= 1 ? 0.42 : lighting.indoor * 0.45}
			/>
			{/* The warm key: soft-edged PCF shadows over the whole floor. */}
			<directionalLight
				ref={sun}
				color={lighting.sun}
				intensity={lighting.sunIntensity}
				position={[cx + dx * 4, dy * 4, cz + dz * 4]}
				castShadow={shadows}
				shadow-mapSize={[2048, 2048]}
				shadow-radius={5}
				shadow-blurSamples={8}
				shadow-intensity={lighting.shadow}
				shadow-bias={-0.0006}
				shadow-normalBias={0.03}
			/>
		</>
	);
}

/** Click targets and label anchors for the five landmarks. */
function Landmarks({ world, bus }: { world: CompiledWorld; bus: GameBus }) {
	return (
		<>
			{world.landmarks.map((l) => {
				const onClick = (e: ThreeEvent<MouseEvent>) => {
					e.stopPropagation();
					if (e.delta > 8) return;
					bus.walkTo({ kind: 'landmark', id: l.landmark });
				};
				return (
					<group key={l.id} position={[l.x, 0, l.y]}>
						<mesh
							position={[0, l.height / 2, 0]}
							material={materials().hitbox}
							onClick={onClick}
							onPointerOver={(e) => {
								e.stopPropagation();
								setCursor(true);
							}}
							onPointerOut={() => setCursor(false)}
						>
							<boxGeometry args={[1.2, l.height, 1.2]} />
						</mesh>
						{l.landmark === 'max' && world.max ? null : (
							<Anchor bus={bus} id={l.landmark === 'max' ? MAX_ANCHOR : l.id} height={l.height + 0.35} />
						)}
					</group>
				);
			})}
		</>
	);
}

/** Pops in rooms, then their furniture, then the people, as ids first appear. */
function useSpawns(world: CompiledWorld, animate: boolean) {
	const [spawns] = useState(() => new Spawns());
	useEffect(() => {
		spawns.setAnimate(animate);
		for (const r of world.rooms)
			spawns.register(`floor-${r.index}-${r.kind ?? 'bare'}`, r.x + r.w / 2, 0, r.y + r.h / 2, 0, false);
		for (const f of world.furniture)
			spawns.register(f.id, f.x + f.w / 2, f.elev, f.y + f.d / 2, Math.min(1.4, (f.w + f.d) / 2), f.blocks, 0.25);
		for (const d of world.decor) spawns.register(d.id, d.x, d.y, d.z, 0.3, false, 0.55);
		for (const a of [...world.npcs, ...(world.max ? [world.max] : [])])
			spawns.register(a.id, a.x, a.elev, a.y, 0.6, true, 0.7);
	}, [world, animate, spawns]);
	return spawns;
}

function Scene({
	ao,
	direct,
	onPipeline,
	world,
	bus,
	mode,
	animate,
	reducedMotion,
	quality,
	inputEnabled,
	respawnKey,
	presence,
	appearance,
}: WorldCanvasProps & { ao: boolean; direct: boolean; onPipeline: (path: FramePath | null) => void }) {
	const lighting = useMemo(
		() => weatherLighting(LIGHTING[world.meta.timeOfDay], world.meta.outside),
		[world.meta.timeOfDay, world.meta.outside],
	);
	const spawns = useSpawns(world, animate && !reducedMotion);
	const cut = useMemo(() => new WallCut(world.width, world.height), [world.width, world.height]);

	// Forget NPC positions that no longer exist.
	useEffect(() => {
		const ids = new Set(world.npcs.map((n) => n.id));
		for (const id of bus.npcs.keys()) if (!ids.has(id)) bus.npcs.delete(id);
	}, [world, bus]);
	// A new office: redraw the sun's shadows.
	useEffect(() => markShadows(), [world]);

	return (
		<>
			<Lights world={world} lighting={lighting} shadows={quality === 'high'} />
			<NightLights world={world} lighting={lighting} />
			<EventScreen world={world} />
			{world.meta.outside === 'rain' ? <RainOnGlass world={world} cut={cut} /> : null}
			<Grounds world={world} lighting={lighting} />
			<Floors world={world} spawns={spawns} />
			<WindowLight world={world} lighting={lighting} />
			<Seams world={world} />
			<ContactShade world={world} />
			<Render ao={ao} direct={direct} strength={lighting.ao} onPipeline={onPipeline} />
			<Walls world={world} bus={bus} cut={cut} reducedMotion={reducedMotion} />
			<Props world={world} spawns={spawns} cut={cut} />
			<Landmarks world={world} bus={bus} />
			{world.max ? (
				<Npc
					key="max"
					actor={world.max}
					world={world}
					bus={bus}
					spawns={spawns}
					reducedMotion={reducedMotion}
					anchor={MAX_ANCHOR}
				/>
			) : null}
			{world.npcs.map((n) => (
				<Npc key={n.id} actor={n} world={world} bus={bus} spawns={spawns} reducedMotion={reducedMotion} />
			))}
			<Life world={world} bus={bus} spawns={spawns} reducedMotion={reducedMotion} quality={quality} />
			{presence ? <Visitors presence={presence} bus={bus} reducedMotion={reducedMotion} /> : null}
			{reducedMotion ? null : <Weather world={world} outside={world.meta.outside} quality={quality} />}
			<Controller
				world={world}
				bus={bus}
				mode={mode}
				inputEnabled={inputEnabled}
				reducedMotion={reducedMotion}
				respawnKey={respawnKey}
				appearance={appearance}
			/>
		</>
	);
}
