'use client';

import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import type { CompiledWorld } from '../world/compile';
import { Atmosphere } from './atmosphere';
import { Npc } from './actors';
import type { GameBus } from './bus';
import { Controller } from './controller';
import { DustPuffs, WeatherFx } from './effects';
import { LIGHTING } from './palette';
import { Spawns } from './spawn';
import { Structures } from './structures';
import { Terrain } from './terrain';
import { sampleHeight } from '../world/compile';

export type WorldCanvasProps = {
	world: CompiledWorld;
	bus: GameBus;
	/** Overview: the camera rises and circles the valley (while a world is being forged). */
	mode: 'play' | 'overview';
	/** Pop new blocks in with dust; off for the first paint and reduced motion. */
	animate: boolean;
	reducedMotion: boolean;
	quality: 'high' | 'low';
	paused: boolean;
	inputEnabled: boolean;
	/** Changes when the visitor should be placed next to Max again. */
	respawnKey: string;
	onReady: () => void;
};

export default function WorldCanvas(props: WorldCanvasProps) {
	const { quality, paused, onReady } = props;
	return (
		<Canvas
			flat
			shadows={quality === 'high' ? 'percentage' : false}
			dpr={quality === 'high' ? [1, 2] : [1, 1.5]}
			frameloop={paused ? 'never' : 'always'}
			camera={{ fov: 50, near: 0.1, far: 700, position: [20, 24, 52] }}
			gl={{ antialias: true, powerPreference: 'high-performance' }}
			onCreated={() => onReady()}
			style={{ touchAction: 'none' }}
		>
			<Scene {...props} />
		</Canvas>
	);
}

function Scene({
	world,
	bus,
	mode,
	animate,
	reducedMotion,
	quality,
	inputEnabled,
	respawnKey,
}: WorldCanvasProps) {
	const lighting = LIGHTING[world.meta.timeOfDay];
	const [spawns] = useState(() => new Spawns());

	useEffect(() => {
		spawns.setAnimate(animate && !reducedMotion);
		const h = (x: number, y: number) => sampleHeight(world, x, y);
		for (const l of world.landmarks) spawns.register(l.id, l.x, h(l.x, l.y), l.y, 2.2);
		for (const b of world.buildings) spawns.register(b.id, b.x, h(b.x, b.y), b.y, 1.8);
		for (const p of world.props) spawns.register(p.id, p.x, h(p.x, p.y), p.y, 0.6);
		for (const n of world.npcs) spawns.register(n.id, n.x, h(n.x, n.y), n.y, 0.7);
		world.trees.forEach((t, i) =>
			spawns.register(t.id, t.x, h(t.x, t.y), t.y, 0.9, i % 5 === 0),
		);
		world.rocks.forEach((r, i) =>
			spawns.register(r.id, r.x, h(r.x, r.y), r.y, 0.6, i % 4 === 0),
		);
	}, [world, animate, reducedMotion, spawns]);

	// Forget NPC positions that no longer exist.
	useEffect(() => {
		const ids = new Set(world.npcs.map((n) => n.id));
		for (const id of bus.npcs.keys()) if (!ids.has(id)) bus.npcs.delete(id);
	}, [world, bus]);

	return (
		<>
			<Atmosphere
				world={world}
				lighting={lighting}
				shadows={quality === 'high'}
				reducedMotion={reducedMotion}
			/>
			<Terrain
				world={world}
				lighting={lighting}
				quality={quality}
				reducedMotion={reducedMotion}
			/>
			<Structures
				world={world}
				spawns={spawns}
				reducedMotion={reducedMotion}
				bus={bus}
				lighting={lighting}
			/>
			{world.npcs.map((n) => (
				<Npc
					key={n.id}
					entity={n}
					world={world}
					bus={bus}
					spawns={spawns}
					reducedMotion={reducedMotion}
				/>
			))}
			<Controller
				world={world}
				bus={bus}
				mode={mode}
				inputEnabled={inputEnabled}
				reducedMotion={reducedMotion}
				respawnKey={respawnKey}
			/>
			<DustPuffs spawns={spawns} biome={world.meta.biome} />
			<WeatherFx
				weather={world.meta.weather}
				bus={bus}
				overview={mode === 'overview'}
				quality={quality}
				reducedMotion={reducedMotion}
				night={lighting.glow >= 1}
				biome={world.meta.biome}
			/>
		</>
	);
}
