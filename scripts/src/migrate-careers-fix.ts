/**
 * Career portal schema fix migration.
 *
 * Drops and recreates the three career tables with the correct schema.
 * Also inserts a "Careers" nav item for all tenants that don't already have one.
 *
 * Run once:
 *   pnpm --filter @workspace/scripts run migrate-careers-fix
 */

import pg from "pg";

const { Client } = pg;

async function main() {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("NEON_DATABASE_URL is not set");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log("Running career schema fix migration…");

  // Drop in reverse dependency order (safe — tables were just created, no real data)
  await client.query(`DROP TABLE IF EXISTS career_application_positions CASCADE;`);
  await client.query(`DROP TABLE IF EXISTS career_applications CASCADE;`);
  await client.query(`DROP TABLE IF EXISTS career_positions CASCADE;`);
  console.log("  ✓ dropped old career tables");

  // Recreate career_positions (title only — no department/description per spec)
  await client.query(`
    CREATE TABLE career_positions (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      title       TEXT NOT NULL,
      is_active   BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`
    CREATE INDEX career_positions_tenant_active_idx
      ON career_positions (tenant_id, is_active);
  `);
  console.log("  ✓ career_positions");

  // Recreate career_applications with required fields
  await client.query(`
    CREATE TABLE career_applications (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      full_name    TEXT NOT NULL,
      father_name  TEXT,
      cnic         TEXT,
      dob          TEXT,
      gender       TEXT,
      phone        TEXT NOT NULL,
      email        TEXT NOT NULL,
      address      TEXT,
      education    TEXT,
      experience   TEXT,
      cover_note   TEXT,
      status       TEXT NOT NULL DEFAULT 'new',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`
    CREATE INDEX career_applications_tenant_status_idx
      ON career_applications (tenant_id, status);
  `);
  await client.query(`
    CREATE INDEX career_applications_tenant_created_idx
      ON career_applications (tenant_id, created_at);
  `);
  console.log("  ✓ career_applications");

  // Recreate junction table
  await client.query(`
    CREATE TABLE career_application_positions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      application_id  UUID NOT NULL REFERENCES career_applications(id) ON DELETE CASCADE,
      position_id     UUID NOT NULL REFERENCES career_positions(id) ON DELETE CASCADE
    );
  `);
  await client.query(`
    CREATE INDEX career_app_positions_app_idx
      ON career_application_positions (application_id);
  `);
  console.log("  ✓ career_application_positions");

  // Add Careers nav item for all tenants that don't have one yet
  // Look up max sort_order for top-level "header" menu items per tenant, insert after
  const { rows: tenants } = await client.query(`SELECT id FROM tenants WHERE is_active = TRUE`);
  for (const tenant of tenants) {
    const { rows: existing } = await client.query(
      `SELECT id FROM site_menu_items
       WHERE tenant_id = $1 AND parent_id IS NULL
         AND location = 'header' AND label = 'Careers'
       LIMIT 1`,
      [tenant.id],
    );
    if (existing.length > 0) continue;

    const { rows: [maxRow] } = await client.query(
      `SELECT COALESCE(MAX(sort_order), 0) AS max_so
       FROM site_menu_items
       WHERE tenant_id = $1 AND parent_id IS NULL AND location = 'header'`,
      [tenant.id],
    );
    const nextSo = (maxRow?.max_so ?? 0) + 10;

    await client.query(
      `INSERT INTO site_menu_items
         (tenant_id, parent_id, label, link_type, target, open_in_new_tab, is_cta, is_published, sort_order, location)
       VALUES
         ($1, NULL, 'Careers', 'page', '/careers', false, false, true, $2, 'header')`,
      [tenant.id, nextSo],
    );
    console.log(`  ✓ inserted Careers nav item for tenant ${tenant.id}`);
  }

  await client.end();
  console.log("Migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
