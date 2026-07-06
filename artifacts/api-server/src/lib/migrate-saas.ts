import { pool } from "@workspace/db";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const BCRYPT_ROUNDS = 12;

function hashPw(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

function randomPassword(len = 16): string {
  return crypto.randomBytes(len).toString("base64url").slice(0, len);
}

/**
 * Idempotent startup migration for the SaaS multi-tenancy system.
 * Safe to run on every boot — all DDL uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
 */
export async function migrateSaas(): Promise<void> {
  const client = await pool.connect();
  try {
    // ── Core SaaS tables ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name          TEXT NOT NULL,
        slug          TEXT NOT NULL UNIQUE,
        contact_email TEXT,
        plan          TEXT NOT NULL DEFAULT 'basic',
        is_active     BOOLEAN NOT NULL DEFAULT TRUE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_admin_users (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        username      TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        full_name     TEXT NOT NULL,
        email         TEXT,
        role          TEXT NOT NULL DEFAULT 'admin',
        is_active     BOOLEAN NOT NULL DEFAULT TRUE,
        last_login_at TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, username)
      );
    `);

    // ── tenant_id columns on existing domain tables ──────────────────────────
    // Nullable — existing rows are treated as global/CCM (tenantId = null).
    const domainTables = [
      "applications", "students", "classes", "sections", "class_sections",
      "subjects", "class_subjects", "class_academic_years", "academic_years",
      "academic_terms", "section_allocations", "fee_types", "fee_schedule",
      "fee_challans", "employees", "hr_departments", "hr_designations",
      "hr_salary_grades", "hostel_rooms", "hostel_allocations",
      "library_books", "library_issues",
    ];
    for (const tbl of domainTables) {
      await client.query(
        `ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);`
      ).catch(() => {}); // table may not exist yet — ignore
    }

    // ── tenant_id on admin_users (super-admin has NULL tenant_id) ─────────────
    await client.query(
      `ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);`
    ).catch(() => {});

    // ── Unique constraint: (username, tenant_id) on tenant_admin_users ────────
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'tenant_admin_users_username_key'
        ) THEN
          ALTER TABLE tenant_admin_users ADD CONSTRAINT tenant_admin_users_username_key UNIQUE (username);
        END IF;
      END $$;
    `);

    // ── Seed a demo tenant if none exist yet ──────────────────────────────────
    const { rows } = await client.query(`SELECT id FROM tenants LIMIT 1`);
    if (rows.length === 0) {
      const tenantRes = await client.query(
        `INSERT INTO tenants (name, slug, contact_email, plan, is_active)
         VALUES ('Cadet College Murree', 'ccm', 'admin@ccm.edu.pk', 'premium', TRUE)
         RETURNING id`,
      );
      const tenantId = tenantRes.rows[0].id as string;

      // Generate a random initial password — do NOT use a hardcoded default
      const initialPassword = randomPassword(16);
      await client.query(
        `INSERT INTO tenant_admin_users (tenant_id, username, password_hash, full_name, role)
         VALUES ($1, 'admin', $2, 'Administrator', 'admin')`,
        [tenantId, hashPw(initialPassword)],
      );
      console.info(
        `\n[saas-migrate] Demo tenant created.\n` +
        `  Username: admin\n` +
        `  Password: ${initialPassword}\n` +
        `  ⚠️  Change this password immediately via SaaS Admin → Tenants → Admins.\n`
      );
    }
  } finally {
    client.release();
  }
}
