/**
 * apply-rls-force.mjs
 *
 * Migration: enable FORCE ROW LEVEL SECURITY on all tenant-scoped tables,
 * create the two-role model for runtime vs migration access:
 *
 *   app_user       — restricted runtime role; subject to tenant isolation policies
 *   ccm_migration  — privileged migration role; has USING (true) bypass policies
 *
 * The application runtime user (neondb_owner) must:
 *   - For tenant-scoped writes: use withTenantCtx (SET LOCAL ROLE app_user + set_config)
 *   - For tenant-scoped reads:  use withTenantRead (same guarantee)
 *   - As a session-level default: the request middleware sets app.current_tenant so
 *     ad-hoc neondb_owner queries are also filtered by the owner_scoped policy
 *
 * Migration scripts use SET ROLE ccm_migration (which has USING (true) bypass) for
 * operations that need full table access without tenant context.
 *
 * Run: node artifacts/api-server/scripts/apply-rls-force.mjs
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

// All tables that carry a tenant_id column in the live DB, plus tables with
// RLS-only bypass policies (employee_documents, bank_accounts have no tenant_id
// but still have FORCE RLS + ccm_migration bypass from earlier migration runs).
// The policy-creation loop skips tenant_isolation / owner_scoped policies when
// the column does not exist — only migration_bypass is applied in that case.
const TENANT_TABLES = [
  // ── Core HR ────────────────────────────────────────────────────────────────
  "employees",
  "employee_documents",       // no tenant_id — bypass-only policy
  "hr_departments",
  "hr_designations",
  "hr_salary_grades",
  "hr_incentive_types",
  "hr_deduction_types",
  // ── Finance / COA ──────────────────────────────────────────────────────────
  "chart_of_accounts",
  "bank_accounts",            // no tenant_id — bypass-only policy
  "fee_types",
  "fee_schedule",
  "fee_challans",
  "payment_transactions",
  // ── Academic ───────────────────────────────────────────────────────────────
  "academic_terms",
  "academic_years",
  "classes",
  "class_academic_years",
  "class_sections",
  "class_subjects",
  "sections",
  "section_allocations",
  "subjects",
  // ── Students / Applications ────────────────────────────────────────────────
  "applications",
  "students",
  "interviewers",
  "test_schedules",
  // ── Hostel / Library ───────────────────────────────────────────────────────
  "hostel_blocks",
  "hostel_room_types",
  "hostel_rooms",
  "hostel_allocations",
  // ── Communication ──────────────────────────────────────────────────────────
  "announcements",
  "noticeboard_items",
  "library_books",
  "library_issues",
  // ── Admin / Media ──────────────────────────────────────────────────────────
  "admin_users",
  "tenant_admin_users",
  "media_library",
  "print_templates",
  // ── Website content (tenant-scoped CMS) ────────────────────────────────────
  "site_settings",
  "site_hero_headers",
  "site_announcements",
  "site_events",
  "site_gallery",
  "site_faculty",
  "site_features",
  "site_facilities",
  "site_testimonials",
  "site_results",
  "site_fee_structure",
  "site_downloads",
  "site_quick_links",
  "site_alumni",
  "site_menu_items",
  "site_page_blocks",
  "site_page_views",
  "site_contact_submissions",
];

async function main() {
  const client = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await client.connect();
  // Neon's PgBouncer pooler may reuse sessions with a stale SET ROLE from a
  // previous run. Reset to the authenticated user (neondb_owner) before any DDL.
  await client.query("RESET ROLE");
  console.log("Connected to Neon database.");

  try {
    // ── 1. ENABLE + FORCE ROW LEVEL SECURITY on all tenant tables ────────
    // Both operations require being the table owner. They are idempotent.
    for (const table of TENANT_TABLES) {
      try {
        await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
        await client.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
        console.log(`  ✓ ENABLE + FORCE ROW LEVEL SECURITY: ${table}`);
      } catch (e) {
        // May fail if already applied or if current role isn't the table owner.
        // Apply what we can — policy creation below is the critical step.
        console.warn(`  WARN ENABLE/FORCE on ${table}: ${e.message}`);
      }
    }

    // ── 2. Create runtime and migration roles ─────────────────────────────
    // app_user: restricted runtime role — subject to tenant isolation policies.
    // ccm_migration: privileged migration role — has USING (true) bypass.
    // The application connects as neondb_owner and can SET ROLE to either.
    for (const role of ["app_user", "ccm_migration"]) {
      try {
        await client.query(`CREATE ROLE ${role} NOLOGIN`);
        console.log(`  ✓ Created role: ${role}`);
      } catch (e) {
        if (e.code === "42710") console.log(`  Role ${role} already exists`);
        else console.warn(`  SKIP create role ${role}: ${e.message}`);
      }
    }

    // Determine current connection user (= neondb_owner on Neon)
    const result = await client.query("SELECT current_user");
    const currentUser = result.rows[0].current_user;

    // Grant both roles to the connection user so it can SET ROLE
    await client.query(`GRANT app_user TO "${currentUser}"`);
    await client.query(`GRANT ccm_migration TO "${currentUser}"`);
    console.log(`  ✓ GRANTED app_user, ccm_migration TO ${currentUser}`);

    // Grant table-level access to app_user (tenant-scoped tables only)
    await client.query("GRANT USAGE ON SCHEMA public TO app_user");
    for (const table of TENANT_TABLES) {
      await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO app_user`);
    }
    console.log("  ✓ Granted table permissions to app_user");

    // Grant full schema access to ccm_migration (used by migration/seed scripts)
    // ccm_migration needs access to ALL tables including non-RLS tables like tenants,
    // admin_users, etc. that appear in migration/seed/smoke-test workflows.
    await client.query("GRANT USAGE ON SCHEMA public TO ccm_migration");
    await client.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ccm_migration");
    await client.query("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ccm_migration");
    console.log("  ✓ Granted full schema access to ccm_migration");

    // ── 3. Enforce NOT NULL + FOREIGN KEY constraints on tenant_id columns ───
    // These tables have tenant_id columns that must be NOT NULL and reference
    // the tenants table. This section is idempotent: it only adds constraints
    // if they are missing. This replaces the old apply-tenant-constraints.mjs.
    const TENANT_ID_FK_TABLES = [
      "hr_departments",
      "hr_designations",
      "hr_salary_grades",
      "hr_incentive_types",
      "hr_deduction_types",
      "employees",
      "fee_types",
      "chart_of_accounts",
    ];

    for (const table of TENANT_ID_FK_TABLES) {
      // Backfill: assign any NULL tenant_id rows to the default ccm tenant.
      // (Safe to run even when all rows already have tenant_id set.)
      const backfillResult = await client.query(`
        UPDATE ${table}
        SET tenant_id = (SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1)
        WHERE tenant_id IS NULL
      `);
      if (backfillResult.rowCount > 0) {
        console.log(`  ✓ Backfilled ${backfillResult.rowCount} NULL tenant_id rows in ${table}`);
      }

      // Enforce NOT NULL.
      try {
        await client.query(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET NOT NULL`);
        console.log(`  ✓ NOT NULL enforced: ${table}.tenant_id`);
      } catch (e) {
        // "column already has a not-null constraint" is code 0A000 on some PG versions;
        // treat any constraint-already-exists variant as a no-op.
        if (e.message.includes("already has a not-null") || e.message.includes("42P16")) {
          console.log(`  ✓ NOT NULL already set: ${table}.tenant_id`);
        } else {
          console.warn(`  WARN NOT NULL on ${table}: ${e.message}`);
        }
      }

      // Enforce FK → tenants(id) with RESTRICT on delete.
      const fkName = `${table}_tenant_id_fkey`;
      const fkCheck = await client.query(`
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = $1 AND table_name = $2
      `, [fkName, table]);
      if (fkCheck.rowCount === 0) {
        try {
          await client.query(`
            ALTER TABLE ${table}
            ADD CONSTRAINT ${fkName}
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
          `);
          console.log(`  ✓ FK added: ${fkName}`);
        } catch (e) {
          console.warn(`  WARN FK on ${table}: ${e.message}`);
        }
      } else {
        console.log(`  ✓ FK already exists: ${fkName}`);
      }
    }

    // ── 4. Determine table owner ──────────────────────────────────────────
    const ownerRes = await client.query(`
      SELECT r.rolname
      FROM pg_class c
      JOIN pg_roles r ON r.oid = c.relowner
      WHERE c.relname = 'employees' AND c.relkind = 'r'
      LIMIT 1
    `);
    const tableOwner = ownerRes.rows[0]?.rolname ?? "neondb_owner";
    console.log(`\n  Table owner: ${tableOwner}`);

    // ── 4. Per-table RLS policies ─────────────────────────────────────────
    for (const table of TENANT_TABLES) {
      // Policy A: app_user — tenant isolation (used by withTenantCtx / withTenantRead)
      const isolationName = `${table}_tenant_isolation`;
      await client.query(`DROP POLICY IF EXISTS ${isolationName} ON ${table}`);
      try {
        await client.query(`
          CREATE POLICY ${isolationName}
          ON ${table}
          TO app_user
          USING (
            tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid
          )
          WITH CHECK (
            tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid
          )
        `);
        console.log(`  ✓ Policy: ${isolationName} (TO app_user)`);
      } catch (e) {
        console.warn(`  SKIP ${isolationName}: ${e.message}`);
      }

      // Policy B: tableOwner (neondb_owner) — scoped policy requiring app.current_tenant.
      // This ensures that even the application's direct db calls (which run as neondb_owner)
      // are filtered by tenant context. The request middleware sets app.current_tenant at
      // session level so normal admin queries are filtered; withTenantCtx/withTenantRead
      // use SET LOCAL (transaction-scoped) for strong isolation on write/sensitive-read paths.
      //
      // IMPORTANT: No USING (true) bypass for neondb_owner — a missed WHERE clause cannot
      // expose cross-tenant data because the RLS policy will catch it.
      const ownerScopedName = `${table}_owner_scoped`;
      await client.query(`DROP POLICY IF EXISTS ${ownerScopedName} ON ${table}`);
      await client.query(`DROP POLICY IF EXISTS ${table}_owner_bypass ON ${table}`);
      try {
        await client.query(`
          CREATE POLICY ${ownerScopedName}
          ON ${table}
          TO "${tableOwner}"
          USING (
            tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid
          )
          WITH CHECK (
            tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid
          )
        `);
        console.log(`  ✓ Policy: ${ownerScopedName} (TO ${tableOwner}, requires tenant ctx)`);
      } catch (e) {
        console.warn(`  SKIP ${ownerScopedName}: ${e.message}`);
      }

      // Policy C: ccm_migration — unrestricted bypass for migration/seed scripts only.
      // Migration scripts call SET ROLE ccm_migration before operating on tenant tables.
      // This role is never used in the application runtime path.
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

    // ── 5. Verify ─────────────────────────────────────────────────────────
    const policiesResult = await client.query(`
      SELECT tablename, policyname, roles
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = ANY($1)
      ORDER BY tablename, policyname
    `, [TENANT_TABLES]);

    console.log("\nRLS policies per table:");
    for (const row of policiesResult.rows) {
      console.log(`  ${row.tablename}: ${row.policyname} (roles: ${row.roles})`);
    }

    const rlsResult = await client.query(`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class WHERE relname = ANY($1) AND relkind = 'r' ORDER BY relname
    `, [TENANT_TABLES]);
    console.log("\nRLS status:");
    for (const row of rlsResult.rows) {
      console.log(`  ${row.relname}: RLS=${row.relrowsecurity ? "ENABLED" : "DISABLED"}, FORCE=${row.relforcerowsecurity}`);
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
