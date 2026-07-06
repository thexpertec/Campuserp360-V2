import { pgTable, uuid, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const CONFIGURABLE_FORM_FIELDS = [
  "gender",
  "bloodGroup",
  "religion",
  "photo",
  "studentMobile",
  "studentEmail",
  "state",
  "city",
  "examCenter",
  "relation",
  "occupation",
  "studentBForm",
  "nationality",
  "domicile",
  "motherName",
  "guardianEmail",
  "alternatePhone",
] as const;

export type ConfigurableFormField = typeof CONFIGURABLE_FORM_FIELDS[number];

export const admissionFormConfigTable = pgTable(
  "admission_form_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    fieldKey: text("field_key").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    required: boolean("required").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    tenantFieldUnique: uniqueIndex("admission_form_config_tenant_field_unique").on(
      t.tenantId,
      t.fieldKey,
    ),
  }),
);

export type AdmissionFormConfig = typeof admissionFormConfigTable.$inferSelect;
