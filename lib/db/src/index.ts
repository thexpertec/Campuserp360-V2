import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Use NEON_DATABASE_URL if available (external Neon DB), otherwise fall back
// to Replit's built-in DATABASE_URL. This allows the app to work in both
// the original Neon-backed setup and the Replit-native PostgreSQL setup.
const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "[db] FATAL: No database connection string found.\n" +
    "  Set DATABASE_URL (Replit built-in PostgreSQL) or NEON_DATABASE_URL in Secrets.\n"
  );
}

const isNeon = connectionString.includes("neon.tech");
console.log(`[db] Connected to ${isNeon ? "Neon (NEON_DATABASE_URL)" : "Replit PostgreSQL (DATABASE_URL)"} ✓`);

export const pool = new Pool({
  connectionString,
  ssl: isNeon ? { rejectUnauthorized: false } : false,
  // Cap the pool and add timeouts so a burst of queries degrades gracefully
  // instead of hanging the whole server waiting on a free connection forever.
  max: 10,
  connectionTimeoutMillis: 10_000, // fail fast if no connection is free
  idleTimeoutMillis: 30_000,       // release idle connections back to Neon
  keepAlive: true,
  statement_timeout: 30_000,       // server-side: kill runaway queries
  query_timeout: 30_000,           // client-side safety net
  // NOTE: do not pass `options: "-c search_path=..."` here — Neon's pooled
  // connections (PgBouncer) reject the `options` startup parameter outright.
  // The default search_path already includes `public`, so no override needed.
});

pool.on("error", (err) => {
  console.error("[db] idle client error", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
