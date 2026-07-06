import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent bootstrap: for every student that has no `student_enrollments`
 * row, insert one using their current classCode / sectionId / houseId /
 * academicYearId. Safe to run on every boot — only inserts missing rows.
 */
export async function migrateStudentEnrollments(): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      INSERT INTO student_enrollments (student_id, academic_year_id, class_code, section_id, house_id, start_date, status)
      SELECT
        s.id,
        s.academic_year_id,
        s.class_code,
        s.section_id,
        s.house_id,
        COALESCE(s.enrollment_date, to_char(s.created_at, 'YYYY-MM-DD')),
        'active'
      FROM students s
      WHERE NOT EXISTS (
        SELECT 1 FROM student_enrollments se
        WHERE se.student_id = s.id
          AND (
            se.academic_year_id = s.academic_year_id
            OR (se.academic_year_id IS NULL AND s.academic_year_id IS NULL)
          )
      )
      ON CONFLICT DO NOTHING
    `);
    if (result.rowCount && result.rowCount > 0) {
      logger.info({ bootstrapped: result.rowCount }, "Bootstrap: created student_enrollments rows for existing students");
    }
  } catch (err) {
    logger.error({ err }, "migrateStudentEnrollments failed — continuing");
  } finally {
    client.release();
  }
}
