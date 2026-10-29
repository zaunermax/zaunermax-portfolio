'use client';

import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ASSETS } from '../world/catalog';
import type { CompiledWorld } from '../world/types';
import { assetParts, mirrorParts, useKit, type KitPart } from './kit';
import { materials } from './materials';
import type { WallCut } from './office';
import { dropOffset, now, popScale, type Spawns } from './spawn';

/**
 * Every piece of furniture and every prop, instanced per asset id: one InstancedMesh per kit
 * mesh part, so a hundred desks cost a handful of draw calls. Matrices are only rewritten while
 * something pops in, or for wall props that hide when their wall is cut down.
 */

export type PropItem = {
	id: string;
	x: number;
	y: number;
	z: number;
	heading: number;
	wall?: { axis: 'h' | 'v'; x: number; y: number };
	/** Height of the item, so wall props hide when their wall is lower than their top. */
	top: number;
};

const noRaycast = () => null;

export function materialFor(kind: KitPart['material']) {
	const m = materials();
	return kind === 'glow' ? m.glow : kind === 'glass' ? m.glass : m.voxel;
}

/** Furniture and decor grouped by asset (and mirroring), in a stable order. */
export function propGroups(world: CompiledWorld) {
	const groups = new Map<string, { asset: string; mirror: boolean; items: PropItem[] }>();
	const add = (asset: string, mirror: boolean, item: PropItem) => {
		const key = `${asset}|${mirror ? 1 : 0}`;
		let group = groups.get(key);
		if (!group) groups.set(key, (group = { asset, mirror, items: [] }));
		group.items.push(item);
	};
	for (const f of world.furniture)
		add(f.asset, f.mirror, {
			id: f.id,
			// Tucked chairs slide forward along their facing (rot 0 faces south, +z).
			x: f.x + f.w / 2 + (f.tuck ?? 0) * Math.sin(f.rot * (Math.PI / 2)),
			y: f.elev,
			z: f.y + f.d / 2 + (f.tuck ?? 0) * Math.cos(f.rot * (Math.PI / 2)),
			heading: f.rot * (Math.PI / 2),
			top: ASSETS[f.asset].h,
		});
	for (const d of world.decor)
		add(d.asset, false, { id: d.id, x: d.x, y: d.y, z: d.z, heading: d.heading, wall: d.wall, top: ASSETS[d.asset].h * 0.85 });
	return [...groups.values()];
}

const m4 = new THREE.Matrix4();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const scl = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function AssetInstances({
	asset,
	mirror,
	items,
	spawns,
	cut,
}: {
	asset: string;
	mirror: boolean;
	items: PropItem[];
	spawns: Spawns;
	cut: WallCut;
}) {
	const kit = useKit();
	const base = assetParts(kit, asset);
	const parts = useMemo(() => (mirror ? mirrorParts(base.parts) : base.parts), [base, mirror]);
	const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
	const dirty = useRef(true);
	const onWall = items.some((i) => i.wall);
	/** Wall-hung props follow the cut-away, but only need rewriting when a wall height moved. */
	const seenCut = useRef(-1);

	// Buffers grow in steps, so assets gaining instances while a world streams in rarely remount.
	const capacity = Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(1, items.length))));
	useLayoutEffect(() => {
		dirty.current = true;
	}, [items, parts]);

	useFrame(() => {
		if (!dirty.current && (!onWall || seenCut.current === cut.version)) return;
		seenCut.current = cut.version;
		const t = now();
		let animating = false;
		items.forEach((item, i) => {
			const p = spawns.progress(item.id, t, 0.6);
			if (p < 1) animating = true;
			let s = popScale(p);
			if (item.wall && cut.height(item.wall.axis, item.wall.x, item.wall.y) < item.y + item.top) s = 0.0001;
			pos.set(item.x, item.y + dropOffset(p) * 0.5, item.z);
			quat.setFromAxisAngle(UP, item.heading);
			scl.setScalar(s);
			m4.compose(pos, quat, scl);
			for (const mesh of meshes.current) mesh?.setMatrixAt(i, m4);
		});
		for (const mesh of meshes.current)
			if (mesh) {
				mesh.count = items.length;
				mesh.instanceMatrix.needsUpdate = true;
			}
		dirty.current = animating;
	});

	return (
		<>
			{parts.map((part, k) => (
				<instancedMesh
					key={`${k}-${capacity}`}
					ref={(mesh) => {
						meshes.current[k] = mesh;
						dirty.current = true;
					}}
					args={[part.geometry, materialFor(part.material), capacity]}
					castShadow={part.material === 'voxel'}
					receiveShadow={part.material !== 'glow'}
					frustumCulled={false}
					raycast={noRaycast}
				/>
			))}
		</>
	);
}

export function Props({
	world,
	spawns,
	cut,
}: {
	world: CompiledWorld;
	spawns: Spawns;
	cut: WallCut;
}) {
	const groups = useMemo(() => propGroups(world), [world]);
	return (
		<>
			{groups.map((g) => (
				<AssetInstances
					key={`${g.asset}|${g.mirror}`}
					asset={g.asset}
					mirror={g.mirror}
					items={g.items}
					spawns={spawns}
					cut={cut}
				/>
			))}
		</>
	);
}
