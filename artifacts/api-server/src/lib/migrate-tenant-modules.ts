import { pool } from "@workspace/db";
import { MODULES } from "@workspace/db/moduleRegistry";

/**
 * Idempotent startup migration for the tenant_module_permissions table.
 * Safe to run on every boot — all DDL uses IF NOT EXISTS / ON CONFLICT DO NOTHING.
 *
 * Must run AFTER migrateSaas() because it references the tenants table.
 */
export async function migrateTenantModulePermissions(): Promise<void> {
  const client = await pool.connect();
  try {
    // Ensure the table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_module_permissions (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        module_key TEXT NOT NULL,
        enabled    BOOLEAN NOT NULL DEFAULT TRUE,
        config     JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, module_key)
      );
    `);

    // Backfill: for every existing tenant, insert a row for every known module
    // (enabled=true by default). ON CONFLICT DO NOTHING makes this idempotent.
    const { rows: tenants } = await client.query<{ id: string }>(
      `SELECT id FROM tenants`,
    );

    if (tenants.length > 0) {
      for (const tenant of tenants) {
        for (const mod of MODULES) {
          await client.query(
            `INSERT INTO tenant_module_permissions (tenant_id, module_key, enabled, config)
             VALUES ($1, $2, TRUE, '{}')
             ON CONFLICT (tenant_id, module_key) DO NOTHING`,
            [tenant.id, mod.key],
          );
        }
      }
    }
  } finally {
    client.release();
  }
}
