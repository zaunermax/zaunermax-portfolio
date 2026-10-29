import { DurableObject } from 'cloudflare:workers';
import { takeLimits } from './limits-store.server';
import type { Limit, RateLimitResult } from '@/quest/server/rate-limit.server';

export class QuestLimits extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.storage.sql.exec(
			'CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)',
		);
	}

	async take(limits: Limit[]): Promise<RateLimitResult> {
		return takeLimits(this.ctx.storage, limits);
	}
}
