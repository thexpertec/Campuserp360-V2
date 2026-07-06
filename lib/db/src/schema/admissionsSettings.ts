import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const admissionsSettingsTable = pgTable(
  "admissions_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    keyUnique: uniqueIndex("admissions_settings_key_unique").on(t.key),
  }),
);

export type AdmissionsSetting = typeof admissionsSettingsTable.$inferSelect;

// Well-known keys:
// admissions_open   → "true" | "false"
// admissions_deadline → ISO date string e.g. "2026-06-30"
// admissions_session  → "2026-2027"
