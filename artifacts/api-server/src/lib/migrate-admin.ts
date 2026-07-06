import { pool } from "@workspace/db";
import { hashPasswordSync } from "./admin-auth";

/**
 * Idempotent startup migration for the maker-checker admin system.
 * Uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so it is safe to run on
 * every boot — including databases that already have these objects.
 */
export async function migrateAdminSystem(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username     TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name    TEXT NOT NULL,
        email        TEXT,
        is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
        is_active    BOOLEAN NOT NULL DEFAULT TRUE,
        last_login_at TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_user_roles (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        module     TEXT NOT NULL,
        permission TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, module)
      );
    `);

    // journal_entries — maker-checker columns (skip if table doesn't exist yet)
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') THEN
          ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES admin_users(id);
          ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES admin_users(id);
          ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
          -- Finance maker-checker: draft JEs wait for checker approval before posting
          ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted';
        END IF;
      END $$;
    `);

    // exam_schedules — maker-checker columns (skip if table doesn't exist yet)
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'exam_schedules') THEN
          ALTER TABLE exam_schedules ADD COLUMN IF NOT EXISTS results_status TEXT NOT NULL DEFAULT 'pending';
          ALTER TABLE exam_schedules ADD COLUMN IF NOT EXISTS marks_entered_by UUID REFERENCES admin_users(id);
          ALTER TABLE exam_schedules ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES admin_users(id);
          ALTER TABLE exam_schedules ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
        END IF;
      END $$;
    `);

    // fee_challans — maker-checker columns (skip if table doesn't exist yet)
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fee_challans') THEN
          ALTER TABLE fee_challans ADD COLUMN IF NOT EXISTS collected_by UUID REFERENCES admin_users(id);
          ALTER TABLE fee_challans ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES admin_users(id);
          ALTER TABLE fee_challans ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
        END IF;
      END $$;
    `);

    // employee_salary_transactions — maker-checker columns (skip if table doesn't exist yet)
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_salary_transactions') THEN
          ALTER TABLE employee_salary_transactions ADD COLUMN IF NOT EXISTS prepared_by UUID REFERENCES admin_users(id);
          ALTER TABLE employee_salary_transactions ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES admin_users(id);
          ALTER TABLE employee_salary_transactions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
        END IF;
      END $$;
    `);

    // vouchers — maker-checker: track who created for self-approval guard
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vouchers') THEN
          ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES admin_users(id);
        END IF;
      END $$;
    `);

    // fine_rules — fine configuration per tenant / academic year / fine type
    await client.query(`
      CREATE TABLE IF NOT EXISTS fine_rules (
        id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id        UUID        NOT NULL,
        academic_year_id UUID        NOT NULL,
        fine_type        TEXT        NOT NULL,
        class_code       TEXT,
        threshold        INTEGER     NOT NULL DEFAULT 0,
        fine_amount      INTEGER     NOT NULL DEFAULT 0,
        fine_mode        TEXT        NOT NULL DEFAULT 'flat',
        active           BOOLEAN     NOT NULL DEFAULT TRUE,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, academic_year_id, fine_type, class_code)
      );
    `);

    // fee_challans — late_fine_applied flag (added after initial table creation)
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fee_challans') THEN
          ALTER TABLE fee_challans ADD COLUMN IF NOT EXISTS late_fine_applied BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;
      END $$;
    `);

    // Bootstrap: seed default super-admin from env vars if none exists yet.
    // Passwords are now hashed with bcrypt (rounds=12).
    const ADMIN_USERNAME = process.env["ADMIN_USERNAME"] ?? "admin";
    const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"] ?? "admin123";
    await client.query(
      `INSERT INTO admin_users (username, password_hash, full_name, is_super_admin)
       SELECT $1, $2, 'Administrator', TRUE
       WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE is_super_admin = TRUE)`,
      [ADMIN_USERNAME, hashPasswordSync(ADMIN_PASSWORD)],
    );
  } finally {
    client.release();
  }
}
