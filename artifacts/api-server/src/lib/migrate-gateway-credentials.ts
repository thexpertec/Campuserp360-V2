/**
 * Idempotent startup migration for `gateway_credentials`.
 * Creates the table if it doesn't exist. Safe to run on every boot.
 * Must run AFTER migrateTenants() so the tenants table exists.
 */
import { pool } from "@workspace/db";

export async function migrateGatewayCredentials(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS gateway_credentials (
        id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id               UUID        NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
        jazzcash_merchant_id    TEXT,
        jazzcash_password       TEXT,
        jazzcash_integrity_salt TEXT,
        jazzcash_mode           TEXT        NOT NULL DEFAULT 'sandbox',
        payfast_merchant_id     TEXT,
        payfast_secured_key     TEXT,
        payfast_merchant_name   TEXT,
        payfast_mode            TEXT        NOT NULL DEFAULT 'sandbox',
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  } finally {
    client.release();
  }
}
