/*
 * Layout report: ASCII floorplans plus "does this make sense" metrics for compiled offices.
 *
 *   pnpm vitest run --config tools/quest-voxel/review/vitest.layout.mts
 *   SEEDS=3,11,37 OUT=/tmp/me.txt pnpm vitest run --config tools/quest-voxel/review/vitest.layout.mts
 *
 * Writes OUT, by default tools/quest-voxel/review/out/layout.txt (and prints a summary). Each seed uses the same
 * offline brief that /?seed=N shows, so the map matches the browser.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileWorld } from '@/quest/world/compile';
import { briefForSeed } from '@/quest/world/offline-briefs';
import { checkWorld } from '@/quest/world/validate';
import { cellIndex } from '@/quest/world/furnish';
import { CLOSED_ZONES, planFloor } from '@/quest/world/floorplan';
import type { CompiledWorld } from '@/quest/world/types';

const ZONE_CHAR: Record<string, string> = {
	reception: 'r',
	desks: 'd',
	meetup: 'm',
	library: 'l',
	server: 's',
	coffee: 'c',
	kitchen: 'k',
	lounge: 'u',
	games: 'g',
	meeting: 'e',
	phone: 'p',
	print: 'x',
	garden: 'n',
	hall: ',',
};

const PIECE: [RegExp, string][] = [
	[/^big_desk_max$/, 'M'],
	[/^desk_/, 'D'],
	[/chair|stool|beanbag/, 'h'],
	[/^sofa_|armchair/, 'S'],
	[/^plant_|^planter_/, 'P'],
	[/table|^meeting_|^dining_/, 'T'],
	[/bookshelf/, 'B'],
	[/server_rack/, 'R'],
	[/counter|fridge|vending/, 'C'],
	[/^rug_/, '~'],
	[/phone_booth/, 'O'],
	[/stage_block/, '='],
	[/./, 'o'],
];

const PLANT = /^plant_(?!desk|pothos)/;
const SOFA = /^sofa_|^armchair$/;

function touchesWall(world: CompiledWorld, x: number, y: number) {
	const room = world.roomAt[cellIndex(x, y)];
	for (const [dx, dy] of [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1],
	]) {
		const nx = x + dx;
		const ny = y + dy;
		if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) return true;
		if (world.roomAt[cellIndex(nx, ny)] !== room) return true;
	}
	return false;
}

export function metrics(world: CompiledWorld) {
	const rooms = world.rooms.filter((r) => r.kind && !r.hall);
	const area = (r: (typeof rooms)[number]) => {
		let n = 0;
		for (let y = r.y; y < r.y + r.h; y++)
			for (let x = r.x; x < r.x + r.w; x++) if (world.roomAt[cellIndex(x, y)] === r.index) n++;
		return n;
	};
	let inside = 0;
	for (let i = 0; i < world.roomAt.length; i++) if (world.roomAt[i] >= 0) inside++;
	const desks = rooms.find((r) => r.kind === 'desks');
	const largest = [...rooms].sort((a, b) => area(b) - area(a))[0];
	const leisure = rooms.filter((r) => r.kind === 'games' || r.kind === 'lounge');
	const strayPlants = world.furniture.filter(
		(f) => PLANT.test(f.asset) && !touchesWall(world, f.x, f.y),
	).length;
	const plants = world.furniture.filter((f) => PLANT.test(f.asset)).length;
	const floatingSofas = world.furniture.filter((f) => SOFA.test(f.asset) && !touchesWall(world, f.x, f.y)).length;
	// Walled-off rooms (server, meeting, phone, print, library) you must walk through to reach others.
	const plan = planFloor(world.seed);
	const closedPassages = rooms.filter((r) => {
		if (!CLOSED_ZONES.has(r.kind as never)) return false;
		const seen = new Set([r.index === 0 ? 1 : 0]);
		const queue = [...seen];
		while (queue.length) {
			const i = queue.pop()!;
			for (const d of plan.doors) {
				if (!d.rooms.includes(i)) continue;
				const j = d.rooms[0] === i ? d.rooms[1] : d.rooms[0];
				if (j === r.index || seen.has(j)) continue;
				seen.add(j);
				queue.push(j);
			}
		}
		return seen.size < world.rooms.length - 1;
	}).map((r) => r.kind);
	const deskTiles = desks ? world.furniture.filter((f) => f.room === desks.index && /^desk_/.test(f.asset)).length : 0;
	return {
		insideCells: inside,
		rooms: rooms.length,
		desksArea: desks ? area(desks) : 0,
		largest: largest ? `${largest.kind}:${area(largest)}` : '',
		desksIsLargest: !!desks && largest === desks,
		maxLeisure: Math.max(0, ...leisure.map(area)),
		plants,
		strayPlants,
		floatingSofas,
		closedPassages: closedPassages.join('+'),
		deskDensity: desks ? Math.round((deskTiles / area(desks)) * 100) / 100 : 0,
		problems: checkWorld(world).length,
		rulePenalty: planFloor(world.seed).penalty,
	};
}

export function asciiMap(world: CompiledWorld) {
	const grid: string[][] = Array.from({ length: world.height }, () => Array(world.width).fill(' '));
	for (let y = 0; y < world.height; y++)
		for (let x = 0; x < world.width; x++) {
			const ri = world.roomAt[cellIndex(x, y)];
			const room = ri >= 0 ? world.rooms[ri] : null;
			grid[y][x] = room ? (room.hall ? ',' : (ZONE_CHAR[room.kind ?? ''] ?? '?')) : ' ';
		}
	for (const f of world.furniture) {
		const ch = PIECE.find(([re]) => re.test(f.asset))![1];
		for (let y = f.y; y < f.y + f.d; y++)
			for (let x = f.x; x < f.x + f.w; x++) if (f.blocks || grid[y][x] === grid[y][x].toLowerCase()) grid[y][x] = ch;
	}
	return grid.map((row) => row.join('')).join('\n');
}

export function report(seeds: number[]) {
	const lines: string[] = [];
	const rows: ReturnType<typeof metrics>[] = [];
	for (const seed of seeds) {
		const world = compileWorld(briefForSeed(seed), seed);
		const m = metrics(world);
		rows.push(m);
		lines.push(`=== seed ${seed}  ${world.meta.company}  ${world.width}x${world.height}`);
		lines.push(
			world.rooms
				.filter((r) => r.kind)
				.map((r) => `${r.kind}(${r.w}x${r.h})`)
				.join(' '),
		);
		lines.push(JSON.stringify(m));
		lines.push(asciiMap(world));
		lines.push('');
	}
	const sum = (k: keyof ReturnType<typeof metrics>) => rows.reduce((s, r) => s + Number(r[k]), 0);
	const summary = {
		seeds: seeds.length,
		avgInsideCells: Math.round(sum('insideCells') / rows.length),
		desksLargestShare: `${rows.filter((r) => r.desksIsLargest).length}/${rows.length}`,
		avgMaxLeisure: Math.round(sum('maxLeisure') / rows.length),
		strayPlants: `${sum('strayPlants')}/${sum('plants')}`,
		floatingSofas: sum('floatingSofas'),
		closedPassages: rows.filter((r) => r.closedPassages).length,
		deskDensity: `${Math.min(...rows.map((r) => r.deskDensity))}..${Math.max(...rows.map((r) => r.deskDensity))}`,
		problems: sum('problems'),
	};
	return { text: lines.join('\n'), summary };
}

export const LEGEND = `Legend: floor letters = zone (r reception, d desks, m meetup, l library, s server, c coffee, k kitchen,
u lounge, g games, e meeting, p phone, x print, n garden, ',' hall, blank = outside the building).
Pieces: M Max's desk, D desk, h chair/stool/beanbag, S sofa/armchair, P plant/planter, T table, B bookshelf,
R server rack, C counter/fridge/vending, ~ rug, O phone booth, = stage, o other.`;

export function writeReport(seeds: number[], file = process.env.OUT) {
	const { text, summary } = report(seeds);
	const dir = fileURLToPath(new URL('./out/', import.meta.url));
	mkdirSync(dir, { recursive: true });
	writeFileSync(file ?? `${dir}layout.txt`, `${LEGEND}\n\nSummary: ${JSON.stringify(summary)}\n\n${text}`);
	return summary;
}
