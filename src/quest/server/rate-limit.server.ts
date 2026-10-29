export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };
export type Limit = { key: string; limit: number; windowMs: number };
export type TakeLimits = (limits: Limit[]) => Promise<RateLimitResult>;

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
	const { env } = await import('cloudflare:workers');
	return env.QUEST_LIMITS.getByName('global').take([{ key, limit, windowMs }]);
}

/** Best-effort client address, only used for quotas. Cloudflare's header takes precedence. */
export function clientKey(request: Request) {
	return request.headers.get('CF-Connecting-IP')?.trim() ||
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

/** Per-instance counters used only by the forge's visitor-attempt budget. */
export function createMemoryLimiter() {
	const windows = new Map<string, { count: number; resetAt: number }>();
	return async (key: string, limit: number, windowMs: number): Promise<RateLimitResult> => {
		const now = Date.now();
		for (const [key, value] of windows) if (value.resetAt <= now) windows.delete(key);
		const current = windows.get(key);
		if (current && current.count >= limit) return { ok: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
		windows.set(key, { count: (current?.count ?? 0) + 1, resetAt: current?.resetAt ?? now + windowMs });
		return { ok: true };
	};
}
