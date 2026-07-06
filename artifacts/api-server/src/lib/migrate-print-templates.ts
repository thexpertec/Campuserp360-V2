import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent startup migration for the print_templates table.
 *
 * 1. Adds the `purpose` column (nullable text) if it does not already exist.
 * 2. Makes the table tenant-scoped: adds `tenant_id` (+ index), backfills any
 *    legacy rows to the CCM tenant, drops the old GLOBAL unique constraint on
 *    `type`, and replaces it with a composite unique `(tenant_id, type)`.
 * 3. Enforces "at most one template per purpose PER COLLEGE" via a partial
 *    unique index on `(tenant_id, purpose)` WHERE purpose IS NOT NULL.
 *
 * Safe to run on every boot — all DDL is guarded by IF EXISTS / IF NOT EXISTS.
 * The table is currently empty, so the backfill is a no-op in practice.
 */
export async function migratePrintTemplates(): Promise<void> {
  const client = await pool.connect();
  try {
    const { rowCount: tableExists } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'print_templates'`,
    );
    if (!tableExists) return;

    // 1. purpose column
    await client.query(`ALTER TABLE print_templates ADD COLUMN IF NOT EXISTS purpose TEXT`);

    // 2. tenant_id column + index
    await client.query(`ALTER TABLE print_templates ADD COLUMN IF NOT EXISTS tenant_id UUID`);
    await client.query(`CREATE INDEX IF NOT EXISTS print_templates_tenant_idx ON print_templates(tenant_id)`);

    // Backfill any legacy rows to the CCM tenant so they stay visible once reads
    // become tenant-scoped. (Table is empty today; guarded so it is a no-op then.)
    const { rows: ccmRows } = await client.query<{ id: string }>(
      `SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1`,
    );
    const ccmId = ccmRows[0]?.id;
    if (ccmId) {
      await client.query(
        `UPDATE print_templates SET tenant_id = $1 WHERE tenant_id IS NULL`,
        [ccmId],
      ).catch((err) => { logger.warn({ err }, "migratePrintTemplates: backfill skipped/failed"); });
    }

    // 3. Drop the old GLOBAL unique on `type` (name varies by how it was created)
    //    and replace with composite unique (tenant_id, type).
    await client.query(`
      DO $$
      DECLARE c RECORD;
      BEGIN
        FOR c IN
          SELECT tc.constraint_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON kcu.constraint_name = tc.constraint_name
           WHERE tc.table_name = 'print_templates'
             AND tc.constraint_type = 'UNIQUE'
             AND kcu.column_name = 'type'
           GROUP BY tc.constraint_name
          HAVING COUNT(*) = 1   -- single-column (type-only) unique constraints only
        LOOP
          EXECUTE 'ALTER TABLE print_templates DROP CONSTRAINT ' || quote_ident(c.constraint_name);
        END LOOP;
      END $$;
    `);
    // A stray single-column unique index (not backed by a constraint) could also exist.
    await client.query(`DROP INDEX IF EXISTS print_templates_type_unique`);
    await client.query(`DROP INDEX IF EXISTS print_templates_type_key`);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS print_templates_tenant_type_uniq
        ON print_templates(tenant_id, type)
    `);

    // 4. At most one template per purpose, per college.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS print_templates_tenant_purpose_uniq
        ON print_templates(tenant_id, purpose)
        WHERE purpose IS NOT NULL
    `);
  } catch (err) {
    logger.warn({ err }, "migratePrintTemplates: migration failed");
  } finally {
    client.release();
  }
}
