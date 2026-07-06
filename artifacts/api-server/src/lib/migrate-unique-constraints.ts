import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent startup migration: replaces global unique constraints with
 * composite (tenant_id, name/code) unique indexes so names are only unique
 * within a tenant, not across all tenants.
 *
 * Safe to run on every boot — all DDL uses IF EXISTS / IF NOT EXISTS.
 */
export async function migrateUniqueConstraints(): Promise<void> {
  const client = await pool.connect();
  try {
    // Each entry: [table, oldConstraintName, newIndexName, columns]
    const migrations: Array<[string, string, string, string]> = [
      // academic_years
      ["academic_years",    "academic_years_name_unique",         "academic_years_tenant_name_uniq",            "(tenant_id, name)"],
      // class_categories
      ["class_categories",  "class_categories_name_unique",       "class_categories_tenant_name_uniq",          "(tenant_id, name)"],
      // classes (code was the unique key, now composite with tenant_id)
      ["classes",           "classes_code_unique",                "classes_tenant_code_uniq",                   "(tenant_id, code)"],
      // sections
      ["sections",          "sections_name_unique",               "sections_tenant_name_uniq",                  "(tenant_id, name)"],
      // houses
      ["houses",            "houses_name_unique",                 "houses_tenant_name_uniq",                    "(tenant_id, name)"],
      // academic_terms
      ["academic_terms",    "academic_terms_name_unique",         "academic_terms_tenant_name_uniq",            "(tenant_id, name)"],
      // affiliations
      ["affiliations",      "affiliations_name_unique",           "affiliations_tenant_name_uniq",              "(tenant_id, name)"],
      // terms_conditions (unique on title)
      ["terms_conditions",  "terms_conditions_title_unique",      "terms_conditions_tenant_title_uniq",         "(tenant_id, title)"],
      // subjects
      ["subjects",          "subjects_code_unique",               "subjects_tenant_code_uniq",                  "(tenant_id, code)"],
      // exam_types
      ["exam_types",        "exam_types_name_unique",             "exam_types_tenant_name_uniq",                "(tenant_id, name)"],
      // exam_grading_scales
      ["exam_grading_scales", "exam_grading_scales_name_unique",  "exam_grading_scales_tenant_name_uniq",       "(tenant_id, name)"],
      // sports_categories
      ["sports_categories", "sports_categories_name_unique",      "sports_categories_tenant_name_uniq",         "(tenant_id, name)"],
      // sports_venues
      ["sports_venues",     "sports_venues_name_unique",          "sports_venues_tenant_name_uniq",             "(tenant_id, name)"],
      // sports_teams
      ["sports_teams",      "sports_teams_name_unique",           "sports_teams_tenant_name_uniq",              "(tenant_id, name)"],
      // store_units
      ["store_units",       "store_units_name_unique",            "store_units_tenant_name_uniq",               "(tenant_id, name)"],
      // store_items
      ["store_items",       "store_items_name_unique",            "store_items_tenant_name_uniq",               "(tenant_id, name)"],
      // transport_vehicles (reg_no was global unique)
      ["transport_vehicles","transport_vehicles_reg_no_unique",   "transport_vehicles_tenant_regno_uniq",       "(tenant_id, reg_no)"],
      // transport_routes
      ["transport_routes",  "transport_routes_name_unique",       "transport_routes_tenant_name_uniq",          "(tenant_id, name)"],
      // timetable_periods (name was global unique)
      ["timetable_periods", "timetable_periods_name_unique",      "timetable_periods_tenant_name_uniq",         "(tenant_id, name)"],
      // events (slug was global unique)
      ["events",            "events_slug_unique",                 "events_tenant_slug_uniq",                    "(tenant_id, slug)"],
      // class_subjects: add tenant_id column scoped unique (old global unique stays for existing rows)
      ["class_subjects",    "class_subjects_unique",              "class_subjects_tenant_class_subject_uniq",   "(tenant_id, class_id, subject_id)"],
    ];

    for (const [table, oldConstraint, newIndex, columns] of migrations) {
      try {
        await client.query(`
          DO $$ BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.tables WHERE table_name = '${table}'
            ) THEN
              -- Drop the old global unique constraint if still present
              ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS "${oldConstraint}";
              -- Create the new composite unique index if not yet created
              IF NOT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE tablename = '${table}' AND indexname = '${newIndex}'
              ) THEN
                CREATE UNIQUE INDEX "${newIndex}" ON ${table} ${columns};
              END IF;
            END IF;
          END $$;
        `);
      } catch (err) {
        logger.warn({ err, table, oldConstraint, newIndex }, "migrateUniqueConstraints: failed for table");
      }
    }

    // ── class_subjects: add tenant_id column if not already present ──────────────
    try {
      await client.query(`
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'class_subjects'
          ) THEN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'class_subjects' AND column_name = 'tenant_id'
            ) THEN
              ALTER TABLE class_subjects ADD COLUMN tenant_id uuid;
            END IF;
          END IF;
        END $$;
      `);
    } catch (err) {
      logger.warn({ err }, "migrateUniqueConstraints: class_subjects tenant_id column add failed");
    }

    // ── School calendar weekends: old index was (year_id, audience), now (tenant_id, year_id, audience) ──
    try {
      await client.query(`
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'school_calendar_weekends'
          ) THEN
            DROP INDEX IF EXISTS school_calendar_weekends_year_audience_uniq;
            IF NOT EXISTS (
              SELECT 1 FROM pg_indexes
              WHERE tablename = 'school_calendar_weekends'
                AND indexname = 'school_calendar_weekends_tenant_year_audience_uniq'
            ) THEN
              CREATE UNIQUE INDEX school_calendar_weekends_tenant_year_audience_uniq
                ON school_calendar_weekends (tenant_id, year_id, audience);
            END IF;
          END IF;
        END $$;
      `);
    } catch (err) {
      logger.warn({ err }, "migrateUniqueConstraints: school_calendar_weekends index migration failed");
    }

    // students.application_id must be unique when set — prevents double-enrollment races
    try {
      await client.query(`
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'students'
          ) THEN
            IF NOT EXISTS (
              SELECT 1 FROM pg_indexes
              WHERE tablename = 'students' AND indexname = 'students_application_id_uniq'
            ) THEN
              CREATE UNIQUE INDEX students_application_id_uniq
                ON students (application_id)
                WHERE application_id IS NOT NULL;
            END IF;
          END IF;
        END $$;
      `);
    } catch (err) {
      logger.warn({ err }, "migrateUniqueConstraints: students application_id unique index failed");
    }

  } finally {
    client.release();
  }
}
