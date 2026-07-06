import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { adminUsersTable } from "./adminUsers";
import { academicYearsTable } from "./academic";
import { studentsTable } from "./students";

export const batchPrintJobsTable = pgTable("batch_print_jobs", {
  id:             uuid("id").primaryKey().defaultRandom(),
  tenantId:       uuid("tenant_id"),
  adminUserId:    uuid("admin_user_id").references(() => adminUsersTable.id, { onDelete: "set null" }),
  documentType:   text("document_type").notNull(),
  academicYearId: uuid("academic_year_id").references(() => academicYearsTable.id, { onDelete: "set null" }),
  studentIds:     jsonb("student_ids").notNull().$type<string[]>().default([]),
  mergeValues:    jsonb("merge_values").$type<Record<string, string>>().default({}),
  classCodes:     text("class_codes"),
  sectionIds:     text("section_ids"),
  status:         text("status").notNull().default("generated"),
  generatedAt:    timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  printedAt:      timestamp("printed_at", { withTimezone: true }),
  printedByAdminId: uuid("printed_by_admin_id").references(() => adminUsersTable.id, { onDelete: "set null" }),
});

export const studentPrintRecordsTable = pgTable("student_print_records", {
  id:             uuid("id").primaryKey().defaultRandom(),
  tenantId:       uuid("tenant_id"),
  studentId:      uuid("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  documentType:   text("document_type").notNull(),
  academicYearId: uuid("academic_year_id").references(() => academicYearsTable.id, { onDelete: "set null" }),
  status:         text("status").notNull().default("generated"),
  printedAt:      timestamp("printed_at", { withTimezone: true }),
  batchJobId:     uuid("batch_job_id").references(() => batchPrintJobsTable.id, { onDelete: "set null" }),
});

export type BatchPrintJob         = typeof batchPrintJobsTable.$inferSelect;
export type StudentPrintRecord    = typeof studentPrintRecordsTable.$inferSelect;
