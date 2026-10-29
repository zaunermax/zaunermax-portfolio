import * as THREE from 'three';
import type { LandmarkId } from '../world/schema';
import type { BuildingKind, PropKind, RoofColor } from '../world/compile';
import { cached, Kit } from './kit';
import { MAX_PINK, ROOF_COLORS } from './palette';

/**
 * Procedural prefabs. Local frame: origin on the ground at the centre of the footprint,
 * the front (door) faces +z, one world unit per grid cell. Each prefab bakes into up to three
 * geometries: `body` (vertex-coloured, lit), `glass` (windows: dark by day, warm at night)
 * and `glow` (fire, runes, crystals: always bright).
 */

export type PrefabGeometry = {
	body: THREE.BufferGeometry;
	glass?: THREE.BufferGeometry;
	glow?: THREE.BufferGeometry;
};

const C = {
	stone: '#a39d90',
	stoneDark: '#7f796e',
	sandstone: '#cdb48a',
	plaster: '#f0e3c4',
	beam: '#5c3b22',
	wood: '#946038',
	woodLight: '#b07a48',
	woodDark: '#5a3a22',
	iron: '#3a3a42',
	ironLight: '#5a5a66',
	cloth: '#efe4cc',
	hay: '#e0b84a',
	glassDay: '#ffffff',
	fire: '#ffb02e',
	fireHot: '#fff2a0',
	fireRed: '#ff6a1f',
	rune: '#7ff0ff',
	moss: '#5f9a3a',
	gold: '#e8b730',
	book: ['#8f2d2d', '#2d4f8f', '#2f7a4a', '#b07a2a', '#6a3a8a'],
};

type Builders = { k: Kit; glass: Kit; glow: Kit; snow: boolean };

function finish({ k, glass, glow }: Builders): PrefabGeometry {
	return {
		body: k.build(),
		glass: glass.empty ? undefined : glass.build(),
		glow: glow.empty ? undefined : glow.build(),
	};
}

function kits(seed: number, snow: boolean): Builders {
	return { k: new Kit(seed), glass: new Kit(seed + 1), glow: new Kit(seed + 2), snow };
}

// ---------------------------------------------------------------------------
// Shared pieces

function roof(
	b: Builders,
	w: number,
	d: number,
	h: number,
	color: string,
	xf: { x?: number; y: number; z?: number; ry?: number },
	overhang = 0.22,
) {
	b.k.gableRoof(w, d, h, color, xf, { overhang, thickness: 0.14 });
	// Ridge cap.
	b.k.box(
		w + overhang * 2 + 0.04,
		0.1,
		0.16,
		new THREE.Color(color).multiplyScalar(0.7),
		{
			x: xf.x,
			y: xf.y + h + 0.02,
			z: xf.z,
			ry: xf.ry,
		},
	);
	if (b.snow)
		b.k.gableRoof(
			w - 0.1,
			d,
			h,
			'#f4f8fc',
			{ ...xf, y: xf.y + 0.12 },
			{ overhang, thickness: 0.07 },
		);
}

function windowAt(
	b: Builders,
	x: number,
	y: number,
	z: number,
	ry = 0,
	w = 0.36,
	h = 0.42,
	frame = C.beam,
) {
	const cos = Math.cos(ry);
	const sin = Math.sin(ry);
	const off = (dz: number) => ({ x: x + sin * dz, z: z + cos * dz });
	b.glass.box(w, h, 0.04, C.glassDay, { ...off(0.02), y, ry }, { shade: 0, jitter: 0 });
	b.k.box(w + 0.1, 0.07, 0.08, frame, { ...off(0.03), y: y - 0.05, ry });
	b.k.box(w + 0.1, 0.07, 0.08, frame, { ...off(0.03), y: y + h, ry });
	b.k.box(0.05, h, 0.07, frame, { ...off(0.04), y, ry });
	for (const s of [-1, 1]) {
		const sx = (s * (w + 0.05)) / 2;
		b.k.box(0.06, h, 0.08, frame, {
			x: x + cos * sx + sin * 0.03,
			y,
			z: z - sin * sx + cos * 0.03,
			ry,
		});
	}
}

function door(
	b: Builders,
	x: number,
	z: number,
	w = 0.5,
	h = 0.85,
	color = C.woodDark,
	ry = 0,
	y = 0,
) {
	const cos = Math.cos(ry);
	const sin = Math.sin(ry);
	b.k.box(
		w,
		h,
		0.07,
		color,
		{ x: x + sin * 0.02, y, z: z + cos * 0.02, ry },
		{ shade: 0.35 },
	);
	b.k.box(w + 0.12, 0.08, 0.1, C.beam, {
		x: x + sin * 0.03,
		y: y + h,
		z: z + cos * 0.03,
		ry,
	});
	b.k.ball(0.035, 0, C.gold, {
		x: x + cos * w * 0.3 + sin * 0.07,
		y: y + h * 0.5,
		z: z - sin * w * 0.3 + cos * 0.07,
	});
}

function chimney(b: Builders, x: number, y: number, z: number, h = 1.1) {
	b.k.box(0.34, h, 0.34, C.stoneDark, { x, y, z }, { shade: 0.3, jitter: 0.1 });
	b.k.box(0.42, 0.1, 0.42, C.stone, { x, y: y + h, z });
}

/** Timber-framed wall box: plaster with dark beams on the corners and a mid rail. */
function timberBox(
	b: Builders,
	w: number,
	h: number,
	d: number,
	y: number,
	plaster = C.plaster,
	braces = true,
) {
	b.k.box(w, h, d, plaster, { y }, { shade: 0.18, jitter: 0.03 });
	for (const sx of [-1, 1])
		for (const sz of [-1, 1])
			b.k.box(0.12, h, 0.12, C.beam, {
				x: (sx * (w - 0.06)) / 2,
				y,
				z: (sz * (d - 0.06)) / 2,
			});
	b.k.box(w + 0.04, 0.09, d + 0.04, C.beam, { y: y + h * 0.55 });
	b.k.box(w + 0.06, 0.1, d + 0.06, C.beam, { y: y + h - 0.05 });
	if (braces)
		for (const s of [-1, 1]) {
			b.k.box(0.07, h * 0.62, 0.05, C.beam, {
				x: s * (w / 2 - 0.32),
				y: y + h * 0.04,
				z: d / 2 + 0.01,
				rz: s * 0.6,
			});
		}
}

function stoneBase(b: Builders, w: number, h: number, d: number, color = C.stone) {
	b.k.box(w, h, d, color, {}, { shade: 0.35, jitter: 0.12 });
	b.k.box(w + 0.06, 0.06, d + 0.06, new THREE.Color(color).multiplyScalar(0.85), {
		y: h - 0.03,
	});
}

function lantern(b: Builders, x: number, y: number, z: number, scale = 1) {
	b.k.box(0.2 * scale, 0.05 * scale, 0.2 * scale, C.iron, { x, y, z });
	b.glow.box(
		0.14 * scale,
		0.2 * scale,
		0.14 * scale,
		C.fire,
		{ x, y: y + 0.05 * scale, z },
		{ shade: 0, jitter: 0 },
	);
	b.k.cone(0.15 * scale, 0.12 * scale, 4, C.iron, {
		x,
		y: y + 0.25 * scale,
		z,
		ry: Math.PI / 4,
	});
}

function flowerBox(b: Builders, x: number, y: number, z: number, w = 0.42) {
	b.k.box(w, 0.1, 0.12, C.wood, { x, y, z });
	const colors = ['#e9708f', '#f2e14a', '#ffffff', '#e9708f'];
	for (let i = 0; i < 4; i++)
		b.k.ball(
			0.06,
			0,
			colors[i],
			{ x: x - w / 2 + 0.07 + (i * (w - 0.14)) / 3, y: y + 0.14, z },
			{ shade: 0 },
		);
}

// ---------------------------------------------------------------------------
// Buildings

function cottage(b: Builders, roofColor: string) {
	stoneBase(b, 2.25, 0.35, 1.95);
	timberBox(b, 2.15, 1.25, 1.85, 0.35);
	b.k.prism(2.15, 1.25, 1.85, C.plaster, { y: 1.6 }, { shade: 0.1 });
	roof(b, 2.15, 1.85, 1.3, roofColor, { y: 1.58 });
	chimney(b, 0.62, 1.9, -0.45, 1.25);
	door(b, 0, 0.94, 0.5, 0.85, C.woodDark, 0, 0.35);
	windowAt(b, -0.62, 0.85, 0.93);
	windowAt(b, 0.62, 0.85, 0.93);
	windowAt(b, 1.08, 0.85, 0, Math.PI / 2);
	windowAt(b, -1.08, 0.85, 0, -Math.PI / 2);
	windowAt(b, 0, 2.0, 0.93, 0, 0.3, 0.32);
	flowerBox(b, -0.62, 0.68, 1.0);
	flowerBox(b, 0.62, 0.68, 1.0);
	b.k.box(0.7, 0.12, 0.35, C.stone, { y: 0, z: 1.12 });
}

function farmhouse(b: Builders, roofColor: string) {
	stoneBase(b, 2.6, 1.0, 2.0, C.stone);
	timberBox(b, 2.75, 0.95, 2.15, 1.0);
	b.k.prism(2.75, 1.3, 2.15, C.plaster, { y: 1.95 }, { shade: 0.1 });
	roof(b, 2.75, 2.15, 1.35, roofColor, { y: 1.93 }, 0.25);
	chimney(b, -0.8, 2.2, -0.4, 1.3);
	door(b, 0.45, 1.01, 0.5, 0.8);
	windowAt(b, -0.6, 0.35, 1.01, 0, 0.36, 0.38, C.woodDark);
	windowAt(b, -0.8, 1.3, 1.09);
	windowAt(b, 0.1, 1.3, 1.09);
	windowAt(b, 0.85, 1.3, 1.09);
	windowAt(b, 0, 2.35, 1.09, 0, 0.3, 0.32);
	// Porch roof on posts.
	for (const s of [-1, 1])
		b.k.box(0.1, 0.95, 0.1, C.beam, { x: 0.45 + s * 0.42, z: 1.45 });
	b.k.box(1.1, 0.08, 0.6, roofColor, { x: 0.45, y: 0.95, z: 1.3, rx: 0.25 });
	b.k.box(0.9, 0.1, 0.5, C.wood, { x: 0.45, y: 0, z: 1.3 });
}

function windmill(b: Builders, roofColor: string) {
	b.k.cyl(1.0, 1.15, 0.5, 8, C.stone, {}, { shade: 0.4, jitter: 0.12 });
	b.k.cyl(0.72, 1.0, 2.9, 8, C.plaster, { y: 0.5 }, { shade: 0.2, jitter: 0.04 });
	for (const y of [1.3, 2.3])
		b.k.cyl(0.95 - (y - 0.5) * 0.09, 0.97 - (y - 0.5) * 0.09, 0.08, 8, C.beam, { y });
	b.k.cyl(0.82, 0.78, 0.12, 8, C.beam, { y: 3.4 });
	b.k.cone(0.95, 1.2, 8, roofColor, { y: 3.5 }, { shade: 0.1 });
	b.k.ball(0.09, 0, C.gold, { y: 4.75 });
	door(b, 0, 1.0, 0.5, 0.85, C.woodDark, 0, 0.45);
	windowAt(b, 0, 2.2, 0.85, 0, 0.28, 0.34);
	windowAt(b, 0.62, 1.7, 0.55, 0.85, 0.26, 0.3);
	// Hub housing for the blades.
	b.k.box(0.5, 0.5, 0.5, C.woodDark, { y: 2.95, z: 0.7 });
	if (b.snow) b.k.cone(0.75, 0.55, 8, '#f4f8fc', { y: 4.15 });
}

export function windmillBlades() {
	return cached('windmill-blades', () => {
		const k = new Kit(9);
		k.cyl(0.12, 0.12, 0.3, 8, C.iron, { rx: Math.PI / 2, z: -0.15 });
		for (let i = 0; i < 4; i++) {
			const a = (i * Math.PI) / 2;
			const arm = new Kit(10 + i);
			arm.box(0.1, 2.0, 0.06, C.woodDark, { y: 0.1 });
			arm.box(0.5, 1.5, 0.03, C.cloth, { x: 0.3, y: 0.55 }, { shade: 0.1, jitter: 0.05 });
			for (let j = 0; j < 5; j++)
				arm.box(0.52, 0.04, 0.05, C.wood, { x: 0.3, y: 0.55 + j * 0.37 });
			const g = arm.build();
			g.rotateZ(a);
			k.merge(g);
		}
		return k.build();
	});
}

function watchtower(b: Builders, roofColor: string) {
	stoneBase(b, 1.9, 0.9, 1.9);
	for (const sx of [-1, 1])
		for (const sz of [-1, 1])
			b.k.box(0.18, 2.6, 0.18, C.beam, { x: sx * 0.72, y: 0.9, z: sz * 0.72 });
	for (const y of [1.5, 2.6])
		for (const r of [0, Math.PI / 2])
			for (const s of [-1, 1])
				b.k.box(1.5, 0.1, 0.1, C.wood, {
					y,
					x: r ? s * 0.72 : 0,
					z: r ? 0 : s * 0.72,
					ry: r,
				});
	b.k.box(1.6, 1.1, 0.06, C.wood, { y: 1.55, z: 0.74 }, { shade: 0.2 });
	b.k.box(2.3, 0.16, 2.3, C.woodDark, { y: 3.5 });
	for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
		const cx = Math.sin(r) * 1.1;
		const cz = Math.cos(r) * 1.1;
		b.k.box(2.3, 0.45, 0.12, C.wood, { x: cx, y: 3.66, z: cz, ry: r });
	}
	for (const sx of [-1, 1])
		for (const sz of [-1, 1])
			b.k.box(0.12, 0.9, 0.12, C.beam, { x: sx * 1.05, y: 3.66, z: sz * 1.05 });
	b.k.cone(1.75, 1.4, 4, roofColor, { y: 4.5, ry: Math.PI / 4 }, { shade: 0.12 });
	if (b.snow) b.k.cone(1.2, 1.0, 4, '#f4f8fc', { y: 4.95, ry: Math.PI / 4 });
	b.k.box(0.05, 0.9, 0.05, C.iron, { y: 5.85 });
	b.k.box(0.5, 0.3, 0.03, roofColor, { x: 0.27, y: 6.4 }, { shade: 0 });
	door(b, 0, 0.96, 0.5, 0.8);
	lantern(b, 0.95, 3.7, 1.15, 0.9);
}

function barn(b: Builders, roofColor: string) {
	const red = '#a8402c';
	b.k.box(2.6, 1.55, 2.3, red, {}, { shade: 0.3, jitter: 0.06 });
	for (let i = -5; i <= 5; i++)
		b.k.box(0.03, 1.5, 0.02, '#8a3020', { x: i * 0.24, z: 1.16 });
	for (const sx of [-1, 1])
		for (const sz of [-1, 1])
			b.k.box(0.12, 1.55, 0.12, '#f2ece0', { x: sx * 1.27, z: sz * 1.12 });
	b.k.prism(2.6, 1.4, 2.3, red, { y: 1.55 }, { shade: 0.1 });
	roof(
		b,
		2.6,
		2.3,
		1.45,
		roofColor === ROOF_COLORS.red ? '#6a5a50' : roofColor,
		{ y: 1.53 },
		0.24,
	);
	// Big doors with white X braces.
	b.k.box(1.3, 1.2, 0.06, '#8a3020', { z: 1.16 });
	b.k.box(1.4, 0.1, 0.1, '#f2ece0', { y: 1.2, z: 1.18 });
	for (const s of [-1, 1]) {
		b.k.box(0.1, 1.2, 0.08, '#f2ece0', { x: s * 0.65, z: 1.18 });
		b.k.box(0.08, 1.35, 0.06, '#f2ece0', { x: s * 0.32, y: 0.0, z: 1.2, rz: s * 0.55 });
	}
	b.k.box(0.5, 0.45, 0.06, C.woodDark, { y: 1.85, z: 1.16 });
	b.k.box(0.6, 0.06, 0.12, '#f2ece0', { y: 2.3, z: 1.18 });
	// Cupola.
	b.k.box(0.45, 0.4, 0.45, '#f2ece0', { y: 2.95 });
	b.k.cone(0.42, 0.4, 4, roofColor, { y: 3.35, ry: Math.PI / 4 });
	b.k.box(0.02, 0.3, 0.02, C.iron, { y: 3.75 });
	b.k.box(0.22, 0.05, 0.05, C.iron, { y: 3.92 });
}

function tent(b: Builders, roofColor: string) {
	b.k.prism(1.6, 1.35, 1.8, C.cloth, { ry: Math.PI / 2 }, { shade: 0.25, jitter: 0.03 });
	for (const s of [-0.5, 0, 0.5])
		b.k.prism(
			0.22,
			1.36,
			1.82,
			roofColor,
			{ x: s, ry: Math.PI / 2 },
			{ shade: 0.2, jitter: 0 },
		);
	b.k.prism(0.04, 0.85, 0.7, '#3a2a20', { z: 0.81, ry: Math.PI / 2 }, { shade: 0 });
	b.k.box(0.05, 1.7, 0.05, C.woodDark, { z: 0.85 });
	b.k.box(0.05, 1.7, 0.05, C.woodDark, { z: -0.85 });
	b.k.box(0.32, 0.2, 0.02, roofColor, { x: 0.17, y: 1.5, z: 0.85 }, { shade: 0 });
	for (const s of [-1, 1])
		b.k.box(0.02, 0.02, 0.9, '#d8c8a8', { x: s * 0.95, y: 0.35, z: 0, rz: s * 0.9 });
}

function ruin(b: Builders) {
	const st = C.stone;
	b.k.box(2.4, 1.6, 0.35, st, { z: -0.9 }, { shade: 0.4, jitter: 0.15 });
	b.k.box(
		0.9,
		0.9,
		0.35,
		st,
		{ x: -0.75, y: 1.6, z: -0.9 },
		{ shade: 0.3, jitter: 0.15 },
	);
	b.k.box(0.35, 1.2, 1.8, st, { x: -1.05, z: 0.0 }, { shade: 0.4, jitter: 0.15 });
	b.k.box(
		0.35,
		0.5,
		0.8,
		st,
		{ x: -1.05, y: 1.2, z: -0.4 },
		{ shade: 0.3, jitter: 0.15 },
	);
	b.k.box(0.35, 0.7, 0.9, st, { x: 1.05, z: -0.35 }, { shade: 0.4, jitter: 0.15 });
	// Arch fragment.
	b.k.box(0.3, 1.9, 0.3, C.stoneDark, { x: 0.5, z: 0.7 }, { shade: 0.4 });
	b.k.box(0.8, 0.28, 0.3, C.stoneDark, { x: 0.25, y: 1.9, z: 0.7, rz: 0.2 });
	// Fallen column and rubble.
	b.k.cyl(0.2, 0.2, 1.2, 7, C.stone, {
		x: 0.3,
		y: 0.2,
		z: 0.1,
		rz: Math.PI / 2,
		ry: 0.4,
	});
	for (let i = 0; i < 7; i++)
		b.k.ball(0.12 + (i % 3) * 0.05, 0, C.stoneDark, {
			x: Math.sin(i * 2.3) * 0.9,
			y: 0.08,
			z: Math.cos(i * 1.7) * 0.8,
		});
	b.k.box(2.42, 0.08, 0.37, C.moss, { y: 1.6, z: -0.9 }, { shade: 0 });
	b.k.box(0.37, 0.08, 1.82, C.moss, { x: -1.05, y: 1.2 }, { shade: 0 });
}

function well(b: Builders, roofColor: string) {
	b.k.cyl(0.52, 0.58, 0.6, 10, C.stone, {}, { shade: 0.4, jitter: 0.15 });
	b.k.cyl(0.56, 0.56, 0.08, 10, C.stoneDark, { y: 0.6 });
	b.k.cyl(0.42, 0.42, 0.02, 10, '#1f3f5f', { y: 0.5 });
	for (const s of [-1, 1]) b.k.box(0.1, 1.35, 0.1, C.beam, { x: s * 0.5, y: 0.5 });
	b.k.cyl(0.05, 0.05, 1.1, 6, C.wood, { y: 1.45, rz: Math.PI / 2, x: 0.55 });
	b.k.gableRoof(
		1.2,
		0.9,
		0.45,
		roofColor,
		{ y: 1.75 },
		{ overhang: 0.12, thickness: 0.08 },
	);
	b.k.box(0.02, 0.45, 0.02, '#c8b898', { y: 1.0 });
	b.k.cyl(0.1, 0.08, 0.16, 7, C.wood, { y: 0.85 });
}

function smithy(b: Builders, roofColor: string) {
	// Stone below, timber and plaster above, so even its back reads as a building.
	b.k.box(2.4, 0.9, 0.35, C.stone, { z: -0.85 }, { shade: 0.35, jitter: 0.12 });
	b.k.box(2.4, 0.75, 0.3, C.plaster, { y: 0.9, z: -0.85 }, { shade: 0.15, jitter: 0.03 });
	for (const x of [-1.15, -0.4, 0.4, 1.15])
		b.k.box(0.1, 0.75, 0.34, C.beam, { x, y: 0.9, z: -0.85 });
	b.k.box(2.44, 0.09, 0.36, C.beam, { y: 0.9, z: -0.85 });
	windowAt(b, 0.78, 1.0, -1.02, Math.PI, 0.34, 0.36);
	for (const s of [-1, 1]) {
		b.k.box(0.3, 0.9, 1.7, C.stone, { x: s * 1.05, z: 0 }, { shade: 0.35, jitter: 0.12 });
		b.k.box(0.14, 1.75, 0.14, C.beam, { x: s * 1.05, z: 0.85 });
	}
	b.k.box(2.4, 0.12, 0.14, C.beam, { y: 1.68, z: 0.85 });
	b.k.box(
		2.8,
		0.12,
		2.3,
		roofColor,
		{ y: 1.72, z: -0.05, rx: -0.2 },
		{ shade: 0.1, jitter: 0.06 },
	);
	b.k.box(2.84, 0.08, 0.16, new THREE.Color(roofColor).multiplyScalar(0.7), {
		y: 1.98,
		z: -1.15,
	});
	if (b.snow)
		b.k.box(2.7, 0.06, 2.1, '#f4f8fc', { y: 1.84, z: -0.05, rx: -0.2 }, { shade: 0 });
	// Woodpile against the side wall.
	for (let i = 0; i < 6; i++)
		b.k.cyl(0.09, 0.09, 0.7, 6, i % 2 ? C.woodLight : C.wood, {
			x: 1.38,
			y: 0.1 + Math.floor(i / 3) * 0.17,
			z: -0.45 + (i % 3) * 0.19 + (i >= 3 ? 0.09 : 0),
			rx: Math.PI / 2,
		});
	// Hanging sign with an anvil.
	b.k.box(0.05, 0.05, 0.5, C.iron, { x: 1.05, y: 1.5, z: 1.1 });
	b.k.box(0.05, 0.36, 0.42, C.woodLight, { x: 1.08, y: 1.1, z: 1.25 }, { shade: 0.15 });
	b.k.box(0.03, 0.08, 0.24, C.iron, { x: 1.11, y: 1.27, z: 1.25 });
	b.k.box(0.03, 0.08, 0.1, C.iron, { x: 1.11, y: 1.19, z: 1.25 });
	// Forge with glowing coals and a chimney.
	b.k.box(
		0.9,
		0.7,
		0.7,
		C.stoneDark,
		{ x: -0.5, z: -0.45 },
		{ shade: 0.3, jitter: 0.12 },
	);
	b.glow.box(
		0.6,
		0.06,
		0.45,
		C.fireRed,
		{ x: -0.5, y: 0.7, z: -0.45 },
		{ shade: 0, jitter: 0.2 },
	);
	b.glow.ball(0.12, 0, C.fire, { x: -0.55, y: 0.75, z: -0.4 });
	b.k.box(
		0.5,
		2.4,
		0.5,
		C.stoneDark,
		{ x: -0.5, y: 0.7, z: -0.75 },
		{ shade: 0.3, jitter: 0.12 },
	);
	b.k.box(0.62, 0.1, 0.62, C.stone, { x: -0.5, y: 3.1, z: -0.75 });
	// Anvil on a stump.
	b.k.cyl(0.2, 0.24, 0.4, 7, C.wood, { x: 0.45, z: 0.3 });
	b.k.box(0.45, 0.14, 0.2, C.iron, { x: 0.45, y: 0.4, z: 0.3 });
	b.k.cone(0.09, 0.22, 4, C.iron, { x: 0.78, y: 0.47, z: 0.3, rz: -Math.PI / 2 });
	b.k.box(0.25, 0.12, 0.15, C.ironLight, { x: 0.45, y: 0.28, z: 0.3 });
	// Weapon rack.
	b.k.box(0.8, 0.08, 0.08, C.wood, { x: 0.55, y: 1.0, z: -0.62 });
	for (let i = 0; i < 3; i++)
		b.k.box(0.05, 0.9, 0.05, C.ironLight, {
			x: 0.3 + i * 0.25,
			y: 0.35,
			z: -0.58,
			rz: 0.1,
		});
}

function tavern(b: Builders, roofColor: string) {
	stoneBase(b, 2.8, 1.1, 2.3, C.stone);
	timberBox(b, 2.95, 1.05, 2.45, 1.1);
	b.k.prism(2.95, 1.45, 2.45, C.plaster, { y: 2.15 }, { shade: 0.1 });
	roof(b, 2.95, 2.45, 1.5, roofColor, { y: 2.13 }, 0.26);
	chimney(b, -0.95, 2.4, -0.5, 1.5);
	chimney(b, 1.0, 2.4, 0.5, 1.3);
	door(b, 0, 1.16, 0.6, 0.95, C.woodDark);
	for (const x of [-0.95, 0.95]) windowAt(b, x, 0.4, 1.16, 0, 0.42, 0.42, C.woodDark);
	for (const x of [-1.0, -0.33, 0.33, 1.0]) windowAt(b, x, 1.4, 1.24, 0, 0.32, 0.4);
	windowAt(b, 0, 2.55, 1.24, 0, 0.3, 0.32);
	for (const z of [-0.5, 0.5]) windowAt(b, 1.49, 1.4, z, Math.PI / 2, 0.3, 0.4);
	// Hanging sign with a golden mug.
	b.k.box(0.06, 0.06, 0.6, C.iron, { x: 1.3, y: 1.95, z: 1.45 });
	b.k.box(0.05, 0.45, 0.42, C.wood, { x: 1.3, y: 1.45, z: 1.6 }, { shade: 0.15 });
	b.k.cyl(0.08, 0.08, 0.18, 8, C.gold, { x: 1.33, y: 1.58, z: 1.6 }, { shade: 0 });
	lantern(b, -0.5, 1.0, 1.25, 0.8);
	lantern(b, 0.5, 1.0, 1.25, 0.8);
}

function chapel(b: Builders, roofColor: string) {
	b.k.box(1.7, 1.7, 2.5, C.sandstone, { z: -0.25 }, { shade: 0.3, jitter: 0.08 });
	b.k.prism(
		1.7,
		1.6,
		2.5,
		C.sandstone,
		{ y: 1.7, z: -0.25, ry: Math.PI / 2 },
		{ shade: 0.1 },
	);
	roof(b, 2.5, 1.7, 1.6, roofColor, { y: 1.68, z: -0.25, ry: Math.PI / 2 }, 0.2);
	// Bell tower and spire at the front.
	b.k.box(0.9, 2.7, 0.9, C.sandstone, { z: 0.95 }, { shade: 0.3, jitter: 0.08 });
	b.k.box(1.0, 0.12, 1.0, C.stoneDark, { y: 2.7, z: 0.95 });
	for (const sx of [-1, 1])
		for (const sz of [-1, 1])
			b.k.box(0.14, 0.6, 0.14, C.sandstone, {
				x: sx * 0.38,
				y: 2.82,
				z: 0.95 + sz * 0.38,
			});
	b.k.cyl(0.14, 0.18, 0.2, 8, C.gold, { y: 2.95, z: 0.95 });
	b.k.cone(0.68, 1.6, 4, roofColor, { y: 3.42, z: 0.95, ry: Math.PI / 4 });
	b.k.box(0.05, 0.4, 0.05, C.gold, { y: 5.0, z: 0.95 });
	b.k.box(0.22, 0.05, 0.05, C.gold, { y: 5.25, z: 0.95 });
	door(b, 0, 1.41, 0.46, 0.9, C.woodDark);
	b.glass.cyl(
		0.2,
		0.2,
		0.04,
		10,
		C.glassDay,
		{ y: 1.8, z: 1.41, rx: Math.PI / 2 },
		{ shade: 0, jitter: 0 },
	);
	b.k.cyl(0.25, 0.25, 0.03, 10, C.stoneDark, { y: 1.8, z: 1.4, rx: Math.PI / 2 });
	for (const z of [-0.9, 0.0]) {
		windowAt(b, 0.86, 0.75, z, Math.PI / 2, 0.24, 0.6, C.stoneDark);
		windowAt(b, -0.86, 0.75, z, -Math.PI / 2, 0.24, 0.6, C.stoneDark);
	}
}

function dock(b: Builders, length: number) {
	const end = length + 0.45;
	b.k.box(
		0.95,
		0.1,
		end + 0.3,
		C.wood,
		{ y: -0.1, z: end / 2 - 0.15 },
		{ shade: 0.2, jitter: 0.1 },
	);
	for (let i = 0; i < Math.round((end + 0.3) / 0.22); i++)
		b.k.box(0.97, 0.02, 0.03, C.woodDark, { y: 0.0, z: -0.3 + i * 0.22 });
	for (let i = 0; i <= length; i++)
		for (const s of [-1, 1])
			b.k.cyl(0.07, 0.07, 1.4, 6, C.woodDark, { x: s * 0.45, y: -1.35, z: i + 0.4 });
	// Rowboat moored alongside.
	const boat = new Kit(77);
	boat.box(0.5, 0.18, 1.2, C.woodLight, { y: 0 }, { shade: 0.4 });
	boat.cone(0.25, 0.4, 4, C.woodLight, {
		y: 0.0,
		z: 0.75,
		rx: Math.PI / 2,
		ry: Math.PI / 4,
		sx: 1,
		sz: 0.4,
	});
	boat.box(0.44, 0.05, 0.12, C.wood, { y: 0.15, z: 0.1 });
	const g = boat.build();
	g.rotateY(0.15);
	g.translate(0.85, -0.38, Math.max(0.6, length - 0.4));
	b.k.merge(g);
	b.k.box(0.06, 1.2, 0.06, C.woodDark, { x: 0.42, y: -0.05, z: end - 0.15 });
	lantern(b, 0.42, 1.15, end - 0.15, 0.8);
}

export function buildingGeometry(
	kind: BuildingKind,
	roofColor: RoofColor,
	snow: boolean,
	length = 0,
) {
	return cached(`b:${kind}:${roofColor}:${snow}:${length}`, () => {
		const b = kits(kind.length * 31 + roofColor.length, snow);
		const rc = ROOF_COLORS[roofColor];
		switch (kind) {
			case 'cottage':
				cottage(b, rc);
				break;
			case 'farmhouse':
				farmhouse(b, rc);
				break;
			case 'windmill':
				windmill(b, rc);
				break;
			case 'watchtower':
				watchtower(b, rc);
				break;
			case 'barn':
				barn(b, rc);
				break;
			case 'tent':
				tent(b, rc);
				break;
			case 'ruin':
				ruin(b);
				break;
			case 'well':
				well(b, rc);
				break;
			case 'smithy':
				smithy(b, rc);
				break;
			case 'tavern':
				tavern(b, rc);
				break;
			case 'chapel':
				chapel(b, rc);
				break;
			case 'dock':
				dock(b, length);
				break;
		}
		return finish(b);
	});
}

// ---------------------------------------------------------------------------
// Landmarks

/** Camp-local spots shared with the scene: the fire and where Max stands. */
export const CAMP_FIRE: [number, number] = [-0.35, 0.45];
export const CAMP_MAX: [number, number] = [0.55, 0.8];

function maxCamp(b: Builders) {
	// Big striped tent in Max's colour.
	const tz = -0.55;
	b.k.prism(
		2.0,
		1.75,
		2.1,
		MAX_PINK,
		{ z: tz, ry: Math.PI / 2 },
		{ shade: 0.25, jitter: 0.03 },
	);
	for (const s of [-0.62, 0.62])
		b.k.prism(
			0.2,
			1.76,
			2.12,
			'#f6e6ea',
			{ x: s, z: tz, ry: Math.PI / 2 },
			{ shade: 0.2, jitter: 0 },
		);
	b.k.prism(0.04, 1.15, 0.95, '#3a1f2a', { z: tz + 1.0, ry: Math.PI / 2 }, { shade: 0 });
	for (const s of [-1, 1])
		b.k.prism(
			0.03,
			1.1,
			0.5,
			'#c45a7e',
			{ x: s * 0.42, z: tz + 1.12, ry: Math.PI / 2 + s * 0.5 },
			{ shade: 0.1 },
		);
	b.k.box(0.06, 2.3, 0.06, C.woodDark, { z: tz + 1.05 });
	b.k.box(0.5, 0.3, 0.03, MAX_PINK, { x: 0.27, y: 2.0, z: tz + 1.05 }, { shade: 0 });
	b.k.ball(0.06, 0, C.gold, { y: 2.33, z: tz + 1.05 });
	// Campfire, a little left of centre; Max stands to its right.
	const fx = CAMP_FIRE[0];
	const fz = CAMP_FIRE[1];
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * Math.PI * 2;
		b.k.ball(0.11, 0, C.stoneDark, {
			x: fx + Math.cos(a) * 0.38,
			y: 0.06,
			z: fz + Math.sin(a) * 0.38,
			sy: 0.75,
		});
	}
	for (const r of [0.5, -0.5, 1.6])
		b.k.cyl(0.06, 0.06, 0.6, 6, C.woodDark, {
			x: fx,
			y: 0.08,
			z: fz,
			rz: Math.PI / 2,
			ry: r,
		});
	b.glow.ball(0.16, 0, C.fireRed, { x: fx, y: 0.12, z: fz, sy: 0.6 });
	// A log bench on the far side of the fire.
	b.k.cyl(0.13, 0.13, 0.9, 7, C.wood, {
		x: fx - 0.75,
		y: 0.13,
		z: fz - 0.05,
		rx: Math.PI / 2,
	});
	// A crate desk with a glowing laptop: the camp of a software engineer.
	b.k.box(
		0.55,
		0.45,
		0.45,
		C.woodLight,
		{ x: 1.05, z: -0.05 },
		{ shade: 0.3, jitter: 0.1 },
	);
	b.k.box(0.36, 0.025, 0.24, '#3a3a46', { x: 1.05, y: 0.45, z: 0.0 });
	b.k.box(0.36, 0.24, 0.02, '#3a3a46', { x: 1.05, y: 0.46, z: -0.12, rx: -0.25 });
	b.glow.box(
		0.31,
		0.19,
		0.01,
		'#ffb3cc',
		{ x: 1.05, y: 0.485, z: -0.105, rx: -0.25 },
		{ shade: 0, jitter: 0 },
	);
	b.k.cyl(0.05, 0.045, 0.1, 8, '#f2ece0', { x: 0.88, y: 0.45, z: 0.12 });
	// Bedroll and a lantern on a pole.
	b.k.cyl(0.13, 0.13, 0.7, 8, '#5a6a9a', { x: -1.05, y: 0.13, z: -0.4, rz: Math.PI / 2 });
	b.k.box(0.05, 1.6, 0.05, C.woodDark, { x: -1.25, z: 0.45 });
	b.k.box(0.3, 0.04, 0.04, C.woodDark, { x: -1.12, y: 1.58, z: 0.45 });
	lantern(b, -1.0, 1.3, 0.45, 0.8);
}

function library(b: Builders) {
	const blue = '#2f4f9a';
	stoneBase(b, 2.6, 1.45, 2.1, C.sandstone);
	timberBox(b, 2.7, 1.0, 2.2, 1.45, '#f3e6c6');
	b.k.prism(2.7, 1.5, 2.2, '#f3e6c6', { y: 2.45 }, { shade: 0.1 });
	roof(b, 2.7, 2.2, 1.55, blue, { y: 2.43 }, 0.25);
	// Round reading tower.
	b.k.cyl(
		0.55,
		0.6,
		3.3,
		8,
		C.sandstone,
		{ x: -1.3, z: 0.65 },
		{ shade: 0.3, jitter: 0.08 },
	);
	b.k.cyl(0.66, 0.66, 0.12, 8, C.stoneDark, { x: -1.3, y: 3.3, z: 0.65 });
	b.k.cone(0.75, 1.5, 8, blue, { x: -1.3, y: 3.4, z: 0.65 }, { shade: 0.1 });
	b.k.ball(0.08, 0, C.gold, { x: -1.3, y: 4.95, z: 0.65 });
	windowAt(b, -1.3, 2.2, 1.22, 0, 0.24, 0.4, C.stoneDark);
	// Arched double door and tall windows.
	b.k.box(0.95, 1.15, 0.08, C.stoneDark, { x: 0.2, z: 1.06 });
	b.k.box(0.8, 1.05, 0.08, '#4a2a1a', { x: 0.2, z: 1.09 }, { shade: 0.35 });
	b.k.cyl(0.47, 0.47, 0.09, 10, C.stoneDark, {
		x: 0.2,
		y: 1.15,
		z: 1.07,
		rx: Math.PI / 2,
	});
	b.k.box(0.02, 1.0, 0.03, C.gold, { x: 0.2, z: 1.14 });
	for (const x of [-0.75, 1.0]) windowAt(b, x, 0.55, 1.06, 0, 0.32, 0.6, C.stoneDark);
	for (const x of [-0.7, 0.2, 1.0]) windowAt(b, x, 1.75, 1.12, 0, 0.32, 0.38);
	windowAt(b, 0.2, 2.85, 1.12, 0, 0.36, 0.36);
	// Banner sign with an open book.
	b.k.box(0.07, 0.07, 0.7, C.iron, { x: 1.2, y: 2.25, z: 1.35 });
	b.k.box(0.62, 0.9, 0.05, blue, { x: 1.2, y: 1.35, z: 1.65 }, { shade: 0.2 });
	b.k.box(0.66, 0.06, 0.07, C.gold, { x: 1.2, y: 2.22, z: 1.65 });
	b.k.cone(0.31, 0.25, 3, blue, { x: 1.2, y: 1.37, z: 1.65, rz: Math.PI, sz: 0.15 });
	for (const s of [-1, 1])
		b.k.box(
			0.22,
			0.32,
			0.02,
			'#f6eedc',
			{ x: 1.2 + s * 0.11, y: 1.6, z: 1.68, rz: s * 0.18 },
			{ shade: 0 },
		);
	b.k.box(0.03, 0.32, 0.025, '#8f2d2d', { x: 1.2, y: 1.6, z: 1.69 });
	// Book stacks by the door.
	for (let i = 0; i < 5; i++)
		b.k.box(0.32 - (i % 2) * 0.04, 0.09, 0.24, C.book[i % 5], {
			x: -0.5,
			y: i * 0.09,
			z: 1.35,
			ry: i * 0.3,
		});
	for (let i = 0; i < 3; i++)
		b.k.box(0.3, 0.09, 0.22, C.book[(i + 2) % 5], {
			x: 1.0,
			y: i * 0.09,
			z: 1.4,
			ry: -i * 0.4,
		});
	lantern(b, -0.25, 1.4, 1.2, 0.8);
}

function stage(b: Builders) {
	const pink = MAX_PINK;
	b.k.box(2.9, 0.45, 1.9, C.wood, { z: -0.35 }, { shade: 0.4, jitter: 0.08 });
	for (let i = 0; i < 9; i++)
		b.k.box(2.92, 0.02, 0.03, C.woodDark, { y: 0.45, z: -1.25 + i * 0.22 });
	b.k.box(3.0, 0.12, 0.12, C.gold, { y: 0.4, z: 0.6 });
	// Steps.
	for (let i = 0; i < 2; i++)
		b.k.box(0.9, 0.15, 0.25, C.woodLight, { y: i * 0.15, z: 0.75 - i * 0.2 });
	// Frame, backdrop, curtains and a scalloped valance.
	for (const s of [-1, 1])
		b.k.box(0.18, 2.6, 0.18, C.woodDark, { x: s * 1.45, y: 0.45, z: -1.1 });
	b.k.box(3.1, 0.22, 0.22, C.woodDark, { y: 3.0, z: -1.1 });
	b.k.box(2.7, 2.5, 0.05, '#3a2050', { y: 0.45, z: -1.2 }, { shade: 0.3 });
	for (const s of [-1, 1])
		for (let i = 0; i < 5; i++)
			b.k.cyl(
				0.09,
				0.12,
				2.5,
				6,
				i % 2 ? '#c45a7e' : pink,
				{ x: s * (1.3 - i * 0.13), y: 0.45, z: -1.05 + (i % 2) * 0.04 },
				{ shade: 0.35, jitter: 0 },
			);
	b.k.box(3.0, 0.4, 0.12, pink, { y: 2.6, z: -0.98 }, { shade: 0.2 });
	for (let i = 0; i < 8; i++)
		b.k.ball(0.11, 0, pink, { x: -1.3 + i * 0.37, y: 2.6, z: -0.94, sy: 0.7 });
	b.k.box(3.04, 0.06, 0.14, C.gold, { y: 2.98, z: -0.97 });
	// Star emblem on the valance.
	b.glow.cone(0.13, 0.05, 5, C.gold, { y: 2.8, z: -0.9, rx: Math.PI / 2 });
	// Lectern and mic.
	b.k.box(0.4, 0.75, 0.3, C.woodDark, { x: 0.5, y: 0.45, z: -0.35 }, { shade: 0.3 });
	b.k.box(0.5, 0.06, 0.38, C.wood, { x: 0.5, y: 1.2, z: -0.33, rx: 0.25 });
	b.k.box(0.03, 0.9, 0.03, C.iron, { x: -0.3, y: 0.45, z: -0.1 });
	b.k.ball(0.06, 0, C.ironLight, { x: -0.3, y: 1.38, z: -0.1 });
	// Footlight lanterns.
	lantern(b, -1.3, 0.45, 0.45, 0.7);
	lantern(b, 1.3, 0.45, 0.45, 0.7);
	// Benches for the audience.
	for (const s of [-1, 1]) {
		b.k.box(1.0, 0.07, 0.28, C.woodLight, { x: s * 0.75, y: 0.3, z: 1.25 });
		for (const t of [-1, 1])
			b.k.box(0.07, 0.3, 0.24, C.woodDark, { x: s * 0.75 + t * 0.4, z: 1.25 });
	}
}

function questboard(b: Builders) {
	for (const s of [-1, 1]) b.k.box(0.14, 2.0, 0.14, C.woodDark, { x: s * 0.72 });
	b.k.box(1.45, 1.0, 0.08, C.wood, { y: 0.75 }, { shade: 0.25, jitter: 0.08 });
	b.k.box(1.55, 0.08, 0.12, C.woodDark, { y: 0.71 });
	b.k.box(1.55, 0.08, 0.12, C.woodDark, { y: 1.75 });
	b.k.gableRoof(
		1.7,
		0.5,
		0.35,
		'#b8432f',
		{ y: 1.95 },
		{ overhang: 0.1, thickness: 0.07 },
	);
	const papers: [number, number, number, number, number, string][] = [
		[-0.45, 1.25, 0.34, 0.42, -0.08, '#f6eedc'],
		[0.0, 1.35, 0.3, 0.36, 0.06, '#efe0b8'],
		[0.42, 1.2, 0.34, 0.44, 0.1, '#f6eedc'],
		[-0.2, 0.95, 0.3, 0.3, 0.12, '#e9d7a8'],
		[0.25, 0.92, 0.36, 0.26, -0.06, '#f6eedc'],
	];
	for (const [x, y, w, h, r, c] of papers) {
		b.k.box(
			w,
			h,
			0.015,
			c,
			{ x, y: y - h / 2, z: 0.05, rz: r },
			{ shade: 0.05, jitter: 0 },
		);
		b.k.ball(0.035, 0, '#a8231c', { x, y: y - 0.04, z: 0.07 });
		for (let i = 0; i < 3; i++)
			b.k.box(w * 0.6, 0.015, 0.01, '#8a7a6a', {
				x,
				y: y - 0.13 - i * 0.07,
				z: 0.065,
				rz: r,
			});
	}
	// The visitor's quill and ink.
	b.k.box(0.5, 0.45, 0.4, C.woodLight, { x: 0.85, z: 0.45 }, { shade: 0.3, jitter: 0.1 });
	b.k.cyl(0.06, 0.07, 0.1, 8, '#2a2a3a', { x: 0.8, y: 0.45, z: 0.45 });
	b.k.box(0.015, 0.35, 0.06, '#f6eedc', { x: 0.82, y: 0.5, z: 0.45, rz: 0.4 });
	lantern(b, -0.72, 2.05, 0.1, 0.7);
}

function worldforge(b: Builders) {
	// Octagonal stone dais.
	b.k.cyl(1.35, 1.45, 0.18, 8, C.stone, {}, { shade: 0.3, jitter: 0.12 });
	b.k.cyl(0.95, 1.05, 0.12, 8, C.stoneDark, { y: 0.18 }, { shade: 0.2, jitter: 0.1 });
	// The waystone itself.
	b.k.cyl(0.3, 0.46, 2.4, 6, '#3d4258', { y: 0.3 }, { shade: 0.35, jitter: 0.1 });
	b.k.cone(0.3, 0.55, 6, '#3d4258', { y: 2.7 }, { shade: 0.1 });
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
		const r = 0.395;
		b.glow.box(
			0.08,
			0.5,
			0.02,
			C.rune,
			{ x: Math.sin(a) * r, y: 0.75, z: Math.cos(a) * r, ry: a, rx: -0.07 },
			{ shade: 0, jitter: 0 },
		);
		b.glow.box(
			0.18,
			0.05,
			0.02,
			C.rune,
			{
				x: Math.sin(a) * (r - 0.02),
				y: 1.45 + (i % 2) * 0.2,
				z: Math.cos(a) * (r - 0.02),
				ry: a,
				rx: -0.07,
			},
			{ shade: 0, jitter: 0 },
		);
		b.glow.box(
			0.06,
			0.22,
			0.02,
			C.rune,
			{
				x: Math.sin(a) * (r - 0.06),
				y: 1.85,
				z: Math.cos(a) * (r - 0.06),
				ry: a,
				rx: -0.07,
			},
			{ shade: 0, jitter: 0 },
		);
	}
	// Ring of small standing stones, each with a rune.
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * Math.PI * 2;
		const x = Math.sin(a) * 1.65;
		const z = Math.cos(a) * 1.65;
		if (Math.abs(a - Math.PI) < 0.1) continue;
		b.k.box(
			0.22,
			0.6 + (i % 2) * 0.2,
			0.16,
			'#525a70',
			{ x, z, ry: a },
			{ shade: 0.35, jitter: 0.1 },
		);
		b.glow.box(
			0.06,
			0.16,
			0.02,
			C.rune,
			{ x: x * 0.95, y: 0.35, z: z * 0.95, ry: a },
			{ shade: 0, jitter: 0 },
		);
	}
}

export function landmarkGeometry(id: LandmarkId, snow: boolean) {
	return cached(`l:${id}:${snow}`, () => {
		const b = kits(id.length * 97, snow);
		if (id === 'max') maxCamp(b);
		else if (id === 'library') library(b);
		else if (id === 'stage') stage(b);
		else if (id === 'questboard') questboard(b);
		else worldforge(b);
		return finish(b);
	});
}

/** Flame cluster for fires; animated by scaling. */
export function flameGeometry() {
	return cached('flame', () => {
		const k = new Kit(5);
		k.cone(0.16, 0.5, 5, C.fireRed, { y: 0 }, { shade: 0, jitter: 0 });
		k.cone(0.11, 0.42, 5, C.fire, { x: 0.05, y: 0.02, z: 0.03 }, { shade: 0, jitter: 0 });
		k.cone(0.07, 0.3, 5, C.fireHot, { x: -0.02, y: 0.02 }, { shade: 0, jitter: 0 });
		k.cone(
			0.08,
			0.32,
			5,
			C.fire,
			{ x: -0.08, y: 0, z: -0.04, rz: 0.2 },
			{ shade: 0, jitter: 0 },
		);
		return k.build();
	});
}

/** WoW's quest marker: a fat golden exclamation mark. */
export function exclamationGeometry() {
	return cached('exclamation', () => {
		const k = new Kit(6);
		k.add(
			new THREE.CylinderGeometry(0.13, 0.07, 0.55, 6).translate(0, 0.42, 0),
			'#ffd23a',
			{},
			{ shade: 0, jitter: 0 },
		);
		k.add(
			new THREE.CylinderGeometry(0.135, 0.135, 0.08, 6).translate(0, 0.7, 0),
			'#ffe680',
			{},
			{ shade: 0, jitter: 0 },
		);
		k.ball(0.09, 0, '#ffd23a', { y: 0.0 }, { shade: 0, jitter: 0 });
		return k.build();
	});
}

// ---------------------------------------------------------------------------
// Props

export function propGeometry(
	kind: PropKind,
	variant: number,
	snow: boolean,
	flowerColors: string[],
) {
	return cached(`p:${kind}:${variant % 3}:${snow}:${flowerColors.join()}`, () => {
		const b = kits(kind.length * 13 + variant, snow);
		const { k } = b;
		switch (kind) {
			case 'lamp':
				k.cyl(0.06, 0.08, 1.6, 6, C.iron, {});
				k.cyl(0.14, 0.16, 0.12, 6, C.iron, {});
				k.box(0.36, 0.04, 0.04, C.iron, { x: 0.16, y: 1.55 });
				lantern(b, 0.3, 1.25, 0, 0.9);
				break;
			case 'fence':
				for (const s of [-0.5, 0.5]) k.box(0.1, 0.7, 0.1, C.woodDark, { x: s });
				for (const y of [0.22, 0.48]) k.box(1.05, 0.08, 0.05, C.wood, { y });
				break;
			case 'crate':
				k.box(0.5, 0.5, 0.5, C.woodLight, {}, { shade: 0.3, jitter: 0.08 });
				for (const s of [-1, 1]) {
					k.box(0.52, 0.06, 0.52, C.woodDark, { y: s > 0 ? 0.44 : 0 });
					k.box(0.06, 0.5, 0.52, C.woodDark, { x: s * 0.23 });
				}
				if (variant % 2)
					k.box(0.36, 0.36, 0.36, C.wood, { y: 0.5, ry: 0.4 }, { shade: 0.3 });
				break;
			case 'barrel':
				k.cyl(0.22, 0.2, 0.3, 9, C.wood, {}, { shade: 0.3, jitter: 0.06 });
				k.cyl(0.2, 0.22, 0.3, 9, C.wood, { y: 0.3 }, { shade: 0.1, jitter: 0.06 });
				for (const y of [0.08, 0.5]) k.cyl(0.215, 0.215, 0.04, 9, C.iron, { y });
				k.cyl(0.19, 0.19, 0.02, 9, C.woodLight, { y: 0.6 });
				break;
			case 'cart':
				k.box(0.8, 0.25, 1.2, C.wood, { y: 0.3 }, { shade: 0.3 });
				for (const s of [-1, 1]) {
					k.cyl(0.3, 0.3, 0.06, 10, C.woodDark, { x: s * 0.45, y: 0.3, rz: Math.PI / 2 });
					k.cyl(0.08, 0.08, 0.08, 6, C.iron, { x: s * 0.48, y: 0.3, rz: Math.PI / 2 });
					k.box(0.05, 0.05, 0.9, C.woodDark, { x: s * 0.25, y: 0.25, z: 0.95, rx: 0.15 });
				}
				k.sphere(
					0.45,
					8,
					5,
					C.hay,
					{ y: 0.5, sy: 0.6, sz: 1.2 },
					{ shade: 0.2, jitter: 0.1 },
				);
				break;
			case 'campfire':
				for (let i = 0; i < 7; i++) {
					const a = (i / 7) * Math.PI * 2;
					k.ball(0.09, 0, C.stoneDark, {
						x: Math.cos(a) * 0.3,
						y: 0.05,
						z: Math.sin(a) * 0.3,
					});
				}
				for (const r of [0.4, -0.6, 1.5])
					k.cyl(0.05, 0.05, 0.45, 6, C.woodDark, { y: 0.06, rz: Math.PI / 2, ry: r });
				b.glow.ball(0.12, 0, C.fireRed, { y: 0.1, sy: 0.6 });
				break;
			case 'banner': {
				const colors = [MAX_PINK, '#2f4f9a', '#b8432f'];
				const c = colors[variant % 3];
				k.cyl(0.05, 0.06, 2.4, 6, C.woodDark, {});
				k.ball(0.08, 0, C.gold, { y: 2.42 });
				k.box(0.75, 0.06, 0.06, C.woodDark, { y: 2.2, x: 0.33 });
				k.box(0.6, 1.1, 0.03, c, { x: 0.33, y: 1.1 }, { shade: 0.25 });
				k.cone(0.3, 0.25, 3, c, { x: 0.33, y: 1.1, rz: Math.PI, sz: 0.1 });
				k.box(0.64, 0.05, 0.04, C.gold, { x: 0.33, y: 2.18 });
				k.ball(0.11, 0, C.gold, { x: 0.33, y: 1.75, z: 0.02, sz: 0.3 });
				break;
			}
			case 'statue':
				k.box(0.8, 0.3, 0.8, C.stoneDark, {}, { shade: 0.3, jitter: 0.1 });
				k.box(0.6, 0.5, 0.6, C.stone, { y: 0.3 }, { shade: 0.3, jitter: 0.1 });
				k.box(0.32, 0.5, 0.2, '#b8b2a6', { y: 0.8 });
				k.ball(0.17, 1, '#b8b2a6', { y: 1.47 }, { smooth: true, shade: 0 });
				for (const s of [-1, 1])
					k.box(0.1, 0.4, 0.12, '#b8b2a6', { x: s * 0.1, y: 0.8, z: 0 });
				k.box(0.36, 0.45, 0.24, '#b8b2a6', { y: 1.08 });
				k.box(0.08, 0.38, 0.08, '#b8b2a6', { x: 0.24, y: 1.2, rz: -0.3 });
				k.box(0.05, 0.75, 0.05, '#cfc9be', { x: 0.36, y: 1.5, rz: -0.15 });
				k.box(0.2, 0.04, 0.05, '#cfc9be', { x: 0.36, y: 1.52 });
				k.box(0.42, 0.06, 0.04, '#cfc9be', { x: -0.2, y: 1.1, z: 0.12, rz: 0.6 });
				break;
			case 'flowers':
				for (let i = 0; i < 9; i++) {
					const a = i * 2.4 + variant;
					const r = 0.12 + (i % 3) * 0.1;
					const x = Math.cos(a) * r;
					const z = Math.sin(a) * r;
					k.box(0.02, 0.22, 0.02, '#3f8a2a', { x, z });
					k.ball(
						0.07,
						0,
						flowerColors[(i + variant) % flowerColors.length],
						{ x, y: 0.24, z },
						{ shade: 0, jitter: 0.1 },
					);
				}
				k.ball(0.18, 0, '#3f8a2a', { y: 0.04, sy: 0.4 });
				break;
			case 'mushrooms':
				for (let i = 0; i < 4; i++) {
					const x = Math.cos(i * 1.9) * 0.18;
					const z = Math.sin(i * 1.9) * 0.18;
					const s = 0.7 + (i % 2) * 0.5;
					k.cyl(0.035 * s, 0.045 * s, 0.14 * s, 6, '#f2ead8', { x, z });
					k.sphere(
						0.1 * s,
						7,
						4,
						'#d8322e',
						{ x, y: 0.14 * s, z, sy: 0.65 },
						{ shade: 0.1 },
					);
					k.ball(0.022 * s, 0, '#ffffff', { x: x + 0.03 * s, y: 0.2 * s, z: z + 0.02 });
				}
				break;
			case 'signpost':
				k.box(0.1, 1.6, 0.1, C.woodDark, {});
				for (const [y, r, flip] of [
					[1.35, 0.3, 1],
					[1.1, -0.9, -1],
					[0.85, 2.2, 1],
				] as const) {
					const arm = new Kit(3);
					arm.box(0.6, 0.16, 0.04, C.woodLight, { x: flip * 0.3 }, { shade: 0.1 });
					arm.cone(0.1, 0.12, 3, C.woodLight, {
						x: flip * 0.66,
						y: 0.08,
						rz: (-flip * Math.PI) / 2,
						sz: 0.4,
					});
					const g = arm.build();
					g.rotateY(r);
					g.translate(0, y, 0);
					k.merge(g);
				}
				k.cone(0.1, 0.12, 4, C.woodDark, { y: 1.6, ry: Math.PI / 4 });
				break;
			case 'bench':
				k.box(0.95, 0.06, 0.3, C.woodLight, { y: 0.32 });
				k.box(0.95, 0.25, 0.05, C.woodLight, { y: 0.45, z: -0.14, rx: -0.15 });
				for (const s of [-1, 1]) k.box(0.06, 0.32, 0.28, C.iron, { x: s * 0.4 });
				break;
			case 'haystack':
				k.sphere(0.5, 9, 6, C.hay, { y: 0.2, sy: 0.85 }, { shade: 0.35, jitter: 0.1 });
				k.cone(0.35, 0.4, 9, '#d4a83c', { y: 0.55 }, { shade: 0.1, jitter: 0.1 });
				if (snow) k.sphere(0.36, 8, 4, '#f4f8fc', { y: 0.72, sy: 0.4 });
				k.box(0.03, 0.4, 0.03, C.woodDark, { y: 0.85, rz: 0.2 });
				break;
			case 'scarecrow':
				k.box(0.07, 1.5, 0.07, C.woodDark, {});
				k.box(1.0, 0.06, 0.06, C.woodDark, { y: 1.1 });
				k.box(0.42, 0.5, 0.2, '#6a7a3a', { y: 0.7 }, { shade: 0.3 });
				for (const s of [-1, 1]) {
					k.box(0.35, 0.14, 0.14, '#6a7a3a', { x: s * 0.3, y: 1.04 });
					k.cone(0.07, 0.15, 5, C.hay, { x: s * 0.52, y: 1.1, rz: (s * Math.PI) / 2 });
				}
				k.ball(0.17, 1, '#d8c08a', { y: 1.42 }, { smooth: true, shade: 0.1 });
				k.cyl(0.32, 0.32, 0.04, 9, C.hay, { y: 1.52 });
				k.cone(0.18, 0.3, 8, C.hay, { y: 1.52 });
				k.box(0.05, 0.05, 0.02, '#2a2018', { x: -0.06, y: 1.45, z: 0.16 });
				k.box(0.05, 0.05, 0.02, '#2a2018', { x: 0.06, y: 1.45, z: 0.16 });
				k.box(0.14, 0.02, 0.02, '#2a2018', { y: 1.36, z: 0.16 });
				break;
			case 'tombstone': {
				const tilt = ((variant % 3) - 1) * 0.12;
				k.box(0.45, 0.6, 0.14, C.stone, { rz: tilt }, { shade: 0.4, jitter: 0.1 });
				k.cyl(
					0.225,
					0.225,
					0.14,
					8,
					C.stone,
					{ y: 0.6, rx: Math.PI / 2, z: -0.07, rz: tilt },
					{ shade: 0 },
				);
				k.box(0.2, 0.04, 0.02, C.stoneDark, { y: 0.45, z: 0.08, rz: tilt });
				k.box(0.04, 0.2, 0.02, C.stoneDark, { y: 0.36, z: 0.08, rz: tilt });
				k.box(0.5, 0.06, 0.2, C.moss, { y: 0, rz: tilt });
				break;
			}
			case 'crystal': {
				const colors = ['#7ff0ff', '#c08aff', '#ff9ac8'];
				const c = colors[variant % 3];
				for (let i = 0; i < 5; i++) {
					const a = i * 1.3;
					const h = 0.35 + ((i * 7) % 5) * 0.12;
					b.glow.add(
						new THREE.OctahedronGeometry(0.12, 0),
						c,
						{
							x: Math.cos(a) * 0.12 * (i ? 1 : 0),
							y: h * 0.5,
							z: Math.sin(a) * 0.12 * (i ? 1 : 0),
							sy: h * 4.5,
							rz: i ? Math.cos(a) * 0.35 : 0,
							rx: i ? Math.sin(a) * 0.35 : 0,
						},
						{ shade: 0.45, jitter: 0.15 },
					);
				}
				for (let i = 0; i < 4; i++)
					k.ball(0.1, 0, C.stoneDark, {
						x: Math.cos(i * 1.6) * 0.2,
						y: 0.03,
						z: Math.sin(i * 1.6) * 0.2,
					});
				break;
			}
		}
		return finish(b);
	});
}

/** Plank tiles for bridges and docks, baked for the whole world. */
export function deckGeometry(
	decks: {
		x: number;
		y: number;
		axis: 'x' | 'y';
		height: number;
		kind: 'bridge' | 'dock';
	}[],
) {
	const k = new Kit(42);
	const isDeck = new Set(decks.map((d) => `${d.x},${d.y}`));
	for (const d of decks) {
		if (d.kind === 'dock') continue;
		const cx = d.x + 0.5;
		const cz = d.y + 0.5;
		const along = d.axis === 'x';
		k.box(
			along ? 1.02 : 1.1,
			0.12,
			along ? 1.1 : 1.02,
			C.wood,
			{ x: cx, y: d.height - 0.12, z: cz },
			{ shade: 0.2, jitter: 0.08 },
		);
		for (let i = 0; i < 4; i++) {
			const o = -0.375 + i * 0.25;
			k.box(along ? 0.03 : 1.1, 0.02, along ? 1.1 : 0.03, C.woodDark, {
				x: cx + (along ? o : 0),
				y: d.height,
				z: cz + (along ? 0 : o),
			});
		}
		// Railings on the open sides, posts into the water.
		for (const s of [-1, 1]) {
			const sideKey = along ? `${d.x},${d.y + s}` : `${d.x + s},${d.y}`;
			if (isDeck.has(sideKey)) continue;
			const rx = cx + (along ? 0 : s * 0.52);
			const rz = cz + (along ? s * 0.52 : 0);
			k.box(along ? 1.04 : 0.07, 0.07, along ? 0.07 : 1.04, C.woodDark, {
				x: rx,
				y: d.height + 0.42,
				z: rz,
			});
			k.box(0.08, 0.5, 0.08, C.woodDark, { x: rx, y: d.height - 0.05, z: rz });
			k.box(0.1, 1.2, 0.1, C.woodDark, { x: rx, y: d.height - 1.3, z: rz });
		}
	}
	return k.empty ? null : k.build();
}
