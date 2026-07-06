import { pool } from "@workspace/db";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

/**
 * Idempotent startup migration for the saas_admin_account table.
 * Creates the table if absent, then seeds one row from env vars if the table is empty.
 */
export async function migrateSaasAdminAccount(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS saas_admin_account (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username      TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        email         TEXT,
        token_version INTEGER NOT NULL DEFAULT 1,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Idempotent: add token_version column to existing tables that predate it
    await client.query(`
      ALTER TABLE saas_admin_account
        ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;
    `);

    const { rows } = await client.query(`SELECT id FROM saas_admin_account LIMIT 1`);
    if (rows.length === 0) {
      const username = process.env["SAAS_ADMIN_USERNAME"] ?? "saasadmin";
      const password = process.env["SAAS_ADMIN_PASSWORD"] ?? "saasadmin123";
      const email    = process.env["SAAS_ADMIN_EMAIL"] ?? null;
      const hash     = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await client.query(
        `INSERT INTO saas_admin_account (username, password_hash, email)
         VALUES ($1, $2, $3)`,
        [username, hash, email],
      );
      console.info(`[saas-admin-account] Seeded initial super-admin account (username: ${username})`);
    }
  } finally {
    client.release();
  }
}
