import { DurableObject } from 'cloudflare:workers';
import { createWorldService, defaultWorld, parseWorld } from '@/quest/world/store.server';
import { createForge } from '@/quest/world/forge.server';
import { generateWorld } from '@/quest/world/generate.server';
import { createMemoryLimiter } from '@/quest/server/rate-limit.server';
import seedWorld from '@/quest/world/seed-world.json';
import { createDurableWorldStore } from './world-store.server';
import { GET, POST, type WorldDependencies } from './handlers/quest-world.server';

export class QuestForge extends DurableObject<Env> {
	private readonly deps: WorldDependencies;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		const store = createDurableWorldStore(ctx.storage);
		// Initialization is bounded; generation never holds blockConcurrencyWhile.
		ctx.blockConcurrencyWhile(async () => {
			if ((await store.readCurrent()) === null) {
				const seed = parseWorld(seedWorld) ?? defaultWorld();
				ctx.storage.sql.exec(
					'INSERT OR IGNORE INTO quest_state (key, value) VALUES (?, ?)',
					'current',
					JSON.stringify(seed),
				);
			}
		});
		const world = createWorldService(store);
		this.deps = {
			world,
			forge: createForge(world),
			rateLimit: createMemoryLimiter(),
			waitUntil: (work) => this.ctx.waitUntil(work),
			generate: generateWorld,
		};
	}

	async fetch(request: Request): Promise<Response> {
		const fake = import.meta.env.DEV && process.env.QUEST_FAKE_GENERATOR === '1';
		if (fake) {
			const { fakeGenerator } = await import('./fake-generator.server');
			this.deps.generate = fakeGenerator;
		}
		if (request.method === 'GET' || request.method === 'POST') {
			const response = await (request.method === 'GET' ? GET : POST)(request, this.deps);
			if (fake) response.headers.set('X-Quest-Generator', 'fake');
			return response;
		}
		return new Response('Method not allowed', {
			status: 405,
			headers: { Allow: 'GET, POST' },
		});
	}
}
