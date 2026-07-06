/**
 * Employee name column migration.
 *
 * Adds full_name to the employees table (if missing), backfills it from
 * first_name + last_name, then drops the old columns.
 *
 * Run once:
 *   pnpm --filter @workspace/scripts run migrate-employees-full-name
 */

import pg from "pg";

const { Client } = pg;

async function main() {
  const url = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL or NEON_DATABASE_URL must be set");

  const ssl = url.includes("localhost") || url.includes("127.0.0.1")
    ? undefined
    : { rejectUnauthorized: false };

  const client = new Client({ connectionString: url, ssl });
  await client.connect();

  console.log("Running employees full_name migration…");

  // 1. Check which columns currently exist
  const colRes = await client.query<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'employees'
      AND column_name IN ('first_name', 'last_name', 'full_name')
  `);
  const cols = new Set(colRes.rows.map(r => r.column_name));
  console.log("  Current relevant columns:", [...cols].join(", ") || "(none)");

  // 2. Add full_name if it doesn't exist yet
  if (!cols.has("full_name")) {
    await client.query(`ALTER TABLE employees ADD COLUMN full_name text NOT NULL DEFAULT ''`);
    console.log("  ✓ Added full_name column");
  } else {
    console.log("  — full_name already exists, skipping ADD COLUMN");
  }

  // 3. Backfill full_name from first_name / last_name (safe to run even if both are already gone)
  if (cols.has("first_name") || cols.has("last_name")) {
    const firstExpr = cols.has("first_name") ? "COALESCE(first_name, '')" : "''";
    const lastExpr  = cols.has("last_name")  ? "COALESCE(last_name, '')"  : "''";
    const res = await client.query(`
      UPDATE employees
      SET full_name = TRIM(${firstExpr} || ' ' || ${lastExpr})
      WHERE full_name = ''
    `);
    console.log(`  ✓ Backfilled full_name for ${res.rowCount} row(s)`);
  } else {
    console.log("  — No first_name/last_name columns found; skipping backfill");
  }

  // 4. Drop old columns if they still exist
  if (cols.has("first_name")) {
    await client.query(`ALTER TABLE employees DROP COLUMN first_name`);
    console.log("  ✓ Dropped first_name");
  }
  if (cols.has("last_name")) {
    await client.query(`ALTER TABLE employees DROP COLUMN last_name`);
    console.log("  ✓ Dropped last_name");
  }

  await client.end();
  console.log("Migration complete.");
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
