import { pool } from "@workspace/db";

/**
 * Idempotent startup migration for the per-tenant admission form field config.
 *
 * Creates `admission_form_config` with one row per (tenant_id, field_key) pair.
 * Safe to run on every boot — IF NOT EXISTS and ON CONFLICT guards prevent
 * re-execution on databases that already have the table or data.
 */
const CONFIGURABLE_FIELD_KEYS = [
  "gender", "bloodGroup", "religion", "photo",
  "studentMobile", "studentEmail", "state", "city", "examCenter",
  "relation", "occupation", "studentBForm",
  "nationality", "domicile", "motherName", "guardianEmail", "alternatePhone",
] as const;

export async function migrateFormConfig(): Promise<void> {
  const client = await pool.connect();
  try {
    // 1. Create the form-config config table
    await client.query(`
      CREATE TABLE IF NOT EXISTS admission_form_config (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   UUID    NOT NULL,
        field_key   TEXT    NOT NULL,
        enabled     BOOLEAN NOT NULL DEFAULT true,
        required    BOOLEAN NOT NULL DEFAULT true,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, field_key)
      );
    `);

    // 2. Ensure configurable columns on the applications table accept empty strings
    //    (they are NOT NULL with a default of '' so disabled-field submissions land safely).
    const defaultEmptyCols = [
      "blood_group", "student_mobile", "student_email",
      "state", "city", "exam_center", "relation",
    ] as const;
    for (const col of defaultEmptyCols) {
      await client.query(
        `ALTER TABLE applications ALTER COLUMN ${col} SET DEFAULT '';`
      ).catch(() => { /* column may not exist yet or already set — safe to ignore */ });
    }

    // 3. Seed default (all-enabled) config rows for every tenant that doesn't
    //    have rows yet. Uses ON CONFLICT DO NOTHING so re-runs are idempotent.
    const fieldValuesList = CONFIGURABLE_FIELD_KEYS.map((_, i) => `$${i + 1}`).join(", ");
    await client.query(
      `INSERT INTO admission_form_config (id, tenant_id, field_key, enabled, required, updated_at)
       SELECT gen_random_uuid(), t.id, f.field_key, true, true, now()
       FROM tenants t
       CROSS JOIN (VALUES ${CONFIGURABLE_FIELD_KEYS.map((k, i) => `($${i + 1})`).join(", ")}) AS f(field_key)
       ON CONFLICT DO NOTHING;`,
      [...CONFIGURABLE_FIELD_KEYS],
    );
  } finally {
    client.release();
  }
}
