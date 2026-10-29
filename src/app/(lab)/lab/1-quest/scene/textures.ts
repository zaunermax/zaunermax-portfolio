import * as THREE from 'three';
import { fbm, lattice, mulberry32 } from '../world/random';
import type { CompiledWorld, FloorKind, Room } from '../world/types';
import { floorColors } from './palette';

/**
 * Pixel-art canvas textures: 16 pixels per tile, so a floor pixel is exactly one voxel wide.
 * Everything is drawn from the world's seed, so the same office always gets the same planks.
 */

export const PX = 16;

function hexToRgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(hex: string, factor: number) {
	const [r, g, b] = hexToRgb(hex);
	const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
	return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/** Paints one room's floor into the image, pixel by pixel. */
function paintRoom(
	data: ImageData,
	world: CompiledWorld,
	room: Room,
	colors: Record<FloorKind, string[]>,
) {
	const seed = world.seed + room.index * 101;
	const rng = mulberry32(seed);
	const palette = colors[room.floor];
	const x0 = room.x * PX;
	const y0 = room.y * PX;
	const w = room.w * PX;
	const h = room.h * PX;
	// Planks get a length and colour per row segment.
	const plankBreak = new Map<number, number[]>();
	const plankColor = (row: number, px: number) => {
		let breaks = plankBreak.get(row);
		if (!breaks) {
			breaks = [];
			let at = -Math.floor(rng() * 24);
			while (at < w) {
				breaks.push(at);
				at += 18 + Math.floor(rng() * 34);
			}
			plankBreak.set(row, breaks);
		}
		let i = breaks.length - 1;
		while (i > 0 && breaks[i] > px) i--;
		return { index: i, start: breaks[i] };
	};

	for (let py = 0; py < h; py++)
		for (let px = 0; px < w; px++) {
			const gx = x0 + px;
			const gy = y0 + py;
			const tx = Math.floor(gx / PX);
			const ty = Math.floor(gy / PX);
			const lx = gx % PX;
			const ly = gy % PX;
			let base = palette[0];
			let f = 1;
			switch (room.floor) {
				case 'wood': {
					const row = Math.floor(py / 4);
					const plank = plankColor(row, px);
					base = palette[Math.floor(lattice(seed, row, plank.index) * palette.length)];
					if (py % 4 === 3) f *= 0.82;
					if (px === plank.start) f *= 0.86;
					if (lattice(seed + 7, gx >> 1, gy) < 0.08) f *= 0.94;
					break;
				}
				case 'carpet':
				case 'cozy': {
					const check = (tx + ty) % 2;
					base = palette[check ? 1 : 0];
					if (room.floor === 'cozy' && (lx + ly) % 6 === 0) f *= 0.93;
					if (lx === 0 || ly === 0) f *= 0.95;
					break;
				}
				case 'checker':
					base = palette[(Math.floor(gx / 8) + Math.floor(gy / 8)) % 2];
					break;
				case 'raised':
					base = palette[(tx * 3 + ty) % palette.length];
					if (lx === 0 || ly === 0) f *= 0.72;
					else if (lx % 4 === 2 && ly % 4 === 2) f *= 0.84;
					break;
				case 'tile':
					base = palette[Math.floor(lattice(seed, gx >> 3, gy >> 3) * palette.length)];
					if (gx % 8 === 0 || gy % 8 === 0) f *= 0.86;
					break;
				case 'moss':
					base = palette[Math.floor(lattice(seed, gx >> 1, gy >> 1) * palette.length)];
					if (lattice(seed + 3, gx, gy) < 0.06) base = '#c8d98a';
					break;
				case 'track': {
					// A painted lane down the corridor's long axis for the courier robots, dashed.
					base = palette[Math.floor(lattice(seed, gx >> 2, gy >> 2) * 2)];
					const along = room.h > room.w ? py : px;
					const across = room.h > room.w ? px - Math.floor(w / 2) : py - Math.floor(h / 2);
					if ((across === -1 || across === 0) && along % 24 < 14) base = palette[2];
					if (lattice(seed + 5, gx, gy) < 0.04) f *= 0.88;
					break;
				}
				case 'concrete':
				case 'bare':
					base = palette[Math.floor(lattice(seed, gx >> 2, gy >> 2) * palette.length)];
					if (lattice(seed + 5, gx, gy) < 0.04) f *= 0.88;
					if (room.floor === 'bare' && (gx + gy) % 24 === 0 && lattice(seed, tx, ty) < 0.3) f *= 0.9;
					break;
			}
			// Per-voxel jitter plus soft wear patches.
			f *= 0.96 + lattice(seed + 11, gx, gy) * 0.08;
			f *= 0.95 + fbm(seed, gx / 40, gy / 40) * 0.08;
			// A darker threshold where rooms meet.
			if (px === 0 || py === 0 || px === w - 1 || py === h - 1) f *= 0.9;
			const [r, g, b] = hexToRgb(base);
			const o = ((gy * data.width) + gx) * 4;
			data.data[o] = Math.min(255, r * f);
			data.data[o + 1] = Math.min(255, g * f);
			data.data[o + 2] = Math.min(255, b * f);
			data.data[o + 3] = 255;
		}
}

/** One texture for the whole floor, mapped 1:1 onto the grid. */
export function paintFloor(world: CompiledWorld, canvas?: HTMLCanvasElement) {
	const c = canvas ?? document.createElement('canvas');
	c.width = world.width * PX;
	c.height = world.height * PX;
	const ctx = c.getContext('2d')!;
	const data = ctx.createImageData(c.width, c.height);
	const colors = floorColors(world);
	for (const room of world.rooms) {
		// The game corner and phone booths get a contrasting carpet.
		const own =
			room.kind === 'games'
				? { ...colors, carpet: ['#c27d6a', '#cc8873', '#b87262'] }
				: room.kind === 'phone'
					? { ...colors, carpet: ['#9a86c0', '#a390c8', '#9280b8'] }
					: colors;
		paintRoom(data, world, room, own);
	}
	ctx.putImageData(data, 0, 0);
	return c;
}

export function canvasTexture(canvas: HTMLCanvasElement) {
	const texture = new THREE.CanvasTexture(canvas);
	texture.magFilter = THREE.NearestFilter;
	texture.minFilter = THREE.NearestMipmapLinearFilter;
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

// ---------------------------------------------------------------------------------------------
// Pixel icons for little bubbles above people (hearts, notes, coffee, zzz…)

const ICONS: Record<string, { colors: Record<string, string>; rows: string[] }> = {
	heart: {
		colors: { r: '#ff6f8a', w: '#ffd0da', k: '#7a2f45' },
		rows: [
			'.kk..kk.',
			'krrkkrrk',
			'krwrrrrk',
			'krrrrrrk',
			'.krrrrk.',
			'..krrk..',
			'...kk...',
		],
	},
	note: {
		colors: { b: '#4a5ad0', k: '#2b2433' },
		rows: ['...kkkk', '...kbbk', '...k..k', '...k..k', '.kkk.kk', 'kbbk.kk', '.kk....'],
	},
	coffee: {
		colors: { w: '#f4efe6', c: '#8a5a32', k: '#2b2433', s: '#d8d2c8' },
		rows: ['.s.s..', 's.s...', 'kkkkk.', 'kwccwkk', 'kwwwwk.k', 'kwwwwkk', '.kkkk..'],
	},
	zzz: {
		colors: { z: '#8aa0ff', k: '#2b2433' },
		rows: ['....zzz', '.....z.', '....zzz', 'zzzz...', '...z...', '..z....', 'zzzz...'],
	},
	bang: {
		colors: { y: '#ffd23a', k: '#2b2433' },
		rows: ['.kk.', 'kyyk', 'kyyk', 'kyyk', '.kk.', '....', '.kk.', 'kyyk', '.kk.'],
	},
	sparkle: {
		colors: { y: '#fff3a6', w: '#ffffff' },
		rows: ['...y...', '...y...', '..ywy..', 'yywwwyy', '..ywy..', '...y...', '...y...'],
	},
	dots: {
		colors: { k: '#2b2433', w: '#f4efe6' },
		rows: ['wwwwwwwww', 'wkwwkwwkw', 'wwwwwwwww'],
	},
};
export type IconName = keyof typeof ICONS;

const iconCache = new Map<string, THREE.Texture>();

/** A crisp sprite texture for a pixel icon. */
export function iconTexture(name: IconName) {
	const hit = iconCache.get(name);
	if (hit) return hit;
	const icon = ICONS[name];
	const w = Math.max(...icon.rows.map((r) => r.length));
	const h = icon.rows.length;
	const size = Math.max(w, h);
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	const ox = Math.floor((size - w) / 2);
	const oy = Math.floor((size - h) / 2);
	icon.rows.forEach((row, y) =>
		[...row].forEach((ch, x) => {
			const color = icon.colors[ch];
			if (!color) return;
			ctx.fillStyle = color;
			ctx.fillRect(ox + x, oy + y, 1, 1);
		}),
	);
	const texture = new THREE.CanvasTexture(canvas);
	texture.magFilter = THREE.NearestFilter;
	texture.minFilter = THREE.NearestFilter;
	texture.colorSpace = THREE.SRGBColorSpace;
	iconCache.set(name, texture);
	return texture;
}

export { shade };
