// Screenshots of /lab/1-quest offices for reviews.
//
//   node tools/quest-voxel/review/shoot.mjs --base http://127.0.0.1:3217 --out /tmp/shots \
//     --seeds 850,3,20 --views overview,play,desks [--size 1440x900] [--dist 19] [--hud hide]
//
// Views: overview (whole floor from above), play (the normal camera at the spawn next to Max),
// or any zone kind (desks, games, lounge, meetup, coffee, kitchen, library, garden, ...), which
// starts the visitor in that room with the camera pulled in. `--hud hide` drops the overlays
// (minimap, dock, chat) for a clean look at the floor. Each run uses its own headless
// browser, so several reviewers can shoot at the same time against one server.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const args = Object.fromEntries(
	process.argv.slice(2).reduce((out, a, i, all) => (a.startsWith('--') ? [...out, [a.slice(2), all[i + 1]]] : out), []),
);
const base = args.base ?? 'http://127.0.0.1:3217';
const out = args.out ?? 'tools/quest-voxel/review/out/shots';
const seeds = (args.seeds ?? '850').split(',');
const views = (args.views ?? 'overview,play').split(',');
const [width, height] = (args.size ?? '1440x900').split('x').map(Number);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
// Skip the once-per-session build replay.
await context.addInitScript(() => sessionStorage.setItem('quest-v2-intro-seen', '1'));
const page = await context.newPage();
for (const seed of seeds)
	for (const view of views) {
		const q = new URLSearchParams({ seed });
		if (view === 'overview') q.set('view', 'overview');
		else if (view !== 'play') {
			q.set('at', view);
			q.set('dist', args.dist ?? '19');
		}
		await page.goto(`${base}/lab/1-quest?${q}`, { waitUntil: 'domcontentloaded' });
		await page.waitForSelector('[data-ready="true"]', { timeout: 120_000 });
		// The big welcome title shrinks away after 5.5 s.
		await page.waitForTimeout(Number(args.wait ?? 7000));
		if (args.hud === 'hide') await page.addStyleTag({ content: '[data-hud] { visibility: hidden !important; }' });
		const file = `${out}/seed${seed}-${view}.png`;
		await page.screenshot({ path: file });
		console.log(file);
	}
await browser.close();
