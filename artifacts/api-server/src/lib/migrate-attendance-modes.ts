import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent startup migration for configurable staff attendance (Task 83).
 *
 * 1. Adds per-employee attendance configuration columns (attendance_mode,
 *    scheduled_start_time, scheduled_end_time, grace_minutes).
 * 2. Adds hr_attendance rollup/flag columns (early_departure, lectures_attended,
 *    lectures_total), de-duplicates any existing (employee_id, attendance_date)
 *    rows, then enforces one attendance row per employee per day via a unique
 *    index (required for the lecture-based rollup upsert).
 * 3. Creates the hr_lecture_attendance table (+ indexes) for per-lecture marking.
 * 4. Backfills timetable_slots.teacher_employee_id from teacher_name where the
 *    name resolves unambiguously to a single employee within the tenant, so
 *    lecture-based attendance can reliably find a teacher's scheduled lectures.
 *
 * Safe to run on every boot — all DDL is guarded by IF EXISTS / IF NOT EXISTS.
 */
export async function migrateAttendanceModes(): Promise<void> {
  const client = await pool.connect();
  try {
    // 1. Per-employee attendance configuration ────────────────────────────────
    const { rowCount: employeesExists } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'employees'`,
    );
    if (employeesExists) {
      await client.query(
        `ALTER TABLE employees ADD COLUMN IF NOT EXISTS attendance_mode TEXT NOT NULL DEFAULT 'time_based'`,
      );
      await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS scheduled_start_time TEXT`);
      await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS scheduled_end_time TEXT`);
      await client.query(
        `ALTER TABLE employees ADD COLUMN IF NOT EXISTS grace_minutes INTEGER NOT NULL DEFAULT 0`,
      );
    }

    // 2. hr_attendance rollup/flag columns + one-row-per-day uniqueness ────────
    const { rowCount: attExists } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'hr_attendance'`,
    );
    if (attExists) {
      await client.query(
        `ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS early_departure BOOLEAN NOT NULL DEFAULT false`,
      );
      await client.query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS lectures_attended INTEGER`);
      await client.query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS lectures_total INTEGER`);

      // De-duplicate before adding the unique index — keep the most recently
      // updated row per (employee_id, attendance_date).
      await client.query(`
        DELETE FROM hr_attendance a
        USING hr_attendance b
        WHERE a.employee_id = b.employee_id
          AND a.attendance_date = b.attendance_date
          AND (a.updated_at < b.updated_at
               OR (a.updated_at = b.updated_at AND a.ctid < b.ctid))
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS hr_attendance_emp_date_uniq
          ON hr_attendance(employee_id, attendance_date)
      `);
    }

    // 3. Per-lecture attendance table ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_lecture_attendance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL,
        attendance_date TEXT NOT NULL,
        slot_id UUID NOT NULL,
        period_id UUID,
        present BOOLEAN NOT NULL DEFAULT true,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS hr_lecture_att_emp_date_idx
        ON hr_lecture_attendance(employee_id, attendance_date)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS hr_lecture_att_emp_date_slot_uniq
        ON hr_lecture_attendance(employee_id, attendance_date, slot_id)
    `);

    // 4. Challan settings logo_url / logo_url_right columns ───────────────────
    const { rowCount: challanSettingsExists } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'challan_settings'`,
    );
    if (challanSettingsExists) {
      await client.query(
        `ALTER TABLE challan_settings ADD COLUMN IF NOT EXISTS logo_url TEXT`,
      );
      await client.query(
        `ALTER TABLE challan_settings ADD COLUMN IF NOT EXISTS logo_url_right TEXT`,
      );
    }

    // 5. Backfill timetable_slots.teacher_employee_id from teacher_name ────────
    const { rowCount: slotsExists } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'timetable_slots'`,
    );
    if (slotsExists && employeesExists) {
      await client.query(`
        UPDATE timetable_slots s
           SET teacher_employee_id = e.id
          FROM employees e
         WHERE s.teacher_employee_id IS NULL
           AND s.teacher_name IS NOT NULL
           AND s.teacher_name = e.full_name
           AND e.tenant_id = s.tenant_id
           AND (
             SELECT COUNT(*) FROM employees e2
              WHERE e2.tenant_id = s.tenant_id
                AND e2.full_name = s.teacher_name
           ) = 1
      `).catch((err) => {
        logger.warn({ err }, "migrateAttendanceModes: teacher_employee_id backfill skipped/failed");
      });
    }
  } catch (err) {
    logger.warn({ err }, "migrateAttendanceModes: migration failed");
  } finally {
    client.release();
  }
}
