import * as THREE from 'three';
import type { NpcKind } from '../world/compile';
import { cached, Kit } from './kit';
import { MAX_PINK } from './palette';

/**
 * Chibi actors: big heads, short limbs. A rig is a static body plus limbs that pivot at the
 * shoulder or hip, so walking is a cheap rotation per limb. Front faces +z.
 */

export type Limb = {
	geometry: THREE.BufferGeometry;
	pivot: [number, number, number];
	/** Limbs with the same phase swing together. */
	phase: 0 | 1;
	kind: 'arm' | 'leg';
};

export type Rig = {
	body: THREE.BufferGeometry;
	glow?: THREE.BufferGeometry;
	limbs: Limb[];
	/** Height of the head top, for nameplates. */
	height: number;
	/** Walk speed in cells per second. */
	speed: number;
	hop?: boolean;
};

export type ActorKind = NpcKind | 'max' | 'visitor';

type Human = {
	skin: string;
	hair: string;
	hairStyle: 'short' | 'bun' | 'long' | 'messy' | 'none';
	beard?: 'stubble' | 'long';
	shirt: string;
	trim?: string;
	pants: string;
	boots: string;
	sleeves?: string;
	hat?: 'helmet' | 'straw' | 'feather' | 'wrap' | 'wizard' | 'bucket' | 'cap';
	hatColor?: string;
	cape?: string;
	robe?: string;
	item?: 'spear' | 'pitchfork' | 'staff' | 'rod' | 'mug';
	back?: 'pack' | 'satchel' | 'lute' | 'shield';
	glasses?: boolean;
	hood?: string;
	scale?: number;
};

const SKIN = '#f1c8a2';
const IRON = '#8a8f9a';
const WOOD = '#7a5030';

function human(h: Human): Rig {
	const k = new Kit(11);
	const glow = new Kit(12);
	const s = h.scale ?? 1;
	const hipY = 0.3;
	const shoulderY = 0.62;
	// Torso: a slightly tapered block with a belt.
	k.cyl(0.17, 0.21, 0.34, 8, h.shirt, { y: hipY - 0.02 }, { shade: 0.25, smooth: false });
	k.cyl(0.215, 0.215, 0.06, 8, '#4a2e1c', { y: hipY + 0.02 });
	k.box(0.06, 0.05, 0.03, '#e8c25a', { y: hipY + 0.025, z: 0.21 });
	if (h.trim) k.box(0.12, 0.3, 0.02, h.trim, { y: hipY + 0.0, z: 0.185 }, { shade: 0.1 });
	if (h.robe) k.cyl(0.21, 0.3, 0.34, 8, h.robe, { y: 0.0 }, { shade: 0.3 });
	// Head.
	const headY = 0.86;
	k.sphere(0.25, 10, 8, h.skin, { y: headY, sy: 0.95 }, { smooth: true, shade: 0.12 });
	k.box(
		0.045,
		0.07,
		0.02,
		'#2a1c14',
		{ x: -0.08, y: headY - 0.02, z: 0.235 },
		{ shade: 0 },
	);
	k.box(
		0.045,
		0.07,
		0.02,
		'#2a1c14',
		{ x: 0.08, y: headY - 0.02, z: 0.235 },
		{ shade: 0 },
	);
	k.ball(0.035, 0, '#e8a080', { y: headY - 0.07, z: 0.245 }, { shade: 0 });
	for (const sx of [-1, 1])
		k.ball(0.05, 0, h.skin, { x: sx * 0.25, y: headY - 0.02, sz: 0.6 }, { shade: 0 });
	if (h.glasses)
		for (const sx of [-1, 1])
			k.add(
				new THREE.TorusGeometry(0.055, 0.012, 4, 10),
				'#d8b040',
				{ x: sx * 0.08, y: headY - 0.015, z: 0.245 },
				{ shade: 0, jitter: 0 },
			);
	if (h.glasses) k.box(0.05, 0.012, 0.012, '#d8b040', { y: headY - 0.005, z: 0.25 });
	// Hair.
	if (h.hairStyle !== 'none') {
		k.sphere(
			0.265,
			10,
			6,
			h.hair,
			{ y: headY + 0.03, z: -0.03, sy: 0.85 },
			{ smooth: true, shade: 0.2 },
		);
		k.box(0.42, 0.1, 0.12, h.hair, { y: headY + 0.13, z: 0.17, rx: 0.3 }, { shade: 0.1 });
	}
	if (h.hairStyle === 'bun')
		k.sphere(0.11, 8, 6, h.hair, { y: headY + 0.3, z: -0.04 }, { smooth: true });
	if (h.hairStyle === 'long')
		k.box(0.4, 0.38, 0.14, h.hair, { y: headY - 0.3, z: -0.16 }, { shade: 0.2 });
	if (h.hairStyle === 'messy')
		for (let i = 0; i < 5; i++)
			k.cone(0.07, 0.14, 4, h.hair, {
				x: -0.16 + i * 0.08,
				y: headY + 0.22,
				z: 0.02,
				rz: (i - 2) * 0.3,
			});
	if (h.beard === 'stubble')
		k.sphere(
			0.2,
			10,
			6,
			'#8a6040',
			{ y: headY - 0.1, z: 0.07, sy: 0.6, sz: 0.85 },
			{ smooth: true, shade: 0 },
		);
	if (h.beard === 'long') {
		k.cone(
			0.17,
			0.42,
			7,
			'#f2f2f2',
			{ y: headY - 0.52, z: 0.14, rx: Math.PI, sz: 0.6 },
			{ smooth: true, shade: 0.1 },
		);
		k.sphere(
			0.16,
			8,
			6,
			'#f2f2f2',
			{ y: headY - 0.1, z: 0.1, sy: 0.7 },
			{ smooth: true, shade: 0 },
		);
	}
	if (h.hood)
		k.sphere(
			0.18,
			8,
			5,
			h.hood,
			{ y: shoulderY + 0.02, z: -0.17, sy: 0.6 },
			{ shade: 0.2 },
		);
	// Hats.
	const hc = h.hatColor ?? '#6a4a2a';
	switch (h.hat) {
		case 'helmet':
			k.sphere(
				0.28,
				10,
				6,
				IRON,
				{ y: headY + 0.04, sy: 0.9 },
				{ smooth: true, shade: 0.2 },
			);
			k.box(0.05, 0.12, 0.3, '#c8322e', { y: headY + 0.26 }, { shade: 0 });
			k.box(0.6, 0.05, 0.06, IRON, { y: headY + 0.02, z: 0.23 }, { shade: 0 });
			break;
		case 'straw':
			k.cyl(0.42, 0.42, 0.03, 12, hc, { y: headY + 0.14 }, { shade: 0 });
			k.cyl(0.2, 0.25, 0.16, 10, hc, { y: headY + 0.15 });
			k.cyl(0.255, 0.255, 0.04, 10, '#b8432f', { y: headY + 0.16 });
			break;
		case 'feather':
			k.sphere(
				0.27,
				10,
				5,
				hc,
				{ y: headY + 0.12, sy: 0.55, sz: 1.1 },
				{ smooth: true, shade: 0.2 },
			);
			k.cone(0.05, 0.45, 5, '#ffffff', {
				x: 0.14,
				y: headY + 0.22,
				z: -0.12,
				rx: -0.9,
				rz: -0.3,
			});
			break;
		case 'wrap':
			k.sphere(
				0.29,
				10,
				6,
				hc,
				{ y: headY + 0.1, sy: 0.7 },
				{ smooth: true, shade: 0.2 },
			);
			k.ball(0.07, 0, '#e8c25a', { y: headY + 0.18, z: 0.26 });
			break;
		case 'wizard':
			k.cyl(0.42, 0.42, 0.03, 12, hc, { y: headY + 0.15 }, { shade: 0 });
			k.cone(0.27, 0.75, 9, hc, { y: headY + 0.16, rx: -0.15 }, { shade: 0.2 });
			k.ball(0.04, 0, '#ffe680', { x: 0.1, y: headY + 0.4, z: 0.13 });
			k.ball(0.03, 0, '#ffe680', { x: -0.07, y: headY + 0.55, z: 0.06 });
			break;
		case 'bucket':
			k.cyl(0.24, 0.36, 0.2, 10, hc, { y: headY + 0.1 }, { shade: 0.2 });
			break;
		case 'cap':
			k.sphere(
				0.27,
				10,
				5,
				hc,
				{ y: headY + 0.08, sy: 0.6 },
				{ smooth: true, shade: 0.1 },
			);
			k.box(0.3, 0.03, 0.18, hc, { y: headY + 0.1, z: 0.25 });
			break;
	}
	if (h.cape)
		k.box(0.36, 0.5, 0.04, h.cape, { y: hipY - 0.15, z: -0.2, rx: 0.08 }, { shade: 0.3 });
	switch (h.back) {
		case 'pack':
			k.box(0.34, 0.4, 0.2, '#8a5a32', { y: hipY + 0.05, z: -0.27 }, { shade: 0.3 });
			k.cyl(0.08, 0.08, 0.36, 7, '#5a7a3a', {
				y: hipY + 0.48,
				z: -0.27,
				rz: Math.PI / 2,
				x: 0.18,
			});
			k.cyl(0.07, 0.06, 0.12, 7, '#b8432f', { x: -0.1, y: hipY + 0.45, z: -0.3 });
			break;
		case 'satchel':
			k.box(
				0.22,
				0.2,
				0.08,
				'#7a4a2a',
				{ x: 0.2, y: hipY - 0.05, z: 0.02 },
				{ shade: 0.2 },
			);
			k.box(0.04, 0.5, 0.02, '#5a3a20', { y: hipY + 0.05, z: 0.19, rz: 0.75 });
			break;
		case 'lute':
			k.sphere(
				0.15,
				8,
				6,
				'#b07a48',
				{ x: 0.03, y: hipY + 0.12, z: 0.24, sz: 0.4 },
				{ smooth: true, shade: 0.1 },
			);
			k.box(0.05, 0.35, 0.03, '#5a3a22', { x: -0.1, y: hipY + 0.2, z: 0.26, rz: 0.9 });
			break;
		case 'shield':
			k.cyl(0.2, 0.2, 0.05, 10, '#2f4f9a', { x: -0.27, y: hipY + 0.18, rz: Math.PI / 2 });
			k.ball(0.06, 0, '#e8c25a', { x: -0.31, y: hipY + 0.18 });
			break;
	}

	// Limbs hang from their pivots.
	const limbs: Limb[] = [];
	for (const side of [-1, 1] as const) {
		const arm = new Kit(20 + side);
		arm.cyl(0.06, 0.07, 0.26, 6, h.sleeves ?? h.shirt, { y: -0.27 });
		arm.ball(0.065, 0, h.skin, { y: -0.31 }, { shade: 0 });
		if (side === 1 && h.item) {
			switch (h.item) {
				case 'spear':
					arm.cyl(0.025, 0.025, 1.5, 5, WOOD, { y: -0.85, z: 0.06 });
					arm.cone(0.06, 0.2, 4, IRON, { y: 0.65, z: 0.06 });
					break;
				case 'pitchfork':
					arm.cyl(0.022, 0.022, 1.3, 5, WOOD, { y: -0.8, z: 0.06 });
					for (const t of [-1, 0, 1])
						arm.box(0.015, 0.2, 0.015, IRON, { x: t * 0.05, y: 0.5, z: 0.06 });
					arm.box(0.14, 0.02, 0.02, IRON, { y: 0.5, z: 0.06 });
					break;
				case 'staff':
					arm.cyl(0.03, 0.035, 1.4, 6, '#5a3a22', { y: -0.75, z: 0.06 });
					glow.ball(0.09, 0, '#7ff0ff', { y: 0.72, z: 0.06 + 0.0 });
					break;
				case 'rod':
					arm.cyl(0.012, 0.02, 1.3, 5, WOOD, { y: -0.35, z: 0.08, rx: 0.9 });
					break;
				case 'mug':
					arm.cyl(0.055, 0.05, 0.11, 8, '#f2ece0', { y: -0.4, z: 0.06 });
					arm.add(new THREE.TorusGeometry(0.03, 0.01, 4, 6), '#f2ece0', {
						x: 0.06,
						y: -0.34,
						z: 0.06,
						ry: Math.PI / 2,
					});
					break;
			}
		}
		limbs.push({
			geometry: arm.build(),
			pivot: [side * 0.24, shoulderY - 0.02, 0],
			phase: side === 1 ? 0 : 1,
			kind: 'arm',
		});
		if (h.robe) continue;
		const leg = new Kit(30 + side);
		leg.cyl(0.075, 0.07, 0.2, 6, h.pants, { y: -0.2 });
		leg.box(0.13, 0.09, 0.19, h.boots, { y: -0.3, z: 0.025 }, { shade: 0.2 });
		limbs.push({
			geometry: leg.build(),
			pivot: [side * 0.09, hipY, 0],
			phase: side === 1 ? 1 : 0,
			kind: 'leg',
		});
	}
	const body = k.build();
	if (s !== 1) {
		body.scale(s, s, s);
		for (const l of limbs) {
			l.geometry.scale(s, s, s);
			l.pivot = [l.pivot[0] * s, l.pivot[1] * s, l.pivot[2] * s];
		}
	}
	const glowGeo = glow.empty ? undefined : glow.build();
	if (glowGeo && s !== 1) glowGeo.scale(s, s, s);
	return {
		body,
		glow: glowGeo,
		limbs,
		height: (h.hat === 'wizard' ? 1.75 : 1.25) * s,
		speed: 1.2,
	};
}

type Beast = {
	body: string;
	belly?: string;
	size: [number, number, number];
	legH: number;
	legColor: string;
	head: string;
	headSize: number;
	ears?: 'cone' | 'floppy' | 'none';
	tail?: 'up' | 'wag' | 'puff' | 'none';
	horns?: 'cow' | 'antlers';
	fluffy?: boolean;
	spots?: string;
	speed: number;
};

function beast(b: Beast): Rig {
	const k = new Kit(41);
	const [w, h, d] = b.size;
	const bodyY = b.legH + h / 2;
	if (b.fluffy) {
		for (let i = 0; i < 9; i++) {
			const a = i * 2.1;
			k.ball(
				h * 0.55,
				1,
				b.body,
				{
					x: Math.cos(a) * w * 0.28,
					y: bodyY + Math.sin(i * 1.3) * h * 0.18,
					z: -d * 0.32 + (i / 8) * d * 0.64,
				},
				{ smooth: true, shade: 0.15 },
			);
		}
	} else {
		k.sphere(
			0.5,
			10,
			7,
			b.body,
			{ y: bodyY, sx: w, sy: h, sz: d },
			{ smooth: true, shade: 0.2 },
		);
	}
	if (b.spots)
		for (let i = 0; i < 4; i++)
			k.sphere(
				0.5,
				6,
				4,
				b.spots,
				{
					x: (i % 2 ? 1 : -1) * w * 0.33,
					y: bodyY + h * 0.1,
					z: -d * 0.25 + i * d * 0.17,
					sx: 0.08,
					sy: h * 0.5,
					sz: d * 0.2,
				},
				{ smooth: true, shade: 0 },
			);
	const hs = b.headSize;
	const headY = bodyY + h * 0.35;
	const headZ = d / 2 + hs * 0.2;
	k.sphere(hs, 9, 7, b.head, { y: headY, z: headZ }, { smooth: true, shade: 0.1 });
	k.sphere(
		hs * 0.55,
		8,
		6,
		b.belly ?? b.head,
		{ y: headY - hs * 0.3, z: headZ + hs * 0.65, sy: 0.75 },
		{ smooth: true, shade: 0 },
	);
	for (const sx of [-1, 1])
		k.ball(
			hs * 0.15,
			0,
			'#1a120c',
			{ x: sx * hs * 0.45, y: headY + hs * 0.2, z: headZ + hs * 0.78 },
			{ shade: 0 },
		);
	if (b.ears === 'cone')
		for (const sx of [-1, 1])
			k.cone(hs * 0.32, hs * 0.6, 4, b.head, {
				x: sx * hs * 0.5,
				y: headY + hs * 0.6,
				z: headZ - hs * 0.1,
			});
	if (b.ears === 'floppy')
		for (const sx of [-1, 1])
			k.box(hs * 0.3, hs * 0.75, hs * 0.15, b.spots ?? '#5a3a22', {
				x: sx * hs * 0.85,
				y: headY - hs * 0.4,
				z: headZ,
				rz: sx * 0.25,
			});
	if (b.horns === 'cow')
		for (const sx of [-1, 1])
			k.cone(hs * 0.12, hs * 0.5, 5, '#f2ead8', {
				x: sx * hs * 0.65,
				y: headY + hs * 0.6,
				z: headZ - hs * 0.2,
				rz: -sx * 0.7,
			});
	if (b.horns === 'antlers')
		for (const sx of [-1, 1]) {
			k.cyl(0.02, 0.025, 0.4, 5, '#d8c8a8', {
				x: sx * hs * 0.4,
				y: headY + hs * 0.6,
				z: headZ - hs * 0.2,
				rz: -sx * 0.4,
			});
			k.cyl(0.015, 0.02, 0.2, 5, '#d8c8a8', {
				x: sx * hs * 0.65,
				y: headY + hs * 0.85,
				z: headZ,
				rz: -sx * 0.9,
				rx: 0.3,
			});
		}
	if (b.tail === 'up')
		k.cyl(0.03, 0.04, h * 1.2, 5, b.body, { y: bodyY, z: -d / 2, rx: -0.4 });
	if (b.tail === 'wag')
		k.cyl(0.03, 0.05, h * 0.9, 5, b.body, { y: bodyY + h * 0.1, z: -d / 2, rx: -0.9 });
	if (b.tail === 'puff')
		k.ball(h * 0.22, 0, '#ffffff', { y: bodyY + h * 0.15, z: -d / 2 });
	const limbs: Limb[] = [];
	let n = 0;
	for (const fz of [1, -1])
		for (const sx of [-1, 1]) {
			const leg = new Kit(50 + n++);
			leg.cyl(0.045, 0.04, b.legH + 0.04, 5, b.legColor, { y: -b.legH - 0.02 });
			leg.box(0.09, 0.05, 0.11, '#2a2018', { y: -b.legH - 0.02, z: 0.01 });
			limbs.push({
				geometry: leg.build(),
				pivot: [sx * w * 0.3, b.legH + 0.02, fz * d * 0.3],
				phase: (sx === fz ? 0 : 1) as 0 | 1,
				kind: 'leg',
			});
		}
	return { body: k.build(), limbs, height: headY + hs + 0.35, speed: b.speed };
}

function chicken(): Rig {
	const k = new Kit(61);
	k.sphere(0.2, 9, 7, '#f6f2ea', { y: 0.32, sz: 1.2 }, { smooth: true, shade: 0.15 });
	k.sphere(0.12, 8, 6, '#f6f2ea', { y: 0.56, z: 0.13 }, { smooth: true });
	k.cone(0.04, 0.09, 4, '#f2b632', { y: 0.53, z: 0.25, rx: Math.PI / 2 });
	k.box(0.03, 0.08, 0.1, '#d8322e', { y: 0.66, z: 0.12 });
	k.box(0.03, 0.06, 0.03, '#d8322e', { y: 0.46, z: 0.23 });
	for (const sx of [-1, 1])
		k.ball(0.02, 0, '#1a120c', { x: sx * 0.08, y: 0.59, z: 0.22 });
	k.cone(0.1, 0.2, 5, '#f6f2ea', { y: 0.36, z: -0.26, rx: -0.9 });
	const limbs: Limb[] = [-1, 1].map((sx, i) => {
		const leg = new Kit(70 + i);
		leg.cyl(0.015, 0.015, 0.16, 4, '#f2b632', { y: -0.16 });
		leg.box(0.06, 0.02, 0.08, '#f2b632', { y: -0.17, z: 0.02 });
		return {
			geometry: leg.build(),
			pivot: [sx * 0.07, 0.17, 0] as [number, number, number],
			phase: i as 0 | 1,
			kind: 'leg' as const,
		};
	});
	return { body: k.build(), limbs, height: 1.0, speed: 1.4 };
}

function frog(): Rig {
	const k = new Kit(81);
	k.sphere(
		0.2,
		9,
		6,
		'#4fa83a',
		{ y: 0.14, sx: 1.2, sz: 1.1, sy: 0.75 },
		{ smooth: true, shade: 0.2 },
	);
	k.sphere(
		0.14,
		8,
		6,
		'#c8e080',
		{ y: 0.1, z: 0.08, sy: 0.6 },
		{ smooth: true, shade: 0 },
	);
	for (const sx of [-1, 1]) {
		k.ball(0.07, 1, '#4fa83a', { x: sx * 0.11, y: 0.28, z: 0.1 }, { smooth: true });
		k.ball(0.035, 0, '#1a120c', { x: sx * 0.12, y: 0.31, z: 0.15 });
		k.sphere(
			0.07,
			6,
			4,
			'#3f8a2a',
			{ x: sx * 0.2, y: 0.05, z: -0.08, sy: 0.6, sz: 1.5 },
			{ smooth: true },
		);
	}
	k.box(0.14, 0.02, 0.02, '#2a5a1a', { y: 0.2, z: 0.24 });
	// A leaf crown, slightly askew.
	k.cone(0.07, 0.08, 5, '#e8c25a', { y: 0.33, z: 0.04, rz: 0.2 });
	return { body: k.build(), limbs: [], height: 0.85, speed: 1.0, hop: true };
}

const HUMANS: Partial<Record<ActorKind, Human>> = {
	max: {
		skin: SKIN,
		hair: '#6b4630',
		hairStyle: 'bun',
		beard: 'stubble',
		glasses: true,
		shirt: MAX_PINK,
		hood: '#c45a7e',
		pants: '#2c3550',
		boots: '#5a3a22',
		item: 'mug',
	},
	visitor: {
		skin: '#f3cfa8',
		hair: '#d2a65a',
		hairStyle: 'short',
		shirt: '#2f8f7a',
		trim: '#e8d8a8',
		pants: '#6a4a32',
		boots: '#3a2a1c',
		cape: '#2f4f8f',
		back: 'satchel',
	},
	guard: {
		skin: SKIN,
		hair: '#3a2a1c',
		hairStyle: 'short',
		shirt: '#2f4f9a',
		trim: '#e8c25a',
		sleeves: IRON,
		pants: '#4a4a52',
		boots: '#3a3a42',
		hat: 'helmet',
		item: 'spear',
		back: 'shield',
	},
	farmer: {
		skin: '#e8b890',
		hair: '#a86a3a',
		hairStyle: 'long',
		shirt: '#6a9a3a',
		pants: '#6a5a8a',
		boots: '#5a3a22',
		hat: 'straw',
		hatColor: '#e0c060',
		item: 'pitchfork',
	},
	bard: {
		skin: SKIN,
		hair: '#c8502a',
		hairStyle: 'long',
		shirt: '#7a3a9a',
		trim: '#e8c25a',
		pants: '#3a2a4a',
		boots: '#5a3a22',
		hat: 'feather',
		hatColor: '#b8322e',
		back: 'lute',
	},
	merchant: {
		skin: '#d8a070',
		hair: '#2a1c14',
		hairStyle: 'short',
		beard: 'stubble',
		shirt: '#b8432f',
		trim: '#e8c25a',
		pants: '#e0c890',
		boots: '#5a3a22',
		hat: 'wrap',
		hatColor: '#e89a2a',
		back: 'pack',
	},
	wizard: {
		skin: SKIN,
		hair: '#f2f2f2',
		hairStyle: 'short',
		beard: 'long',
		shirt: '#4a3a9a',
		trim: '#e8c25a',
		pants: '#4a3a9a',
		boots: '#3a2a4a',
		robe: '#4a3a9a',
		hat: 'wizard',
		hatColor: '#3a2a8a',
		item: 'staff',
	},
	fisher: {
		skin: '#e8b890',
		hair: '#8a8a8a',
		hairStyle: 'short',
		beard: 'stubble',
		shirt: '#e8c23a',
		pants: '#3a4a6a',
		boots: '#2a2a2a',
		hat: 'bucket',
		hatColor: '#6a7a3a',
		item: 'rod',
	},
	child: {
		skin: '#f3cfa8',
		hair: '#8a4a2a',
		hairStyle: 'messy',
		shirt: '#d84a3a',
		pants: '#3a5a9a',
		boots: '#5a3a22',
		scale: 0.78,
	},
};

const BEASTS: Partial<Record<ActorKind, Beast>> = {
	cat: {
		body: '#e8943a',
		belly: '#f6e6d0',
		size: [0.24, 0.22, 0.42],
		legH: 0.14,
		legColor: '#e8943a',
		head: '#e8943a',
		headSize: 0.15,
		ears: 'cone',
		tail: 'up',
		speed: 1.3,
	},
	dog: {
		body: '#b07a48',
		belly: '#f2e6d0',
		size: [0.3, 0.28, 0.55],
		legH: 0.2,
		legColor: '#b07a48',
		head: '#b07a48',
		headSize: 0.17,
		ears: 'floppy',
		spots: '#6a4428',
		tail: 'wag',
		speed: 1.8,
	},
	sheep: {
		body: '#f4f1ea',
		size: [0.45, 0.38, 0.6],
		legH: 0.18,
		legColor: '#2a2420',
		head: '#2a2420',
		headSize: 0.14,
		ears: 'cone',
		fluffy: true,
		tail: 'none',
		speed: 0.8,
	},
	cow: {
		body: '#f4f1ea',
		belly: '#f2b8b0',
		size: [0.55, 0.5, 0.95],
		legH: 0.3,
		legColor: '#f4f1ea',
		head: '#f4f1ea',
		headSize: 0.22,
		horns: 'cow',
		spots: '#2a2420',
		tail: 'wag',
		speed: 0.7,
	},
	deer: {
		body: '#b8804a',
		belly: '#f2e6d0',
		size: [0.32, 0.36, 0.7],
		legH: 0.42,
		legColor: '#9a6a3a',
		head: '#b8804a',
		headSize: 0.15,
		ears: 'cone',
		horns: 'antlers',
		tail: 'puff',
		speed: 1.5,
	},
};

export function actorRig(kind: ActorKind): Rig {
	return cached(`rig:${kind}`, () => {
		if (kind === 'chicken') return chicken();
		if (kind === 'frog') return frog();
		const h = HUMANS[kind];
		if (h) return human(h);
		const b = BEASTS[kind];
		if (b) return beast(b);
		return human(HUMANS.farmer!);
	});
}

export const isBeast = (kind: ActorKind) =>
	kind === 'cat' ||
	kind === 'dog' ||
	kind === 'sheep' ||
	kind === 'cow' ||
	kind === 'deer' ||
	kind === 'chicken' ||
	kind === 'frog';
