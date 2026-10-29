import { describe, expect, it } from 'vitest';
import { compileWorld } from './compile';
import { defaultBrief, DEFAULT_SEED } from './default-world';
import { briefForSeed, offlineBriefs } from './offline-briefs';
import { sanitizeBrief } from './sanitize';
import { LIMITS } from './schema';
import { checkWorld } from './validate';

describe('offline briefs', () => {
	it('keeps the canonical office on the default seed and picks the same brief for a seed every time', () => {
		expect(briefForSeed(DEFAULT_SEED)).toBe(defaultBrief);
		for (const seed of [1, 11, 37, 4242]) expect(briefForSeed(seed)).toBe(briefForSeed(seed));
	});

	it('spreads seeds over the whole pool of 4 to 6 companies', () => {
		expect(offlineBriefs.length).toBeGreaterThanOrEqual(4);
		expect(offlineBriefs.length).toBeLessThanOrEqual(6);
		const companies = new Set(Array.from({ length: 80 }, (_, i) => briefForSeed(i * 31 + 1).company));
		expect(companies.size).toBe(offlineBriefs.length);
		expect(new Set(offlineBriefs.map((b) => b.company)).size).toBe(offlineBriefs.length);
	});

	it('writes every brief within the limits the model is held to', () => {
		for (const brief of offlineBriefs) {
			const clean = sanitizeBrief(brief);
			expect(clean.company).toBe(brief.company);
			expect(clean.tagline).toBe(brief.tagline);
			expect(clean.event).toEqual(brief.event);
			expect(clean.cast.map((c) => [c.name, c.line])).toEqual(brief.cast.map((c) => [c.name, c.line]));
			expect(clean.cast.length).toBeGreaterThanOrEqual(LIMITS.minCast);
		}
	});

	it('compiles every brief into a valid office on a few floorplans', () => {
		for (const brief of offlineBriefs)
			for (const seed of [3, 11, 37, 101]) {
				const world = compileWorld(brief, seed);
				expect(checkWorld(world), `${brief.company} seed ${seed}`).toEqual([]);
				expect(world.npcs.filter((n) => n.interactive && n.appearance).length).toBeGreaterThanOrEqual(6);
			}
	});
});
