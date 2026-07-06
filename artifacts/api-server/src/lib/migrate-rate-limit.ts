import { pool } from "@workspace/db";

/**
 * Idempotent startup migration for the persistent rate-limit store.
 * Safe to run on every boot — uses CREATE TABLE IF NOT EXISTS.
 */
export async function migrateRateLimit(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS rate_limit_counters (
        scope        TEXT NOT NULL,
        identifier   TEXT NOT NULL,
        window_start TIMESTAMPTZ NOT NULL,
        count        INTEGER NOT NULL DEFAULT 0,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (scope, identifier, window_start)
      );
    `);
  } finally {
    client.release();
  }
}
