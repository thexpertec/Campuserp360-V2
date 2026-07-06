/**
 * Migration: create tenant_module_permissions table.
 * Run: node artifacts/api-server/scripts/migrate-tenant-module-permissions.mjs
 */
import pg from "pg";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: No database connection string found (NEON_DATABASE_URL or DATABASE_URL).");
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString, ssl: connectionString.includes("neon.tech") ? { rejectUnauthorized: false } : false });

const sql = `
CREATE TABLE IF NOT EXISTS tenant_module_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_key  TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  config      JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_module_permissions_tenant_module_uniq
  ON tenant_module_permissions (tenant_id, module_key);

CREATE INDEX IF NOT EXISTS tenant_module_permissions_tenant_idx
  ON tenant_module_permissions (tenant_id);
`;

try {
  const client = await pool.connect();
  await client.query(sql);
  client.release();
  console.log("[migration] tenant_module_permissions table created (or already exists).");
} catch (err) {
  console.error("[migration] FAILED:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
