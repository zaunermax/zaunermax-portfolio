'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GRID_H, GRID_W, mulberry32, type CompiledWorld } from '../world/compile';
import { Kit } from './kit';
import { materials } from './materials';
import { BIOMES, WEATHER_FOG, type Lighting } from './palette';

const CENTER = new THREE.Vector3(GRID_W / 2, 0, GRID_H / 2);

/** Sky, fog, sun and the painted backdrop. Everything that is not the valley itself. */
export function Atmosphere({
	world,
	lighting,
	shadows,
	reducedMotion,
}: {
	world: CompiledWorld;
	lighting: Lighting;
	shadows: boolean;
	reducedMotion: boolean;
}) {
	const pal = BIOMES[world.meta.biome];
	const weather = WEATHER_FOG[world.meta.weather];

	const colors = useMemo(() => {
		const tint = (hex: string) =>
			new THREE.Color(hex)
				.lerp(new THREE.Color(pal.airTint), pal.airTintAmount)
				.lerp(
					new THREE.Color(weather.tint).multiply(new THREE.Color(hex)),
					weather.amount * 0.6,
				);
		return {
			top: tint(lighting.skyTop),
			horizon: tint(lighting.skyHorizon),
			bottom: tint(lighting.skyBottom),
			fog: tint(lighting.fog).lerp(new THREE.Color(weather.tint), weather.amount * 0.5),
		};
	}, [lighting, pal, weather]);

	// Glass and halo materials follow the time of day.
	useEffect(() => {
		const m = materials();
		const night = lighting.glow;
		m.glass.color.set(night > 0.5 ? '#6a5a3a' : '#3a4c6e');
		m.glass.emissive.set('#ffbf5a').multiplyScalar(night * 1.1);
		m.halo.opacity = 0.15 + night * 0.7;
		m.pool.opacity = night * 0.55;
	}, [lighting]);

	const sunDir = useMemo(
		() => new THREE.Vector3(...lighting.sunDir).normalize(),
		[lighting],
	);
	const sunRef = useRef<THREE.DirectionalLight>(null);
	useEffect(() => {
		const sun = sunRef.current;
		if (!sun) return;
		sun.position.copy(CENTER).addScaledVector(sunDir, 60);
		sun.target.position.copy(CENTER);
		sun.target.updateMatrixWorld();
		const cam = sun.shadow.camera;
		cam.left = -30;
		cam.right = 30;
		cam.top = 30;
		cam.bottom = -30;
		cam.near = 10;
		cam.far = 130;
		cam.updateProjectionMatrix();
		sun.shadow.needsUpdate = true;
	}, [sunDir]);

	return (
		<>
			<fog
				attach="fog"
				args={[
					colors.fog,
					lighting.fogNear * weather.near,
					lighting.fogFar * weather.far,
				]}
			/>
			<color attach="background" args={[colors.fog]} />
			<hemisphereLight
				args={[lighting.hemiSky, lighting.hemiGround, lighting.hemiIntensity]}
			/>
			<directionalLight
				ref={sunRef}
				color={lighting.sunColor}
				intensity={lighting.sunIntensity * (1 - weather.amount * 0.35)}
				castShadow={shadows}
				shadow-mapSize={[2048, 2048]}
				shadow-bias={-0.0004}
				shadow-normalBias={0.03}
			/>
			<SkyDome
				top={colors.top}
				horizon={colors.horizon}
				bottom={colors.bottom}
				sunDir={sunDir}
				sunColor={lighting.sunColor}
				night={lighting.moon}
			/>
			{lighting.stars ? <Stars /> : null}
			<Clouds
				color={lighting.cloud}
				count={world.meta.weather === 'rain' ? 16 : 11}
				reducedMotion={reducedMotion}
			/>
			<Backdrop
				haze={lighting.haze}
				fog={colors.fog}
				rim={pal.rim}
				snow={pal.snow || world.meta.biome === 'highlands'}
			/>
		</>
	);
}

const skyVertex = /* glsl */ `
	varying vec3 vDir;
	void main() {
		vDir = normalize(position);
		vec4 p = modelViewMatrix * vec4(position, 1.0);
		gl_Position = projectionMatrix * p;
		gl_Position.z = gl_Position.w;
	}
`;

const skyFragment = /* glsl */ `
	uniform vec3 uTop;
	uniform vec3 uHorizon;
	uniform vec3 uBottom;
	uniform vec3 uSunDir;
	uniform vec3 uSun;
	uniform float uNight;
	varying vec3 vDir;
	void main() {
		float h = vDir.y;
		vec3 col = h > 0.0
			? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.75, h), 0.8))
			: mix(uHorizon, uBottom, smoothstep(0.0, -0.25, h));
		float sun = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
		col += uSun * (pow(sun, 18.0) * 0.35 + pow(sun, 600.0) * (uNight > 0.5 ? 0.9 : 1.6));
		gl_FragColor = vec4(col, 1.0);
	}
`;

function SkyDome({
	top,
	horizon,
	bottom,
	sunDir,
	sunColor,
	night,
}: {
	top: THREE.Color;
	horizon: THREE.Color;
	bottom: THREE.Color;
	sunDir: THREE.Vector3;
	sunColor: string;
	night: boolean;
}) {
	const material = useMemo(
		() =>
			new THREE.ShaderMaterial({
				vertexShader: skyVertex,
				fragmentShader: skyFragment,
				side: THREE.BackSide,
				depthWrite: false,
				fog: false,
				uniforms: {
					uTop: { value: new THREE.Color() },
					uHorizon: { value: new THREE.Color() },
					uBottom: { value: new THREE.Color() },
					uSunDir: { value: new THREE.Vector3() },
					uSun: { value: new THREE.Color() },
					uNight: { value: 0 },
				},
			}),
		[],
	);
	useEffect(() => () => material.dispose(), [material]);
	const ref = useRef<THREE.Mesh>(null);
	useEffect(() => {
		const m = ref.current?.material as THREE.ShaderMaterial | undefined;
		if (!m) return;
		const u = m.uniforms;
		(u.uTop.value as THREE.Color).copy(top);
		(u.uHorizon.value as THREE.Color).copy(horizon);
		(u.uBottom.value as THREE.Color).copy(bottom);
		(u.uSunDir.value as THREE.Vector3).copy(sunDir);
		(u.uSun.value as THREE.Color).set(night ? '#dfe8ff' : sunColor);
		u.uNight.value = night ? 1 : 0;
	}, [material, top, horizon, bottom, sunDir, sunColor, night]);
	useFrame(({ camera }) => ref.current?.position.copy(camera.position));
	return (
		<mesh ref={ref} material={material} renderOrder={-10} frustumCulled={false}>
			<sphereGeometry args={[400, 32, 16]} />
		</mesh>
	);
}

function Stars() {
	const geometry = useMemo(() => {
		const rnd = mulberry32(7);
		const pts: number[] = [];
		for (let i = 0; i < 700; i++) {
			const a = rnd() * Math.PI * 2;
			const y = 0.08 + rnd() * 0.92;
			const r = Math.sqrt(1 - y * y);
			pts.push(Math.cos(a) * r * 380, y * 380, Math.sin(a) * r * 380);
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
		return g;
	}, []);
	useEffect(() => () => geometry.dispose(), [geometry]);
	const ref = useRef<THREE.Points>(null);
	useFrame(({ camera }) => ref.current?.position.copy(camera.position));
	return (
		<points ref={ref} geometry={geometry} frustumCulled={false} renderOrder={-9}>
			<pointsMaterial
				color="#e8f0ff"
				size={1.6}
				sizeAttenuation={false}
				fog={false}
				transparent
				opacity={0.9}
				depthWrite={false}
			/>
		</points>
	);
}

function Clouds({
	color,
	count,
	reducedMotion,
}: {
	color: string;
	count: number;
	reducedMotion: boolean;
}) {
	const geometry = useMemo(() => {
		const k = new Kit(3);
		const rnd = mulberry32(21);
		for (let c = 0; c < count; c++) {
			const a = (c / count) * Math.PI * 2 + rnd() * 0.4;
			const dist = 95 + rnd() * 70;
			const cx = Math.cos(a) * dist;
			const cz = Math.sin(a) * dist;
			const cy = 32 + rnd() * 26;
			const puffs = 4 + Math.floor(rnd() * 4);
			for (let p = 0; p < puffs; p++) {
				const r = 5 + rnd() * 6;
				k.ball(
					r,
					1,
					p % 3 === 0 ? '#e6e8f6' : '#ffffff',
					{
						x: cx + (p - puffs / 2) * r * 0.9,
						y: cy + rnd() * 3,
						z: cz + (rnd() - 0.5) * 8,
						sy: 0.55,
					},
					{ smooth: true, shade: 0.35, jitter: 0 },
				);
			}
		}
		return k.build();
	}, [count]);
	useEffect(() => () => geometry.dispose(), [geometry]);
	const ref = useRef<THREE.Mesh>(null);
	useFrame((_, dt) => {
		if (ref.current && !reducedMotion) ref.current.rotation.y += dt * 0.004;
	});
	return (
		<mesh
			ref={ref}
			geometry={geometry}
			position={[GRID_W / 2, 0, GRID_H / 2]}
			renderOrder={-8}
		>
			<meshBasicMaterial
				vertexColors
				color={color}
				fog={false}
				transparent
				opacity={0.92}
				depthWrite={false}
			/>
		</mesh>
	);
}

/** Two rings of far mountains, pre-blended into the haze like a painted backdrop. */
function Backdrop({
	haze,
	fog,
	rim,
	snow,
}: {
	haze: string;
	fog: THREE.Color;
	rim: [string, string, string];
	snow: boolean;
}) {
	const geometry = useMemo(() => {
		const k = new Kit(8);
		const rnd = mulberry32(99);
		const rings: [number, number, number, number][] = [
			[78, 26, 0.45, 18],
			[125, 22, 0.7, 30],
		];
		for (const [dist, n, hazeAmount, height] of rings) {
			const base = new THREE.Color(rim[1])
				.lerp(new THREE.Color(haze), hazeAmount)
				.lerp(fog, hazeAmount * 0.5);
			const peak = new THREE.Color(snow ? '#f4f8fc' : rim[2])
				.lerp(new THREE.Color(haze), hazeAmount * 0.8)
				.lerp(fog, hazeAmount * 0.4);
			for (let i = 0; i < n; i++) {
				const a = (i / n) * Math.PI * 2 + rnd() * 0.2;
				const d = dist + rnd() * 18;
				const h = height * (0.6 + rnd() * 0.8);
				const r = 16 + rnd() * 14;
				k.cone(
					r,
					h,
					6,
					base,
					{ x: Math.cos(a) * d, y: -4, z: Math.sin(a) * d, ry: rnd() * 3 },
					{ shade: 0.35, jitter: 0.05 },
				);
				k.cone(
					r * 0.32,
					h * 0.32,
					6,
					peak,
					{ x: Math.cos(a) * d, y: -4 + h * 0.68, z: Math.sin(a) * d, ry: rnd() * 3 },
					{ shade: 0, jitter: 0.04 },
				);
			}
		}
		return k.build();
	}, [haze, fog, rim, snow]);
	useEffect(() => () => geometry.dispose(), [geometry]);
	return (
		<mesh geometry={geometry} position={[GRID_W / 2, 0, GRID_H / 2]} renderOrder={-7}>
			<meshBasicMaterial vertexColors fog={false} />
		</mesh>
	);
}
