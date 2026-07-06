/**
 * Idempotent startup migration for `admission_payment_config`.
 * Creates the table if it doesn't exist. Safe to run on every boot.
 * Must run AFTER migrateTenants() so the tenants table is guaranteed to exist.
 */
import { pool } from "@workspace/db";

export async function migratePaymentConfig(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS admission_payment_config (
        id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id              UUID        NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
        application_fee_amount INTEGER     NOT NULL DEFAULT 2000,
        admission_fee_amount   INTEGER     NOT NULL DEFAULT 15000,
        bank_name              TEXT        NOT NULL DEFAULT 'National Bank of Pakistan',
        bank_branch            TEXT        NOT NULL DEFAULT '',
        account_title          TEXT        NOT NULL DEFAULT '',
        account_number         TEXT        NOT NULL DEFAULT '0004-6000-2000-3201',
        challan_instructions   TEXT        NOT NULL DEFAULT '',
        enable_bank_deposit    BOOLEAN     NOT NULL DEFAULT true,
        enable_jazzcash        BOOLEAN     NOT NULL DEFAULT true,
        enable_payfast         BOOLEAN     NOT NULL DEFAULT true,
        application_fee_enabled BOOLEAN   NOT NULL DEFAULT true,
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    // Backfill column for existing tables created before this column was added
    await client.query(`
      ALTER TABLE admission_payment_config
        ADD COLUMN IF NOT EXISTS application_fee_enabled BOOLEAN NOT NULL DEFAULT true;
    `);
  } finally {
    client.release();
  }
}
