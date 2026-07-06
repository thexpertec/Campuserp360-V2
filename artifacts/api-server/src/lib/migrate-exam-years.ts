import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * One-time back-fill: set academic_year_id on exam_schedules rows by matching
 * session_label against academic_years.name. Safe to run on every boot —
 * only updates rows where academic_year_id IS NULL.
 */
export async function migrateExamScheduleYears(): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      UPDATE exam_schedules es
      SET    academic_year_id = ay.id
      FROM   academic_years ay
      WHERE  es.session_label = ay.name
        AND  es.academic_year_id IS NULL
    `);
    if (result.rowCount && result.rowCount > 0) {
      logger.info({ updated: result.rowCount }, "Back-filled academic_year_id on exam_schedules");
    }
  } catch (err) {
    logger.error({ err }, "migrateExamScheduleYears failed — continuing");
  } finally {
    client.release();
  }
}
