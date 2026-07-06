/**
 * Migration: add tenant_id columns to hostel and communication tables,
 * backfill existing rows with the 'ccm' tenant, drop old global unique
 * constraints, create composite per-tenant unique indexes, and register
 * the new tables in the FORCE RLS + policy model.
 *
 * Usage: node artifacts/api-server/scripts/apply-hostel-communication-isolation.mjs
 * Safe to re-run: all operations are idempotent.
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireFromDb = createRequire(path.resolve(__dirname, "../../../lib/db/package.json"));
const pg = requireFromDb("pg");

if (!process.env.NEON_DATABASE_URL) {
  const envFile = path.resolve(__dirname, "../../../.env");
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const { Client } = pg;

const NEW_TABLES = [
  "hostel_blocks",
  "hostel_room_types",
  "hostel_rooms",
  "announcements",
  "noticeboard_items",
];

async function main() {
  const client = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await client.connect();
  await client.query("RESET ROLE");
  console.log("Connected.");

  try {
    // ── 1. Add tenant_id columns (idempotent) ────────────────────────────────
    for (const table of NEW_TABLES) {
      await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id uuid`);
      console.log(`  ✓ tenant_id column ensured: ${table}`);
    }

    // ── 2. Backfill existing rows with the 'ccm' tenant ──────────────────────
    for (const table of NEW_TABLES) {
      const r = await client.query(`
        UPDATE ${table}
        SET tenant_id = (SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1)
        WHERE tenant_id IS NULL
      `);
      if (r.rowCount > 0) {
        console.log(`  ✓ Backfilled ${r.rowCount} rows in ${table}`);
      } else {
        console.log(`  ✓ No NULL tenant_id rows in ${table}`);
      }
    }

    // ── 3. Enforce NOT NULL ──────────────────────────────────────────────────
    for (const table of NEW_TABLES) {
      try {
        await client.query(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET NOT NULL`);
        console.log(`  ✓ NOT NULL enforced: ${table}.tenant_id`);
      } catch (e) {
        if (e.message.includes("already has a not-null") || e.code === "42P16") {
          console.log(`  ✓ NOT NULL already set: ${table}.tenant_id`);
        } else {
          console.warn(`  WARN NOT NULL on ${table}: ${e.message}`);
        }
      }
    }

    // ── 4. Drop old global unique constraints / indexes ──────────────────────
    const drops = [
      // hostel_blocks.name was globally unique
      "ALTER TABLE hostel_blocks DROP CONSTRAINT IF EXISTS hostel_blocks_name_unique",
      "DROP INDEX IF EXISTS hostel_blocks_name_unique",
      // hostel_room_types.name was globally unique
      "ALTER TABLE hostel_room_types DROP CONSTRAINT IF EXISTS hostel_room_types_name_unique",
      "DROP INDEX IF EXISTS hostel_room_types_name_unique",
      // announcements.slug was globally unique
      "ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_slug_unique",
      "DROP INDEX IF EXISTS announcements_slug_unique",
      // noticeboard_items.slug was globally unique
      "ALTER TABLE noticeboard_items DROP CONSTRAINT IF EXISTS noticeboard_items_slug_unique",
      "DROP INDEX IF EXISTS noticeboard_items_slug_unique",
    ];
    for (const stmt of drops) {
      try {
        await client.query(stmt);
      } catch (e) {
        if (!["42P07", "42710", "42704", "42P16"].includes(e.code)) {
          console.warn(`  WARN drop: ${e.message}`);
        }
      }
    }
    console.log("  ✓ Old global unique constraints dropped");

    // ── 5. Create composite per-tenant unique indexes ────────────────────────
    const indexes = [
      ["hostel_blocks_tenant_name_idx",      "hostel_blocks(tenant_id, name)"],
      ["hostel_room_types_tenant_name_idx",   "hostel_room_types(tenant_id, name)"],
      ["announcements_tenant_slug_idx",       "announcements(tenant_id, slug) WHERE slug IS NOT NULL"],
      ["noticeboard_items_tenant_slug_idx",   "noticeboard_items(tenant_id, slug) WHERE slug IS NOT NULL"],
    ];
    for (const [name, cols] of indexes) {
      try {
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${name} ON ${cols}`);
        console.log(`  ✓ Unique index: ${name}`);
      } catch (e) {
        if (["42P07", "42710"].includes(e.code)) {
          console.log(`  ✓ Index already exists: ${name}`);
        } else {
          console.warn(`  WARN index ${name}: ${e.message}`);
        }
      }
    }

    // ── 6. ENABLE + FORCE ROW LEVEL SECURITY ────────────────────────────────
    for (const table of NEW_TABLES) {
      try {
        await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
        await client.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
        console.log(`  ✓ ENABLE + FORCE RLS: ${table}`);
      } catch (e) {
        console.warn(`  WARN RLS on ${table}: ${e.message}`);
      }
    }

    // ── 7. Grant permissions to app_user and ccm_migration ───────────────────
    for (const table of NEW_TABLES) {
      await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO app_user`);
      await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO ccm_migration`);
    }
    console.log("  ✓ Permissions granted to app_user and ccm_migration");

    // ── 8. Determine table owner ─────────────────────────────────────────────
    const ownerRes = await client.query(`
      SELECT r.rolname
      FROM pg_class c
      JOIN pg_roles r ON r.oid = c.relowner
      WHERE c.relname = 'hostel_blocks' AND c.relkind = 'r'
      LIMIT 1
    `);
    const tableOwner = ownerRes.rows[0]?.rolname ?? "neondb_owner";
    console.log(`  Table owner: ${tableOwner}`);

    // ── 9. Create RLS policies ───────────────────────────────────────────────
    for (const table of NEW_TABLES) {
      // Policy A: app_user — tenant isolation
      const isolationName = `${table}_tenant_isolation`;
      await client.query(`DROP POLICY IF EXISTS ${isolationName} ON ${table}`);
      try {
        await client.query(`
          CREATE POLICY ${isolationName}
          ON ${table}
          TO app_user
          USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid)
          WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid)
        `);
        console.log(`  ✓ Policy: ${isolationName} (TO app_user)`);
      } catch (e) {
        console.warn(`  SKIP ${isolationName}: ${e.message}`);
      }

      // Policy B: tableOwner — owner_scoped (requires app.current_tenant)
      const ownerScopedName = `${table}_owner_scoped`;
      await client.query(`DROP POLICY IF EXISTS ${ownerScopedName} ON ${table}`);
      await client.query(`DROP POLICY IF EXISTS ${table}_owner_bypass ON ${table}`);
      try {
        await client.query(`
          CREATE POLICY ${ownerScopedName}
          ON ${table}
          TO "${tableOwner}"
          USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid)
          WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid)
        `);
        console.log(`  ✓ Policy: ${ownerScopedName} (TO ${tableOwner})`);
      } catch (e) {
        console.warn(`  SKIP ${ownerScopedName}: ${e.message}`);
      }

      // Policy C: ccm_migration — unrestricted bypass
      const migrationBypassName = `${table}_migration_bypass`;
      await client.query(`DROP POLICY IF EXISTS ${migrationBypassName} ON ${table}`);
      try {
        await client.query(`
          CREATE POLICY ${migrationBypassName}
          ON ${table}
          TO ccm_migration
          USING (true)
          WITH CHECK (true)
        `);
        console.log(`  ✓ Policy: ${migrationBypassName} (TO ccm_migration, bypass)`);
      } catch (e) {
        console.warn(`  SKIP ${migrationBypassName}: ${e.message}`);
      }
    }

    // ── 10. Verify ───────────────────────────────────────────────────────────
    const check = await client.query(`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class WHERE relname = ANY($1) AND relkind = 'r' ORDER BY relname
    `, [NEW_TABLES]);
    console.log("\nRLS status:");
    for (const row of check.rows) {
      const rls = row.relrowsecurity ? "ENABLED" : "DISABLED";
      const force = row.relforcerowsecurity ? "FORCED" : "not forced";
      console.log(`  ${row.relname}: RLS=${rls}, ${force}`);
    }

    // Verify tenant_id exists on all new tables
    const colCheck = await client.query(`
      SELECT table_name, column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1)
        AND column_name = 'tenant_id'
      ORDER BY table_name
    `, [NEW_TABLES]);
    console.log("\ntenant_id columns:");
    for (const row of colCheck.rows) {
      console.log(`  ${row.table_name}.tenant_id  nullable=${row.is_nullable}`);
    }

    console.log("\n✅ Migration complete.");
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
