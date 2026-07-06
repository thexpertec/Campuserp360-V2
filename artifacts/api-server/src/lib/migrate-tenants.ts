import { pool } from "@workspace/db";
import { hashPasswordSync } from "./admin-auth";
import { logger } from "./logger";

/**
 * Idempotent startup migration for the per-tenant website CMS.
 *
 * Safe to run on every boot — uses ADD COLUMN IF NOT EXISTS / CREATE INDEX IF
 * NOT EXISTS and existence guards so it can run against:
 *   - a fresh database (where Drizzle already created the new schema), and
 *   - a legacy database that predates the tenant_id columns.
 *
 * It:
 *   1. Adds tenant_id (+ index) to every site_* content table.
 *   2. Adds tenants.domain / tenants.site_theme.
 *   3. Ensures the CCM tenant exists and backfills all legacy site_* rows + the
 *      site_settings rows to it (so existing content stays visible after reads
 *      become tenant-scoped).
 *   4. Rebuilds site_settings' primary key as the composite (tenant_id, key).
 *   5. Ensures the GCCM tenant + its scoped admin user exist.
 */

// site_* content table → its tenant_id index name (must match the Drizzle schema).
const CONTENT_TABLES: Array<{ table: string; idx: string }> = [
  { table: "site_announcements", idx: "site_ann_tenant_idx" },
  { table: "site_events",        idx: "site_ev_tenant_idx" },
  { table: "site_gallery",       idx: "site_gal_tenant_idx" },
  { table: "site_downloads",     idx: "site_dl_tenant_idx" },
  { table: "site_faculty",       idx: "site_fac_tenant_idx" },
  { table: "site_fee_structure", idx: "site_fee_tenant_idx" },
  { table: "site_page_blocks",   idx: "site_pb_tenant_idx" },
  { table: "site_testimonials",  idx: "site_test_tenant_idx" },
  { table: "site_features",      idx: "site_feat_tenant_idx" },
  { table: "site_facilities",    idx: "site_facil_tenant_idx" },
  { table: "site_quick_links",   idx: "site_ql_tenant_idx" },
  { table: "site_results",       idx: "site_res_tenant_idx" },
  { table: "site_alumni",        idx: "site_alum_tenant_idx" },
];

export async function migrateTenants(): Promise<void> {
  const client = await pool.connect();
  try {
    // ── 1. tenants.domain / site_theme columns + domain index ────────────────
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenants') THEN
          ALTER TABLE tenants ADD COLUMN IF NOT EXISTS domain TEXT;
          ALTER TABLE tenants ADD COLUMN IF NOT EXISTS site_theme TEXT NOT NULL DEFAULT 'gccm';
          CREATE INDEX IF NOT EXISTS tenants_domain_idx ON tenants(domain);
        END IF;
      END $$;
    `);

    // tenants table is required for everything below; bail gracefully if absent.
    const { rowCount: tenantsExists } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'tenants'`,
    );
    if (!tenantsExists) return;

    // ── 1b. One-shot: migrate any legacy tenant still using the removed 'ccm' theme ──
    // 'ccm' is no longer a valid theme; all tenants should resolve to 'gccm'.
    await client.query(
      `UPDATE tenants SET site_theme = 'gccm' WHERE site_theme = 'ccm' OR site_theme = ''`,
    ).catch(() => {});

    // ── 2. Ensure the CCM tenant exists (resolve by slug, never by hardcoded id) ──
    await client.query(
      `INSERT INTO tenants (name, slug, domain, site_theme)
       SELECT 'Cadet College Murree', 'ccm', 'cadetcollegemurree.edu.pk', 'gccm'
       WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'ccm')`,
    );
    await client.query(
      `UPDATE tenants
         SET domain     = COALESCE(domain, 'cadetcollegemurree.edu.pk'),
             site_theme = 'gccm'
       WHERE slug = 'ccm'`,
    );
    const { rows: ccmRows } = await client.query<{ id: string }>(
      `SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1`,
    );
    const ccmId = ccmRows[0]?.id;
    if (!ccmId) return;

    // ── 2b. Ensure newer site_* tables exist ────────────────────────────────
    // drizzle-kit push is not run against the (hosted) production database, so
    // tables added after the initial schema must be created explicitly here.
    // Idempotent — CREATE TABLE IF NOT EXISTS with the same shape as the schema.
    await client.query(`
      CREATE TABLE IF NOT EXISTS site_alumni (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID,
        name          TEXT NOT NULL,
        batch         TEXT NOT NULL DEFAULT '',
        category      TEXT NOT NULL DEFAULT 'academia',
        role          TEXT NOT NULL DEFAULT '',
        organization  TEXT NOT NULL DEFAULT '',
        location      TEXT NOT NULL DEFAULT '',
        quote         TEXT NOT NULL DEFAULT '',
        story         TEXT NOT NULL DEFAULT '',
        achievements  TEXT NOT NULL DEFAULT '',
        badge         TEXT,
        photo_url     TEXT,
        featured      BOOLEAN NOT NULL DEFAULT false,
        is_published  BOOLEAN NOT NULL DEFAULT false,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS site_alum_pub_idx  ON site_alumni(is_published);
      CREATE INDEX IF NOT EXISTS site_alum_sort_idx ON site_alumni(sort_order);
    `);

    // ── 3. tenant_id column + index on each site_* table, then backfill to CCM ──
    for (const { table, idx } of CONTENT_TABLES) {
      await client.query(`
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${table}') THEN
            ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id UUID;
            CREATE INDEX IF NOT EXISTS ${idx} ON ${table}(tenant_id);
          END IF;
        END $$;
      `);
      await client.query(
        `UPDATE ${table} SET tenant_id = $1 WHERE tenant_id IS NULL`,
        [ccmId],
      ).catch((err) => { logger.warn({ err, table }, "migrateTenants: backfill skipped/failed"); });
    }

    // ── 4. site_settings: tenant_id column, backfill, composite (tenant_id, key) PK ──
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'site_settings') THEN
          ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS tenant_id UUID;
        END IF;
      END $$;
    `);
    await client.query(
      `UPDATE site_settings SET tenant_id = $1 WHERE tenant_id IS NULL`,
      [ccmId],
    ).catch((err) => { logger.warn({ err }, "migrateTenants: site_settings backfill skipped/failed"); });
    // Rebuild the PK only if it is not already keyed on tenant_id.
    await client.query(`
      DO $$
      DECLARE pk_name TEXT;
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'site_settings') THEN
          RETURN;
        END IF;
        IF EXISTS (
          SELECT 1
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON kcu.constraint_name = tc.constraint_name
           WHERE tc.table_name = 'site_settings'
             AND tc.constraint_type = 'PRIMARY KEY'
             AND kcu.column_name = 'tenant_id'
        ) THEN
          RETURN; -- already composite
        END IF;
        ALTER TABLE site_settings ALTER COLUMN tenant_id SET NOT NULL;
        SELECT tc.constraint_name INTO pk_name
          FROM information_schema.table_constraints tc
         WHERE tc.table_name = 'site_settings' AND tc.constraint_type = 'PRIMARY KEY'
         LIMIT 1;
        IF pk_name IS NOT NULL THEN
          EXECUTE 'ALTER TABLE site_settings DROP CONSTRAINT ' || quote_ident(pk_name);
        END IF;
        ALTER TABLE site_settings ADD PRIMARY KEY (tenant_id, key);
      END $$;
    `);

    // ── 4b. media_library: tenant_id column + index, backfill to CCM ─────────
    // So inline website uploads can be registered per-tenant and each school's
    // media library stays private once reads become tenant-scoped.
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'media_library') THEN
          ALTER TABLE media_library ADD COLUMN IF NOT EXISTS tenant_id UUID;
          CREATE INDEX IF NOT EXISTS media_library_tenant_idx ON media_library(tenant_id);
        END IF;
      END $$;
    `);
    await client.query(
      `UPDATE media_library SET tenant_id = $1 WHERE tenant_id IS NULL`,
      [ccmId],
    ).catch((err) => { logger.warn({ err }, "migrateTenants: media_library backfill skipped/failed"); });

    // ── 5. Ensure the GCCM tenant exists ─────────────────────────────────────
    await client.query(
      `INSERT INTO tenants (name, slug, domain, site_theme)
       SELECT 'Girls Cadet College Murree', 'gccm', 'girlscadetcollege.com', 'gccm'
       WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'gccm')`,
    );
    await client.query(
      `UPDATE tenants
         SET domain     = COALESCE(domain, 'girlscadetcollege.com'),
             site_theme = COALESCE(NULLIF(site_theme, ''), 'gccm')
       WHERE slug = 'gccm'`,
    );

    // ── 6. Ensure the GCCM scoped admin user exists ──────────────────────────
    const { rowCount: tauExists } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'tenant_admin_users'`,
    );
    if (tauExists) {
      const { rows: gccmRows } = await client.query<{ id: string }>(
        `SELECT id FROM tenants WHERE slug = 'gccm' LIMIT 1`,
      );
      const gccmId = gccmRows[0]?.id;
      if (gccmId) {
        const username = "info@girlscadetcollege.com";
        const password = process.env["GCCM_ADMIN_PASSWORD"] ?? "Gccm@2026";
        await client.query(
          `INSERT INTO tenant_admin_users (tenant_id, username, password_hash, full_name, email, role)
           SELECT $1, $2, $3, 'GCCM Administrator', $2, 'admin'
           WHERE NOT EXISTS (SELECT 1 FROM tenant_admin_users WHERE username = $2)`,
          [gccmId, username, hashPasswordSync(password)],
        );
      }
    }
    // ── 7. Ensure "Student Portal" header nav item exists for every tenant ──────
    const { rowCount: menuTableExists } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'site_menu_items'`,
    );
    if (menuTableExists) {
      const { rows: tenantRows } = await client.query<{ id: string }>(`SELECT id FROM tenants`);
      for (const { id } of tenantRows) {
        await client.query(
          `INSERT INTO site_menu_items
             (tenant_id, label, link_type, target, is_published, sort_order, open_in_new_tab, is_cta, location)
           SELECT $1, 'Student Portal', 'url', '/portal', true,
             COALESCE((SELECT MAX(sort_order) FROM site_menu_items
                       WHERE tenant_id = $1 AND location = 'header' AND is_cta = false), -1) + 1,
             false, false, 'header'
           WHERE NOT EXISTS (
             SELECT 1 FROM site_menu_items
             WHERE tenant_id = $1 AND label = 'Student Portal' AND location = 'header'
           )`,
          [id],
        );
      }
    }
  } finally {
    client.release();
  }
}
