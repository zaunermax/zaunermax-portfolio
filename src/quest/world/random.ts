/**
 * Seeded randomness shared by the compiler and the renderer. Everything here is pure, so the
 * server, the tests and the browser derive the exact same office from the same seed.
 */

/** FNV-1a, 32 bit. */
export function hashString(input: string, seed = 2166136261) {
	let h = seed >>> 0;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/** Small, fast, good-enough PRNG; returns floats in [0, 1). */
export function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export type Rng = () => number;

/** A child generator for one named purpose, so adding draws elsewhere never shifts it. */
export function rngFor(seed: number, ...keys: (string | number)[]) {
	return mulberry32(hashString(keys.join('|'), seed));
}

export const randInt = (rng: Rng, min: number, max: number) =>
	min + Math.min(max - min, Math.floor(rng() * (max - min + 1)));

export const pick = <T>(rng: Rng, items: readonly T[]): T =>
	items[Math.min(items.length - 1, Math.floor(rng() * items.length))];

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** Deterministic lattice hash in [0, 1). */
export function lattice(seed: number, x: number, y: number) {
	let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ seed;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in [0, 1). */
export function valueNoise(seed: number, x: number, y: number) {
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const tx = smooth(x - x0);
	const ty = smooth(y - y0);
	const a = lattice(seed, x0, y0);
	const b = lattice(seed, x0 + 1, y0);
	const c = lattice(seed, x0, y0 + 1);
	const d = lattice(seed, x0 + 1, y0 + 1);
	return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** Two octaves: broad patches with a little detail. */
export function fbm(seed: number, x: number, y: number) {
	return valueNoise(seed, x, y) * 0.65 + valueNoise(seed ^ 0x9e3779b9, x * 2.1, y * 2.1) * 0.35;
}
