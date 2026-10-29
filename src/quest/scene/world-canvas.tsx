'use client';

import { PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { CompiledWorld } from '../world/compile';
import { Anchor, Npc, setCursor } from './actors';
import { MAX_ANCHOR, type GameBus } from './bus';
import { Controller } from './controller';
import { Props } from './furniture';
import { KitProvider, useKit } from './kit';
import { Life } from './life';
import { materials } from './materials';
import { EventScreen, NightLights, RainOnGlass } from './night';
import { Grounds } from './grounds';
import { Floors, Seams, WallCut, Walls, WindowLight } from './office';
import { LIGHTING, type Lighting } from './palette';
import { ContactShade, PostFX } from './shading';
import { Spawns } from './spawn';
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
	inputEnabled: boolean;
	/** Changes when the visitor should be placed next to Max again. */
	respawnKey: string;
	onReady: () => void;
};

/** How long the veil waits for the kit before showing whatever there is. */
const KIT_TIMEOUT_MS = 30000;

export default function WorldCanvas(props: WorldCanvasProps) {
	const { quality, paused, onReady } = props;
	// Once the frame rate sags for a few seconds (Firefox on a laptop, say), drop the ambient
	// occlusion and render at one pixel per CSS pixel for the rest of the visit.
	const [lite, setLite] = useState(false);
	// Review aid: ?fx=full keeps full quality however slow the frames (headless software GL).
	const [adaptive] = useState(() => typeof window === 'undefined' || new URLSearchParams(window.location.search).get('fx') !== 'full');
	const high = quality === 'high';
	const ready = useRef(onReady);
	useEffect(() => {
		ready.current = onReady;
	}, [onReady]);
	useEffect(() => {
		const id = window.setTimeout(() => ready.current(), KIT_TIMEOUT_MS);
		return () => window.clearTimeout(id);
	}, []);
	return (
		<Canvas
			flat
			// Variance shadows: soft edges that also survive software GL, where blurred PCF does not.
			shadows={quality === 'high' ? 'variance' : false}
			// The composer renders at most 1.5x anyway; a denser canvas would only upscale it.
			dpr={lite ? 1 : [1, 1.5]}
			frameloop={paused ? 'never' : 'always'}
			camera={{ fov: 30, near: 0.5, far: 400, position: [20, 30, 50] }}
			gl={{ antialias: true, powerPreference: 'high-performance' }}
			style={{ touchAction: 'none' }}
		>
			{high && !lite && adaptive ? <PerformanceMonitor onDecline={() => setLite(true)} /> : null}
			<KitProvider>
				<Scene {...props} post={high && !lite} />
				<ReadyWithKit onReady={() => ready.current()} />
			</KitProvider>
		</Canvas>
	);
}

/**
 * Tells the app the office is ready once the voxel kit has arrived (or failed for good) and a
 * couple of frames have drawn it, so the veil never lifts on placeholder boxes.
 */
function ReadyWithKit({ onReady }: { onReady: () => void }) {
	const kit = useKit();
	const frames = useRef(0);
	const done = useRef(false);
	useFrame(() => {
		if (done.current || !kit.ready) return;
		if (++frames.current < 3) return;
		done.current = true;
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
	}, [cx, cz]);
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
	post,
	world,
	bus,
	mode,
	animate,
	reducedMotion,
	quality,
	inputEnabled,
	respawnKey,
}: WorldCanvasProps & { post: boolean }) {
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
			{post ? <PostFX strength={lighting.ao} /> : null}
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
			{reducedMotion ? null : <Weather world={world} outside={world.meta.outside} quality={quality} />}
			<Controller
				world={world}
				bus={bus}
				mode={mode}
				inputEnabled={inputEnabled}
				reducedMotion={reducedMotion}
				respawnKey={respawnKey}
			/>
		</>
	);
}
