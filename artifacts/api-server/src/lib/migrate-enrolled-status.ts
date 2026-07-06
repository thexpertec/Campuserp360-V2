import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent reconciliation: any application that already has a matching student
 * record (a real enrolment) but whose status still reads `admitted` is corrected
 * to `enrolled` so the UI reflects reality without a per-row code redeploy.
 *
 * The student ↔ application match is tenant-scoped (tenant_id compared with
 * NOT DISTINCT FROM so NULL tenants still match) so a student from another
 * tenant can never flip an application's status. Safe to run on every boot —
 * it only touches drifted rows.
 */
export async function migrateEnrolledStatus(): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      UPDATE applications a
      SET status = 'enrolled'
      WHERE a.status = 'admitted'
        AND EXISTS (
          SELECT 1 FROM students s
          WHERE s.application_id = a.id
            AND s.tenant_id IS NOT DISTINCT FROM a.tenant_id
        )
    `);
    if (result.rowCount && result.rowCount > 0) {
      logger.info(
        { reconciled: result.rowCount },
        "Reconcile: set applications.status='enrolled' for rows that already have a student record",
      );
    }
  } catch (err) {
    logger.error({ err }, "migrateEnrolledStatus failed — continuing");
  } finally {
    client.release();
  }
}
