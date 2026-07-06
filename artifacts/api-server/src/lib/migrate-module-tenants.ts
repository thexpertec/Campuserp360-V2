import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent startup migration for module-level tenant isolation.
 *
 * Adds `tenant_id UUID REFERENCES tenants(id)` to all module tables that
 * were built before per-tenant isolation was introduced, then backfills every
 * existing row to the CCM tenant so legacy data stays visible after the
 * routes start filtering by tenantId.
 *
 * Also backfills tables already added by migrateSaas (classes, academic_years,
 * sections, etc.) that had the column added but were never backfilled.
 *
 * Safe to run on every boot — all DDL is guarded by IF NOT EXISTS / IF EXISTS.
 */
export async function migrateModuleTenants(): Promise<void> {
  const client = await pool.connect();
  try {
    const { rowCount: tenantsExists } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'tenants'`,
    );
    if (!tenantsExists) return;

    const { rows: ccmRows } = await client.query<{ id: string }>(
      `SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1`,
    );
    const ccmId = ccmRows[0]?.id;
    if (!ccmId) return;

    const tables = [
      // ── Timetable ──────────────────────────────────────────────────────────
      "timetable_periods",
      "timetable_slots",
      "teacher_subject_assignments",
      // ── Academic (not already handled by migrateSaas) ─────────────────────
      "class_categories",
      "houses",
      "affiliations",
      "terms_conditions",
      "school_calendar_weekends",
      "school_holidays",
      // ── Exams ─────────────────────────────────────────────────────────────
      "exam_types",
      "exam_grading_scales",
      "exam_grade_bands",
      "exam_schedules",
      // ── Sports ────────────────────────────────────────────────────────────
      "sports_categories",
      "sports_venues",
      "sports_teams",
      "sports_fixtures",
      // ── Store ─────────────────────────────────────────────────────────────
      "store_item_categories",
      "store_units",
      "store_items",
      "store_transactions",
      // ── Transport ─────────────────────────────────────────────────────────
      "transport_vehicles",
      "transport_routes",
      "transport_drivers",
      "transport_trips",
      // ── Syllabus ──────────────────────────────────────────────────────────
      "syllabus_units",
      "syllabus_topics",
      // ── Bank accounts ─────────────────────────────────────────────────────
      "bank_accounts",
      // ── Events ────────────────────────────────────────────────────────────
      "events",
      // ── Academic tables already in migrateSaas but never backfilled ───────
      "academic_years",
      "academic_terms",
      "classes",
      "sections",
      "subjects",
      "class_categories",
      "class_sections",
      "class_subjects",
      "class_academic_years",
      "section_allocations",
    ];

    const seen = new Set<string>();
    for (const table of tables) {
      if (seen.has(table)) continue;
      seen.add(table);
      try {
        await client.query(`
          DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${table}') THEN
              ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;
              CREATE INDEX IF NOT EXISTS ${table}_tenant_id_idx ON ${table}(tenant_id);
            END IF;
          END $$;
        `);
        await client.query(
          `UPDATE ${table} SET tenant_id = $1 WHERE tenant_id IS NULL`,
          [ccmId],
        );
      } catch (err) {
        logger.warn({ err, table }, "migrateModuleTenants: column/backfill failed for table");
      }
    }
  } finally {
    client.release();
  }
}
