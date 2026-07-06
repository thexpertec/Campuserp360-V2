import { pgTable, text, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";

// ── Rate limit counters (persistent, fixed-window) ─────────────────────────────
// Backs cross-instance / restart-surviving rate limiting. Each row is one
// (scope, identifier, window_start) bucket holding a hit count. Counting is done
// with an atomic upsert (count = count + 1) so it works correctly across multiple
// server instances sharing the same database. Old buckets are pruned opportunistically.

export const rateLimitCountersTable = pgTable("rate_limit_counters", {
  scope:       text("scope").notNull(),
  identifier:  text("identifier").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count:       integer("count").notNull().default(0),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  pk: primaryKey({ columns: [t.scope, t.identifier, t.windowStart] }),
}));

export type RateLimitCounter = typeof rateLimitCountersTable.$inferSelect;
