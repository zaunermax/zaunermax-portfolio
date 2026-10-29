import type { CharacterId } from '../world/catalog';
import { hashString } from '../world/random';
import type { TimeOfDay, Vibe } from '../world/schema';
import type { FloorKind } from '../world/types';

/**
 * Colours of the office, following the SPEC palette: honey wood, teal, coral, mustard, lilac,
 * sage; darkest ≈ #2b2433, lightest ≈ #f4efe6.
 */

export type Lighting = {
	sky: string;
	/** Outside ground. */
	ground: string;
	hemiSky: string;
	hemiGround: string;
	hemi: number;
	sun: string;
	sunIntensity: number;
	/** Sun direction (towards the sun), roughly. */
	sunDir: [number, number, number];
	/** Light pooling under the windows. */
	windowLight: string;
	windowStrength: number;
	/** Glass colour of the windows (the sky seen through them). */
	windowGlass: string;
	/** Multiplier for screens, lamps and neon. */
	glow: number;
	/** Warm ceiling lights inside. */
	indoor: number;
	/** How dark the key light's shadows are (0-1). */
	shadow: number;
	/** Strength of the ambient occlusion pass (high quality). */
	ao: number;
};

export const LIGHTING: Record<TimeOfDay, Lighting> = {
	dawn: {
		sky: '#f6c9b0',
		ground: '#9fb07a',
		hemiSky: '#e6dcff',
		hemiGround: '#8a6a5c',
		hemi: 1.05,
		sun: '#ffbe8a',
		sunIntensity: 2.3,
		sunDir: [-10, 8, 2],
		windowLight: '#ffb98a',
		windowStrength: 0.42,
		windowGlass: '#ffd7bd',
		glow: 1,
		indoor: 0.35,
		shadow: 0.6,
		ao: 0.9,
	},
	day: {
		sky: '#bfe3f6',
		ground: '#9cc27a',
		hemiSky: '#dbe8ff',
		hemiGround: '#9a8270',
		hemi: 1.2,
		sun: '#ffe6bf',
		sunIntensity: 2.5,
		sunDir: [-8, 11, 1.5],
		windowLight: '#fff2c8',
		windowStrength: 0.3,
		windowGlass: '#cfeeff',
		glow: 0.9,
		indoor: 0.2,
		shadow: 0.55,
		ao: 0.9,
	},
	dusk: {
		sky: '#f0a58a',
		ground: '#7f9160',
		hemiSky: '#c9c4f0',
		hemiGround: '#6a4a50',
		hemi: 1.0,
		sun: '#ff9a62',
		sunIntensity: 2.1,
		sunDir: [10, 7, 2],
		windowLight: '#ff9a62',
		windowStrength: 0.5,
		windowGlass: '#ffbf98',
		glow: 1.15,
		indoor: 0.5,
		shadow: 0.6,
		ao: 0.95,
	},
	night: {
		sky: '#1b2140',
		ground: '#253032',
		hemiSky: '#7a84cc',
		hemiGround: '#4a3a48',
		// Bright enough that fixtures and people keep their silhouettes between the lamps.
		hemi: 0.85,
		sun: '#9fb2ff',
		sunIntensity: 0.5,
		sunDir: [-6, 10, 2],
		windowLight: '#6f86ff',
		windowStrength: 0.15,
		windowGlass: '#33407a',
		glow: 1.5,
		indoor: 1,
		shadow: 0.45,
		ao: 1,
	},
};

/** Wall paint and accent colours per company vibe. */
export const VIBES: Record<Vibe, { wall: string; trim: string; carpet: string[]; accent: string }> = {
	cozy: { wall: '#efe2cc', trim: '#b9875a', carpet: ['#5fa59c', '#6aae9f', '#589a92'], accent: '#e8836b' },
	startup: { wall: '#f1ece2', trim: '#8a96a8', carpet: ['#7b88c9', '#8693cf', '#7280bf'], accent: '#f2b84b' },
	corporate: { wall: '#e4e4dc', trim: '#6f7a8a', carpet: ['#7a8597', '#838ea0', '#717c8e'], accent: '#5f8fd0' },
	retro: { wall: '#f0dcb8', trim: '#a8643e', carpet: ['#c27d4a', '#b9734a', '#cc8853'], accent: '#5a9a8a' },
	eco: { wall: '#e6ead2', trim: '#8a9a5a', carpet: ['#8aae6a', '#93b671', '#80a462'], accent: '#d9a441' },
	neon: { wall: '#e2dcef', trim: '#5a4a8a', carpet: ['#6a5aa8', '#7462b2', '#62539e'], accent: '#ff6fb1' },
};

/** Base colours of each floor kind; carpets take the vibe's colours instead. */
export const FLOORS: Record<FloorKind, string[]> = {
	wood: ['#d9a35f', '#cf9855', '#e0ad6a', '#c98f4e'],
	carpet: ['#5fa59c', '#6aae9f', '#589a92'],
	checker: ['#f2ead8', '#7fb5ae'],
	concrete: ['#b8b4ad', '#bfbbb3', '#b1ada6'],
	raised: ['#9aa3b5', '#a6aec0', '#8c95a8'],
	cozy: ['#d98a72', '#e0957c', '#cf8068'],
	tile: ['#e8dcc6', '#dfd2ba', '#efe4d0'],
	moss: ['#93ad6a', '#9cb672', '#88a362'],
	bare: ['#cfc9bd', '#c8c2b6', '#d5cfc3'],
	/** Corridor concrete with a painted robot track (the third colour is the paint). */
	track: ['#b8b4ad', '#b1ada6', '#f2c14b'],
};

/**
 * Floor palette sets: each office gets one, so two companies never share the same planks,
 * café tiles and lounge carpet. Kinds a set leaves out keep the base colours.
 */
const FLOOR_SETS: Partial<Record<FloorKind, string[]>>[] = [
	{},
	{
		wood: ['#b98250', '#ad7646', '#c48c58', '#a66f40'],
		cozy: ['#8fbfa6', '#97c6ad', '#86b69d'],
		checker: ['#f4ecdc', '#e7a0a0'],
		tile: ['#dfe3ea', '#d5dae2', '#e8ebf0'],
	},
	{
		wood: ['#e6c48e', '#dcb983', '#edcd9a', '#d5b07a'],
		cozy: ['#b4a2d2', '#bcaad8', '#ab99ca'],
		checker: ['#f4ecdc', '#9fb0dc'],
		concrete: ['#c3bdb2', '#cac4b9', '#bbb5aa'],
	},
	{
		wood: ['#c99a6a', '#bf905f', '#d3a575', '#b88858'],
		cozy: ['#e3b06a', '#e8b874', '#dba862'],
		checker: ['#f4ecdc', '#9bc79a'],
		tile: ['#efe0d2', '#e6d5c5', '#f4e8dc'],
	},
];

/** The floor colours of an office: its palette set, and its vibe's carpet. */
export function floorColors(world: { seed: number; meta: { company: string; vibe: Vibe } }): Record<FloorKind, string[]> {
	const set = FLOOR_SETS[(hashString(world.meta.company) + world.seed) % FLOOR_SETS.length];
	return { ...FLOORS, ...set, carpet: VIBES[world.meta.vibe].carpet };
}

/** Pastel colour for a missing asset's placeholder box. */
export function placeholderColor(id: string) {
	const hues = ['#f6c6b8', '#f5dfa6', '#c8e3b4', '#b8dfe0', '#c9c8ee', '#efc4dc', '#f3d0b0'];
	return hues[hashString(id) % hues.length];
}

/** Placeholder character colours: skin, hair, top, legs. */
export const CHARACTER_COLORS: Record<CharacterId, [string, string, string, string]> = {
	max: ['#f1c7a0', '#6b4a32', '#e8836b', '#4a5a7a'],
	visitor: ['#f0c39c', '#3a3040', '#5fa59c', '#3e4a66'],
	dev_hoodie: ['#d9a07a', '#2f2a33', '#7b88c9', '#3a3f55'],
	dev_glasses: ['#f3d0b0', '#4a3a2a', '#c2b26a', '#6a5a4a'],
	dev_slacker: ['#e6b48c', '#2b2433', '#5a5f6a', '#3e4a66'],
	manager: ['#f0c8a8', '#8a6a4a', '#e8e4dc', '#3a3f55'],
	designer: ['#c98f6a', '#a84a5a', '#f2b84b', '#5a4a7a'],
	barista: ['#e9b893', '#5a3a2a', '#6a8a5a', '#4a3a33'],
	intern: ['#f3cba6', '#c2843e', '#9fd0c8', '#5a6a8a'],
	office_dog: ['#e3a35c', '#f4efe6', '#e3a35c', '#c98f4e'],
	office_cat: ['#8a8a96', '#f4efe6', '#8a8a96', '#6a6a76'],
	robo_vacuum: ['#5a6070', '#8a92a6', '#3a4050', '#ff6a5a'],
	robo_courier: ['#e8e2d6', '#54a8aa', '#3a4050', '#ffd23a'],
	robo_barista: ['#e8e2d6', '#de8271', '#3a4050', '#ffd23a'],
	plant_bot: ['#dbb659', '#7fb069', '#3a4050', '#54a8aa'],
	drone_cam: ['#667b8d', '#2b2433', '#3a4050', '#ff6a5a'],
	office_parrot: ['#5fae6a', '#e8603c', '#3f8ad0', '#e0a93a'],
	office_hamster: ['#e3a35c', '#f4efe6', '#bfe6ff', '#c98f4e'],
};
