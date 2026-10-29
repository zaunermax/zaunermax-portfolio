import { it } from 'vitest';
import { writeReport } from './layout';

it('writes the layout report', () => {
	const seeds = process.env.SEEDS
		? process.env.SEEDS.split(',').map(Number)
		: [850, ...Array.from({ length: 23 }, (_, i) => i * 17 + 3)];
	console.log(JSON.stringify(writeReport(seeds)));
});
