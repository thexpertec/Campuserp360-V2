import { db, rateLimitCountersTable } from "@workspace/db";
import { and, eq, lt, sql } from "drizzle-orm";

/**
 * Persistent, cross-instance rate limiter backed by the `rate_limit_counters`
 * table. Uses a fixed-window counter: each (scope, identifier) gets one row per
 * time window, incremented atomically via an upsert so it stays correct when
 * multiple server instances share the same database. Unlike an in-memory map it
 * survives restarts and is shared across instances.
 *
 * Returns `true` when the caller is OVER the limit (should be blocked).
 * Fails OPEN (returns false) on any DB error so a transient DB hiccup never
 * blocks a legitimate user.
 */
export async function isRateLimited(
  scope: string,
  identifier: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  try {
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

    const [row] = await db
      .insert(rateLimitCountersTable)
      .values({ scope, identifier, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [
          rateLimitCountersTable.scope,
          rateLimitCountersTable.identifier,
          rateLimitCountersTable.windowStart,
        ],
        set: {
          count: sql`${rateLimitCountersTable.count} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning({ count: rateLimitCountersTable.count });

    // Opportunistically prune buckets older than 24h to keep the table small.
    if (Math.random() < 0.02) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      void db
        .delete(rateLimitCountersTable)
        .where(and(eq(rateLimitCountersTable.scope, scope), lt(rateLimitCountersTable.windowStart, cutoff)))
        .catch(() => { /* best-effort cleanup */ });
    }

    return (row?.count ?? 0) > max;
  } catch {
    // Fail open: never block a real user because the limiter store is unavailable.
    return false;
  }
}
