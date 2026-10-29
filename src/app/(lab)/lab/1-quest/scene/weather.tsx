'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '../world/random';
import type { Outside } from '../world/schema';
import type { CompiledWorld } from '../world/types';
import type { Lighting } from './palette';

/*
 * The weather the brief asked for, seen through the windows: rain streaks or drifting snow in
 * a band around the building, and light to match (greyer for rain and cloud, a white yard for
 * snow). Subtle on purpose; nothing falls indoors.
 */

/** Lighting adjusted for the weather outside. */
export function weatherLighting(base: Lighting, outside: Outside): Lighting {
	const mix = (a: string, b: string, t: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
	switch (outside) {
		case 'cloudy':
			return { ...base, sky: mix(base.sky, '#a9b2bf', 0.35), sunIntensity: base.sunIntensity * 0.75, shadow: base.shadow * 0.7 };
		case 'rain':
			return {
				...base,
				sky: mix(base.sky, '#7f8a9a', 0.5),
				ground: mix(base.ground, '#5f7466', 0.4),
				sunIntensity: base.sunIntensity * 0.6,
				shadow: base.shadow * 0.55,
				windowStrength: base.windowStrength * 0.6,
				windowGlass: mix(base.windowGlass, '#8fa3b8', 0.4),
			};
		case 'snow':
			return {
				...base,
				sky: mix(base.sky, '#dfe6ee', 0.45),
				ground: mix(base.ground, '#eef2f6', 0.85),
				sunIntensity: base.sunIntensity * 0.8,
				windowGlass: mix(base.windowGlass, '#e8f0f8', 0.4),
			};
		default:
			return base;
	}
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const p = new THREE.Vector3();
const s = new THREE.Vector3();
const noRaycast = () => null;
const TOP = 3.4;
const GROUND = -0.3;

export function Weather({
	world,
	outside,
	quality,
}: {
	world: CompiledWorld;
	outside: Outside;
	quality: 'high' | 'low';
}) {
	const ref = useRef<THREE.InstancedMesh>(null);
	const rain = outside === 'rain';
	const count = outside === 'rain' || outside === 'snow' ? (quality === 'high' ? 700 : 260) : 0;
	const drops = useMemo(() => {
		const rng = mulberry32(world.seed ^ 0x5eed);
		const { width: W, height: H } = world;
		return Array.from({ length: count }, () => {
			// A band 0.3 to 3.5 tiles outside the walls, all the way round.
			const out = 0.3 + rng() * 3.2;
			const along = rng();
			const side = rng() * (2 * (W + H));
			let x: number;
			let z: number;
			if (side < W) [x, z] = [side, -out];
			else if (side < 2 * W) [x, z] = [side - W, H + out];
			else if (side < 2 * W + H) [x, z] = [-out, side - 2 * W];
			else [x, z] = [W + out, side - 2 * W - H];
			return { x, z, phase: along, speed: 0.8 + rng() * 0.4, sway: rng() * Math.PI * 2 };
		});
	}, [world, count]);
	const material = useMemo(
		() =>
			new THREE.MeshBasicMaterial({
				color: rain ? '#cfe2ff' : '#ffffff',
				transparent: true,
				opacity: rain ? 0.45 : 0.9,
				depthWrite: false,
			}),
		[rain],
	);
	useEffect(() => () => material.dispose(), [material]);

	useFrame((state) => {
		const mesh = ref.current;
		if (!mesh) return;
		const t = state.clock.elapsedTime;
		q.copy(state.camera.quaternion);
		drops.forEach((d, i) => {
			const fall = rain ? 2.4 : 0.35;
			const life = (d.phase + (t * fall * d.speed) / (TOP - GROUND)) % 1;
			const y = TOP - life * (TOP - GROUND);
			if (rain) {
				p.set(d.x + life * 0.25, y, d.z);
				s.set(0.022, 0.32, 1);
			} else {
				p.set(d.x + Math.sin(t * 0.8 + d.sway) * 0.25, y, d.z + Math.cos(t * 0.6 + d.sway) * 0.15);
				s.setScalar(0.07);
			}
			m4.compose(p, q, s);
			mesh.setMatrixAt(i, m4);
		});
		mesh.instanceMatrix.needsUpdate = true;
	});

	if (!count) return null;
	return (
		<instancedMesh
			key={count}
			ref={ref}
			args={[new THREE.PlaneGeometry(1, 1), material, count]}
			frustumCulled={false}
			raycast={noRaycast}
			renderOrder={3}
		/>
	);
}
