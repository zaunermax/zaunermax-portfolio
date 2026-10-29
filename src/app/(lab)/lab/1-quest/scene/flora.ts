import * as THREE from 'three';
import type { Biome, RockSize, TreeSpecies } from '../world/compile';
import { cached, Kit } from './kit';
import { BIOMES, canopyColors } from './palette';

/** Tree, rock and tuft geometries for instancing. One merged, vertex-coloured mesh each. */

export function treeGeometry(species: TreeSpecies, biome: Biome) {
	return cached(`tree:${species}:${biome}`, () => {
		const pal = BIOMES[biome];
		const [dark, light] = canopyColors(biome, species);
		const trunk = pal.trunk;
		const snow = pal.snow;
		const k = new Kit(species.length * 7);
		switch (species) {
			case 'oak':
			case 'autumn': {
				k.cone(0.34, 0.35, 7, trunk, {}, { shade: 0.3 });
				k.cyl(0.15, 0.22, 1.35, 7, trunk, {}, { shade: 0.35 });
				k.cyl(0.06, 0.09, 0.6, 5, trunk, { x: 0.18, y: 1.0, rz: -0.8 });
				const blobs: [number, number, number, number, string][] = [
					[0, 1.75, 0, 0.92, dark],
					[0.55, 1.55, 0.2, 0.62, dark],
					[-0.5, 1.6, -0.15, 0.66, dark],
					[0.1, 1.55, -0.55, 0.6, dark],
					[0.15, 2.35, 0.1, 0.7, light],
					[-0.3, 2.15, 0.35, 0.55, light],
				];
				for (const [x, y, z, r, c] of blobs)
					k.ball(
						r,
						1,
						c,
						{ x, y, z, sy: 0.88 },
						{ smooth: true, shade: 0.35, jitter: 0.05 },
					);
				if (snow)
					k.ball(
						0.6,
						1,
						'#f4f8fc',
						{ x: 0.1, y: 2.6, z: 0.05, sy: 0.45 },
						{ smooth: true, shade: 0 },
					);
				break;
			}
			case 'pine': {
				k.cyl(0.1, 0.15, 0.7, 6, trunk, {}, { shade: 0.3 });
				const tiers: [number, number, number][] = [
					[1.0, 1.1, 0.45],
					[0.8, 1.0, 1.05],
					[0.6, 0.9, 1.6],
					[0.38, 0.8, 2.1],
				];
				tiers.forEach(([r, h, y], i) => {
					k.cone(r, h, 8, i % 2 ? light : dark, { y }, { shade: 0.45, jitter: 0.06 });
					if (snow)
						k.cone(
							r * 0.62,
							h * 0.42,
							8,
							'#f4f8fc',
							{ y: y + h * 0.58 },
							{ shade: 0.05 },
						);
				});
				break;
			}
			case 'birch': {
				k.cyl(0.08, 0.11, 2.0, 6, '#f2efe6', {}, { shade: 0.15 });
				for (let i = 0; i < 6; i++)
					k.box(
						0.07,
						0.035,
						0.03,
						'#2a2a2a',
						{
							x: Math.sin(i * 2.1) * 0.07,
							y: 0.3 + i * 0.27,
							z: Math.cos(i * 2.1) * 0.07,
							ry: i * 2.1,
						},
						{ shade: 0 },
					);
				const blobs: [number, number, number, number, string][] = [
					[0, 2.0, 0, 0.5, dark],
					[0.25, 2.4, 0.1, 0.42, light],
					[-0.22, 2.3, -0.1, 0.42, dark],
					[0.0, 2.75, 0, 0.36, light],
				];
				for (const [x, y, z, r, c] of blobs)
					k.ball(r, 1, c, { x, y, z, sy: 1.1 }, { smooth: true, shade: 0.3 });
				if (snow)
					k.ball(0.3, 1, '#f4f8fc', { y: 2.95, sy: 0.5 }, { smooth: true, shade: 0 });
				break;
			}
			case 'palm': {
				let x = 0;
				let y = 0;
				for (let i = 0; i < 7; i++) {
					const r = 0.13 - i * 0.008;
					k.cyl(
						r * 0.9,
						r,
						0.38,
						6,
						i % 2 ? '#a07a4a' : '#8a6a3a',
						{ x, y, rz: -0.08 - i * 0.03 },
						{ shade: 0.2 },
					);
					x += 0.04 + i * 0.012;
					y += 0.37;
				}
				for (let i = 0; i < 7; i++) {
					const a = (i / 7) * Math.PI * 2;
					const leaf = new Kit(90 + i);
					leaf.box(
						0.24,
						0.03,
						1.1,
						i % 2 ? dark : light,
						{ z: 0.55 },
						{ shade: 0, jitter: 0.08 },
					);
					leaf.box(
						0.16,
						0.03,
						0.5,
						i % 2 ? light : dark,
						{ y: -0.12, z: 1.2, rx: 0.5 },
						{ shade: 0, jitter: 0.08 },
					);
					const g = leaf.build();
					g.rotateX(0.45);
					g.rotateY(a);
					g.translate(x, y, 0);
					k.merge(g);
				}
				for (let i = 0; i < 3; i++)
					k.ball(0.08, 0, '#6a4a2a', {
						x: x + Math.cos(i * 2) * 0.1,
						y: y - 0.1,
						z: Math.sin(i * 2) * 0.1,
					});
				break;
			}
			case 'dead': {
				k.cyl(0.1, 0.2, 1.8, 6, dark, {}, { shade: 0.4 });
				const branches: [number, number, number, number][] = [
					[1.1, 0.8, 0.4, 0.7],
					[1.4, -0.9, 2.2, 0.6],
					[1.7, 0.6, 4.0, 0.5],
					[0.8, -0.7, 5.2, 0.5],
				];
				for (const [y, rz, ry, len] of branches) {
					const g = new Kit(3);
					g.cyl(0.03, 0.06, len, 5, dark, { rz });
					const bg = g.build();
					bg.rotateY(ry);
					bg.translate(0, y, 0);
					k.merge(bg);
				}
				if (snow) k.ball(0.12, 0, '#f4f8fc', { y: 1.82, sy: 0.5 });
				break;
			}
			case 'mushroom': {
				k.cyl(0.16, 0.24, 1.3, 8, '#f2ead8', {}, { shade: 0.25 });
				k.cyl(0.26, 0.24, 0.05, 8, '#e0d4c0', { y: 0.95 });
				const cap = new THREE.SphereGeometry(0.85, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
				k.add(cap, dark, { y: 1.15, sy: 0.6 }, { smooth: true, shade: 0.35 });
				k.cyl(0.85, 0.6, 0.12, 12, light, { y: 1.05 }, { shade: 0.1 });
				for (let i = 0; i < 7; i++) {
					const a = i * 2.4;
					const r = i === 0 ? 0 : 0.42 + (i % 2) * 0.15;
					k.sphere(
						0.1,
						6,
						4,
						light,
						{
							x: Math.cos(a) * r,
							y: 1.15 + 0.5 * Math.cos((r / 0.85) * (Math.PI / 2)) * 0.98,
							z: Math.sin(a) * r,
							sy: 0.5,
						},
						{ smooth: true, shade: 0 },
					);
				}
				break;
			}
		}
		return k.build();
	});
}

function jagged(geo: THREE.BufferGeometry, seed: number, amount: number) {
	const pos = geo.getAttribute('position');
	const map = new Map<string, [number, number, number]>();
	let a = seed;
	const rnd = () => {
		a = (a * 16807) % 2147483647;
		return a / 2147483647 - 0.5;
	};
	for (let i = 0; i < pos.count; i++) {
		const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
		let off = map.get(key);
		if (!off) {
			off = [rnd() * amount, rnd() * amount, rnd() * amount];
			map.set(key, off);
		}
		pos.setXYZ(i, pos.getX(i) + off[0], pos.getY(i) + off[1], pos.getZ(i) + off[2]);
	}
	return geo;
}

export function rockGeometry(size: RockSize, biome: Biome) {
	return cached(`rock:${size}:${biome}`, () => {
		const pal = BIOMES[biome];
		const [dark, light] = pal.rock;
		const k = new Kit(size.length * 5);
		if (size === 'pebbles') {
			k.add(
				jagged(new THREE.IcosahedronGeometry(0.4, 0), 7, 0.12),
				light,
				{ y: 0.1, sy: 0.55 },
				{ shade: 0.3, jitter: 0.1 },
			);
		} else if (size === 'boulders') {
			k.add(
				jagged(new THREE.IcosahedronGeometry(0.55, 1), 11, 0.16),
				light,
				{ y: 0.28, sy: 0.75 },
				{ shade: 0.45, jitter: 0.08 },
			);
			k.add(
				jagged(new THREE.IcosahedronGeometry(0.28, 0), 13, 0.08),
				dark,
				{ x: 0.45, y: 0.1, z: 0.2, sy: 0.7 },
				{ shade: 0.3 },
			);
			if (pal.snow)
				k.add(
					jagged(new THREE.IcosahedronGeometry(0.4, 1), 17, 0.08),
					'#f4f8fc',
					{ y: 0.58, sy: 0.3 },
					{ shade: 0 },
				);
			else if (biome === 'meadow' || biome === 'highlands' || biome === 'swamp')
				k.add(
					jagged(new THREE.IcosahedronGeometry(0.36, 1), 19, 0.06),
					'#5f9a3a',
					{ y: 0.6, sy: 0.22 },
					{ shade: 0, jitter: 0.1 },
				);
		} else {
			const cols: [number, number, number, number][] = [
				[0, 0, 0.5, 2.2],
				[0.45, 0.25, 0.4, 1.6],
				[-0.4, 0.3, 0.38, 1.4],
				[0.1, -0.45, 0.36, 1.2],
			];
			cols.forEach(([x, z, r, h], i) => {
				k.add(
					jagged(
						new THREE.CylinderGeometry(r * 0.6, r, h, 5, 2).translate(0, h / 2, 0),
						23 + i,
						0.12,
					),
					i % 2 ? dark : light,
					{ x, z },
					{ shade: 0.5, jitter: 0.1 },
				);
				if (pal.snow)
					k.cone(r * 0.62, 0.2, 5, '#f4f8fc', { x, y: h - 0.02, z }, { shade: 0 });
			});
		}
		return k.build();
	});
}

export function tuftGeometry() {
	return cached('tuft', () => {
		const k = new Kit(3);
		const blades: [number, number, number, number][] = [
			[0, 0, 0.32, 0],
			[0.07, 0.04, 0.24, 0.35],
			[-0.06, 0.05, 0.27, -0.3],
			[0.02, -0.07, 0.22, 0.2],
		];
		for (const [x, z, h, r] of blades)
			k.cone(
				0.035,
				h,
				3,
				'#ffffff',
				{ x, z, rz: r, rx: r * 0.6 },
				{ shade: 0.55, jitter: 0.08 },
			);
		return k.build();
	});
}

export function blossomGeometry() {
	return cached('blossom', () => {
		const k = new Kit(4);
		k.ball(0.055, 0, '#ffffff', { y: 0.2 }, { shade: 0.1, jitter: 0 });
		k.ball(0.045, 0, '#ffffff', { x: 0.09, y: 0.15, z: 0.04 }, { shade: 0.1, jitter: 0 });
		return k.build();
	});
}
