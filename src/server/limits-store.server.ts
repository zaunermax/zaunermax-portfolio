import type { Limit, RateLimitResult } from '@/quest/server/rate-limit.server';
import type { SqlStorageAdapter } from './world-store.server';

export function takeLimits(
	storage: SqlStorageAdapter,
	limits: Limit[],
	now = Date.now(),
): RateLimitResult {
	const sql = storage.sql;
	return storage.transactionSync(() => {
		sql.exec('DELETE FROM counters WHERE reset_at <= ?', now);
		const rows = limits.map((limit) => ({
			...limit,
			current: sql
				.exec<{ count: number; reset_at: number }>(
					'SELECT count, reset_at FROM counters WHERE key = ?',
					limit.key,
				)
				.toArray()[0],
		}));
		const blocked = rows.filter((row) => row.current && row.current.count >= row.limit);
		if (blocked.length)
			return {
				ok: false,
				retryAfterSeconds: Math.max(
					1,
					Math.ceil(
						Math.max(...blocked.map((row) => row.current!.reset_at - now)) / 1000,
					),
				),
			};
		for (const row of rows)
			sql.exec(
				'INSERT OR REPLACE INTO counters (key, count, reset_at) VALUES (?, ?, ?)',
				row.key,
				(row.current?.count ?? 0) + 1,
				row.current?.reset_at ?? now + row.windowMs,
			);
		return { ok: true };
	});
}
