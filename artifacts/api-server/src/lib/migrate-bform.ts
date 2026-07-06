import { pool } from "@workspace/db";

/**
 * Idempotent startup migration for the student B-form field.
 *
 * Adds `student_b_form` (text, nullable) to the applications table and creates
 * a composite index on (tenant_id, student_b_form) to support fast duplicate
 * detection queries. Safe to run on every boot — IF NOT EXISTS guards prevent
 * double-execution on databases that already have the column/index.
 *
 * The column stores the student's national identity number (B-form for minors,
 * CNIC for adults) in canonical formatted form (xxxxx-xxxxxxx-x) as produced by
 * formatCnic() in routes/applications.ts. NULL is stored when the applicant did
 * not provide a B-form number.
 */
export async function migrateBForm(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS student_b_form TEXT;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS applications_bform_idx
        ON applications (tenant_id, student_b_form);
    `);
  } finally {
    client.release();
  }
}
