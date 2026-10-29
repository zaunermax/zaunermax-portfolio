import 'server-only';

/**
 * Fixed-window counters kept in memory. Good enough for the spike and a single instance;
 * production on serverless needs a shared store (e.g. Upstash Redis) behind the same API.
 */
const windows = new Map<string, { resetAt: number; count: number }>();

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
	const now = Date.now();
	const current = windows.get(key);
	if (!current || current.resetAt <= now) {
		windows.set(key, { resetAt: now + windowMs, count: 1 });
		return { ok: true };
	}
	if (current.count >= limit) {
		return { ok: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
	}
	current.count++;
	return { ok: true };
}

/** Best-effort client address for rate limiting; never use it for anything else. */
export function clientKey(request: Request) {
	const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
	return forwarded || request.headers.get('x-real-ip') || 'unknown';
}
