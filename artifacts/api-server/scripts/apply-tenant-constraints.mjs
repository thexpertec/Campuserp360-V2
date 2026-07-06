/**
 * ⚠️  DEPRECATED — do not run this script.
 *
 * This script is superseded by apply-rls-force.mjs, which implements the
 * correct three-role RLS model:
 *
 *   app_user       — restricted runtime role; tenant-isolation + owner-scoped policies
 *   neondb_owner   — owner role; owner-scoped policy (requires app.current_tenant)
 *   ccm_migration  — privileged migration role; USING (true) bypass for seed/migration
 *
 * This old script creates an `owner_bypass USING (true)` policy for neondb_owner,
 * which allows the application runtime to skip tenant filtering entirely — exactly
 * the vulnerability apply-rls-force.mjs is designed to close.
 *
 * To apply the correct RLS model:
 *   node artifacts/api-server/scripts/apply-rls-force.mjs
 *
 * This file is kept for reference only. Running it on a database that already has
 * apply-rls-force.mjs policies applied will downgrade the security model.
 */
console.error(
  "ERROR: apply-tenant-constraints.mjs is deprecated.\n" +
  "Use apply-rls-force.mjs instead:\n" +
  "  node artifacts/api-server/scripts/apply-rls-force.mjs"
);
process.exit(1);

// ─── DEPRECATED CODE BELOW ────────────────────────────────────────────────────
// eslint-disable-next-line no-unreachable
import pg from "/home/runner/workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js";
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL });

// ─── Tables that have a tenant_id column ─────────────────────────────────────
const TENANT_TABLES = [
  "hr_departments",
  "hr_designations",
  "hr_salary_grades",
  "hr_incentive_types",
  "hr_deduction_types",
  "employees",
  "chart_of_accounts",
  "fee_types",
];

async function run() {
  const client = await pool.connect();
  try {
    // ── Step 1: Resolve default tenant safely ──────────────────────────────────
    // Prefer DEFAULT_TENANT_SLUG env var; fall back to first tenant in DB.
    const slug = process.env.DEFAULT_TENANT_SLUG?.trim() || null;
    let tenantId;
    if (slug) {
      const r = await client.query("SELECT id FROM tenants WHERE slug = $1 LIMIT 1", [slug]);
      tenantId = r.rows[0]?.id ?? null;
    }
    if (!tenantId) {
      const r = await client.query("SELECT id FROM tenants ORDER BY created_at LIMIT 1");
      tenantId = r.rows[0]?.id ?? null;
    }
    if (!tenantId) {
      console.error("ERROR: No tenant found in DB. Seed tenants before running this migration.");
      process.exit(1);
    }
    console.log(`Using default tenant: ${tenantId}`);

    // ── Step 2: Backfill any still-null rows ─────────────────────────────────
    // For tables with a composite unique index on (tenant_id, <key>), duplicate
    // rows with the same key may exist if phase-1 already backfilled some rows.
    // We handle this by deleting conflicting nulls (orphaned duplicates) before
    // setting the tenant, falling back to a plain DELETE if all else fails.
    for (const table of TENANT_TABLES) {
      const nullCheck = await client.query(
        `SELECT COUNT(*) AS n FROM ${table} WHERE tenant_id IS NULL`,
      );
      const nullCount = Number(nullCheck.rows[0]?.n ?? 0);
      if (!nullCount) {
        console.log(`  ${table}: no NULL tenant_id rows — skip backfill`);
        continue;
      }
      console.log(`  ${table}: ${nullCount} NULL tenant_id rows — backfilling…`);

      // Special handling for chart_of_accounts: delete nulls whose code already
      // exists under the target tenant (orphaned duplicates from phase-1 partial runs)
      if (table === "chart_of_accounts") {
        const deleted = await client.query(`
          DELETE FROM chart_of_accounts
          WHERE tenant_id IS NULL
            AND code IN (
              SELECT code FROM chart_of_accounts WHERE tenant_id = $1
            )
        `, [tenantId]);
        if (deleted.rowCount) {
          console.log(`    deleted ${deleted.rowCount} duplicate COA rows with NULL tenant_id`);
        }
      }

      try {
        const r = await client.query(
          `UPDATE ${table} SET tenant_id = $1 WHERE tenant_id IS NULL`,
          [tenantId],
        );
        console.log(`    backfilled ${r.rowCount} row(s) in ${table}`);
      } catch (e) {
        if (e.code === "23505") {
          // Remaining unique conflicts: delete those NULL rows (they are orphans)
          await client.query(`DELETE FROM ${table} WHERE tenant_id IS NULL`);
          console.log(`    deleted remaining NULL rows in ${table} due to unique conflict`);
        } else {
          throw e;
        }
      }
    }

    // ── Step 3: Add NOT NULL constraints (idempotent) ─────────────────────────
    for (const table of TENANT_TABLES) {
      try {
        await client.query(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET NOT NULL`);
        console.log(`  NOT NULL set on ${table}.tenant_id`);
      } catch (e) {
        if (e.code === "42P16" || e.message.includes("already")) {
          console.log(`  ${table}.tenant_id already NOT NULL`);
        } else {
          console.warn(`  SKIP NOT NULL on ${table}: ${e.message}`);
        }
      }
    }

    // ── Step 4: Add FK constraints (idempotent) ───────────────────────────────
    for (const table of TENANT_TABLES) {
      const fkName = `${table}_tenant_id_fk`;
      try {
        await client.query(`
          ALTER TABLE ${table}
          ADD CONSTRAINT ${fkName}
          FOREIGN KEY (tenant_id)
          REFERENCES tenants(id)
          ON DELETE RESTRICT
        `);
        console.log(`  FK added: ${fkName}`);
      } catch (e) {
        if (e.code === "42710" || e.message.includes("already exists")) {
          console.log(`  FK already exists: ${fkName}`);
        } else {
          console.warn(`  SKIP FK on ${table}: ${e.message}`);
        }
      }
    }

    // ── Step 5: Create app_user role (idempotent) ─────────────────────────────
    // The DB owner/superuser bypasses RLS automatically; app_user is subject to policies.
    try {
      await client.query("CREATE ROLE app_user NOLOGIN");
      console.log("  Created role: app_user");
    } catch (e) {
      if (e.code !== "42710") console.warn(`  SKIP create role: ${e.message}`);
      else console.log("  Role app_user already exists");
    }

    // Grant schema + table access to app_user
    await client.query("GRANT USAGE ON SCHEMA public TO app_user");
    for (const table of TENANT_TABLES) {
      await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO app_user`);
    }
    console.log("  Granted table permissions to app_user");

    // ── Step 6: Enable RLS + create per-tenant isolation policies ─────────────
    // Determine DB owner for bypass policy (neondb_owner on Neon, current user otherwise)
    const ownerRes = await client.query(`
      SELECT r.rolname
      FROM pg_class c
      JOIN pg_roles r ON r.oid = c.relowner
      WHERE c.relname = 'employees' AND c.relkind = 'r'
      LIMIT 1
    `);
    const tableOwner = ownerRes.rows[0]?.rolname ?? "neondb_owner";
    console.log(`  Table owner (bypass role): ${tableOwner}`);

    for (const table of TENANT_TABLES) {
      await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);

      // Policy 1: tenant isolation for the app_user runtime role
      const policyName = `${table}_tenant_isolation`;
      await client.query(`DROP POLICY IF EXISTS ${policyName} ON ${table}`);
      try {
        await client.query(`
          CREATE POLICY ${policyName}
          ON ${table}
          TO app_user
          USING (
            tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid
          )
          WITH CHECK (
            tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid
          )
        `);
        console.log(`  RLS policy: ${policyName}`);
      } catch (e) {
        console.warn(`  SKIP policy on ${table}: ${e.message}`);
      }

      // Policy 2: explicit bypass for the DB owner / migration role.
      // FORCE ROW LEVEL SECURITY applies even to the table owner, so migrations and
      // seed scripts that run as the owner role need an explicit USING (true) policy.
      const bypassName = `${table}_owner_bypass`;
      await client.query(`DROP POLICY IF EXISTS ${bypassName} ON ${table}`);
      try {
        await client.query(`
          CREATE POLICY ${bypassName}
          ON ${table}
          TO "${tableOwner}"
          USING (true)
          WITH CHECK (true)
        `);
        console.log(`  Bypass policy: ${bypassName} (TO ${tableOwner})`);
      } catch (e) {
        console.warn(`  SKIP bypass policy on ${table}: ${e.message}`);
      }
    }

    console.log("\nDone: tenant_id constraints + RLS policies applied successfully.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error("Migration failed:", err); process.exit(1); });
