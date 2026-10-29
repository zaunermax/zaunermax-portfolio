import type {
	Biome,
	GroundKind,
	TimeOfDay,
	TreeSpecies,
	Weather,
} from '../world/compile';

/**
 * Hand-picked palettes in the spirit of 2004 Azeroth: saturated, warm, painterly.
 * Colours are sRGB hex; three converts them to linear when they become THREE.Color.
 */

export type BiomePalette = {
	ground: Record<GroundKind, [string, string]>;
	lakebed: string;
	water: { shallow: string; deep: string; foam: string };
	/** The mountain rim around the valley: foot, slope, peak. */
	rim: [string, string, string];
	tuft: [string, string];
	flowers: string[];
	canopy: Partial<Record<TreeSpecies, [string, string]>>;
	trunk: string;
	rock: [string, string];
	/** Snow on roofs, canopies and peaks. */
	snow: boolean;
	/** How much the sky and fog lean toward this tint. */
	airTint: string;
	airTintAmount: number;
};

const defaultCanopy: Record<TreeSpecies, [string, string]> = {
	oak: ['#3f8f2a', '#6bb83a'],
	pine: ['#1f5a32', '#2f7a3e'],
	birch: ['#7fbf3f', '#b4dc5a'],
	autumn: ['#d9622b', '#f2a33a'],
	palm: ['#3f9a3a', '#7cc44a'],
	dead: ['#6b5440', '#8a7058'],
	mushroom: ['#c8322e', '#f0e4d0'],
};

export const BIOMES: Record<Biome, BiomePalette> = {
	meadow: {
		ground: {
			grass: ['#5da83a', '#6cb43f'],
			lush: ['#4a9a30', '#57a536'],
			dry: ['#8ab448', '#9cbd4f'],
			dirt: ['#a37a4c', '#b48a58'],
			cobble: ['#a39a8a', '#8e8678'],
			plaza: ['#b8a888', '#a89878'],
			sand: ['#dcc58e', '#e6d29c'],
			water: ['#6b7a4a', '#5b6a40'],
			rock: ['#8a8176', '#9b9284'],
		},
		lakebed: '#6b7a4a',
		water: { shallow: '#4fc3c9', deep: '#1f6fa8', foam: '#e8fbff' },
		rim: ['#4f8f34', '#5f7d4a', '#9aa3a8'],
		tuft: ['#4f9c2c', '#8cc84a'],
		flowers: ['#f2e14a', '#ffffff', '#e9708f', '#a98bf0'],
		canopy: {},
		trunk: '#6b4a2e',
		rock: ['#8d877d', '#a8a196'],
		snow: false,
		airTint: '#ffffff',
		airTintAmount: 0,
	},
	autumn: {
		ground: {
			grass: ['#9a9a3a', '#a8a242'],
			lush: ['#7f8f34', '#8c9a38'],
			dry: ['#c2a046', '#ccaa4e'],
			dirt: ['#9b6c42', '#a8784c'],
			cobble: ['#9d9282', '#8a8070'],
			plaza: ['#b39f80', '#a28f70'],
			sand: ['#d8bf86', '#e0c990'],
			water: ['#6b6a40', '#5e5c38'],
			rock: ['#8a7d70', '#998b7c'],
		},
		lakebed: '#6b6a40',
		water: { shallow: '#4fb3b0', deep: '#235f8a', foam: '#f5f2e0' },
		rim: ['#8a7a34', '#7a6a48', '#a39a90'],
		tuft: ['#b08a30', '#d6a23e'],
		flowers: ['#f2b84a', '#d9622b', '#f5e6c8'],
		canopy: { oak: ['#c8501f', '#f0a030'], birch: ['#e3b23c', '#f5d660'] },
		trunk: '#5e3f28',
		rock: ['#8a8076', '#a39a8e'],
		snow: false,
		airTint: '#ffcf8a',
		airTintAmount: 0.18,
	},
	winter: {
		ground: {
			grass: ['#e9eff6', '#dfe8f2'],
			lush: ['#d4e0ee', '#ccd9e9'],
			dry: ['#f4f7fb', '#eef3f9'],
			dirt: ['#9a8d82', '#a89c90'],
			cobble: ['#8f97a3', '#7f8794'],
			plaza: ['#b7bec9', '#a9b1bd'],
			sand: ['#c9d3dc', '#d5dde5'],
			water: ['#5d7088', '#526479'],
			rock: ['#7d8794', '#8d97a4'],
		},
		lakebed: '#5d7088',
		water: { shallow: '#8fd3e6', deep: '#3a77a6', foam: '#ffffff' },
		rim: ['#c9d6e4', '#9aa8b8', '#ffffff'],
		tuft: ['#b9c8d6', '#e6eef6'],
		flowers: ['#bfe3ff', '#ffffff'],
		canopy: {
			oak: ['#3f6f4a', '#e9f1f8'],
			birch: ['#8aa6a0', '#eef4f9'],
			autumn: ['#a85a3a', '#eef4f9'],
		},
		trunk: '#5b4636',
		rock: ['#7d8794', '#9aa4b0'],
		snow: true,
		airTint: '#cfe3ff',
		airTintAmount: 0.3,
	},
	desert: {
		ground: {
			grass: ['#e2bf7a', '#e9c886'],
			lush: ['#c9b062', '#d2b96a'],
			dry: ['#efd096', '#f2d8a2'],
			dirt: ['#c48b56', '#cf9862'],
			cobble: ['#c2a27e', '#b0906c'],
			plaza: ['#d8b88c', '#c9a87c'],
			sand: ['#f0dba6', '#f5e3b4'],
			water: ['#8a7a4a', '#7a6a40'],
			rock: ['#b5714a', '#c58058'],
		},
		lakebed: '#8a7a4a',
		water: { shallow: '#3fd0c0', deep: '#1a8aa0', foam: '#f7fff7' },
		rim: ['#d9a86a', '#c47a4a', '#e8c39a'],
		tuft: ['#a8a04a', '#c9b45a'],
		flowers: ['#f25a7a', '#f2e14a'],
		canopy: { oak: ['#5f8f2a', '#8cae3a'], palm: ['#3f9a3a', '#86c84a'] },
		trunk: '#7a5838',
		rock: ['#b5714a', '#d08a5c'],
		snow: false,
		airTint: '#ffd9a0',
		airTintAmount: 0.3,
	},
	swamp: {
		ground: {
			grass: ['#4f6b34', '#58763a'],
			lush: ['#3f5f2f', '#476a33'],
			dry: ['#6b7a3a', '#748440'],
			dirt: ['#5a4a33', '#66553b'],
			cobble: ['#6f6f62', '#5f5f54'],
			plaza: ['#7a7560', '#6a6552'],
			sand: ['#7a7a52', '#86865a'],
			water: ['#3a4a2c', '#334226'],
			rock: ['#5f625a', '#6e7168'],
		},
		lakebed: '#3a4a2c',
		water: { shallow: '#5f8a5a', deep: '#2f4f3a', foam: '#b8d8a0' },
		rim: ['#3f5a2f', '#4a5a40', '#7a8478'],
		tuft: ['#5f7f2f', '#7f9a3f'],
		flowers: ['#d8f06a', '#9a7af0'],
		canopy: {
			oak: ['#2f5f2a', '#4f7f34'],
			mushroom: ['#8a4ac8', '#d8c8f0'],
			dead: ['#4a3e30', '#5e5040'],
		},
		trunk: '#4a3a28',
		rock: ['#5f625a', '#7a7d74'],
		snow: false,
		airTint: '#a8c890',
		airTintAmount: 0.35,
	},
	highlands: {
		ground: {
			grass: ['#6f9a4a', '#7aa452'],
			lush: ['#5a8a45', '#64934b'],
			dry: ['#9a8a6a', '#a08f6c'],
			dirt: ['#8a6a4a', '#977654'],
			cobble: ['#8f8f88', '#7f7f78'],
			plaza: ['#a8a08c', '#98907c'],
			sand: ['#c9b98e', '#d3c49a'],
			water: ['#5a6a4a', '#4f5e40'],
			rock: ['#8c8f8a', '#9ea19b'],
		},
		lakebed: '#5a6a4a',
		water: { shallow: '#4fa8c0', deep: '#24597f', foam: '#f0f8ff' },
		rim: ['#6a8a4a', '#7a7a74', '#e8eef2'],
		tuft: ['#7a9a4a', '#a88ab0'],
		flowers: ['#b07ad0', '#e8d0f0', '#f2e14a'],
		canopy: {},
		trunk: '#5e4430',
		rock: ['#8c8f8a', '#aab0aa'],
		snow: false,
		airTint: '#d8e4f0',
		airTintAmount: 0.15,
	},
};

export function canopyColors(biome: Biome, species: TreeSpecies): [string, string] {
	return BIOMES[biome].canopy[species] ?? defaultCanopy[species];
}

export type Lighting = {
	skyTop: string;
	skyHorizon: string;
	skyBottom: string;
	fog: string;
	fogNear: number;
	fogFar: number;
	sunColor: string;
	sunIntensity: number;
	/** Direction the light comes from (normalised later). */
	sunDir: [number, number, number];
	hemiSky: string;
	hemiGround: string;
	hemiIntensity: number;
	/** 0 by day, 1 at night: windows, lamps and the forge glow. */
	glow: number;
	stars: boolean;
	moon: boolean;
	cloud: string;
	/** Far mountains blend toward this. */
	haze: string;
};

export const LIGHTING: Record<TimeOfDay, Lighting> = {
	dawn: {
		skyTop: '#5f7fc8',
		skyHorizon: '#f7b98a',
		skyBottom: '#e8a07a',
		fog: '#e9b894',
		fogNear: 28,
		fogFar: 120,
		sunColor: '#ffc08a',
		sunIntensity: 1.9,
		sunDir: [0.9, 0.35, 0.2],
		hemiSky: '#c9b8f0',
		hemiGround: '#6b5a4a',
		hemiIntensity: 1.25,
		glow: 0.45,
		stars: false,
		moon: false,
		cloud: '#ffd9c8',
		haze: '#d8a8a0',
	},
	day: {
		skyTop: '#3a86e0',
		skyHorizon: '#bfe4f7',
		skyBottom: '#d8eef7',
		fog: '#c6e3f2',
		fogNear: 30,
		fogFar: 140,
		sunColor: '#fff1d6',
		sunIntensity: 2.0,
		sunDir: [0.55, 0.85, 0.35],
		hemiSky: '#cfe8ff',
		hemiGround: '#6a7a3a',
		hemiIntensity: 1.15,
		glow: 0,
		stars: false,
		moon: false,
		cloud: '#ffffff',
		haze: '#9fc4dc',
	},
	dusk: {
		skyTop: '#33397f',
		skyHorizon: '#f08a5a',
		skyBottom: '#c2604a',
		fog: '#c9806a',
		fogNear: 26,
		fogFar: 115,
		sunColor: '#ff9a5a',
		sunIntensity: 2.1,
		sunDir: [-0.85, 0.28, 0.3],
		hemiSky: '#9a8ad8',
		hemiGround: '#7a5a5a',
		hemiIntensity: 1.3,
		glow: 0.75,
		stars: false,
		moon: false,
		cloud: '#ffb08a',
		haze: '#a86a7a',
	},
	night: {
		skyTop: '#060c26',
		skyHorizon: '#26407a',
		skyBottom: '#1a2a52',
		fog: '#1c2c55',
		fogNear: 22,
		fogFar: 95,
		sunColor: '#a8c0ff',
		sunIntensity: 1.15,
		sunDir: [-0.4, 0.75, -0.5],
		hemiSky: '#5a74c0',
		hemiGround: '#2a3450',
		hemiIntensity: 1.05,
		glow: 1,
		stars: true,
		moon: true,
		cloud: '#3a4a7a',
		haze: '#24345e',
	},
};

export const WEATHER_FOG: Record<
	Weather,
	{ near: number; far: number; tint: string; amount: number }
> = {
	clear: { near: 1, far: 1, tint: '#ffffff', amount: 0 },
	rain: { near: 0.6, far: 0.6, tint: '#7a8696', amount: 0.45 },
	snow: { near: 0.65, far: 0.65, tint: '#e6eef8', amount: 0.4 },
	fog: { near: 0.25, far: 0.38, tint: '#cfd6dc', amount: 0.55 },
	fireflies: { near: 1, far: 1, tint: '#ffffff', amount: 0 },
	leaves: { near: 1, far: 1, tint: '#ffffff', amount: 0 },
};

export const ROOF_COLORS: Record<string, string> = {
	red: '#b8432f',
	blue: '#3f62ad',
	slate: '#56606f',
	thatch: '#cfa64a',
	rose: '#db7093',
};

/** Shared signature colours. */
export const MAX_PINK = '#db7093';
export const GOLD = '#f2c94c';
