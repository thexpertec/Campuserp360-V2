import { sql } from "drizzle-orm";
import {
  pgTable, uuid, text, boolean, integer, real, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { academicYearsTable } from "./academic";

const omitTs = { id: true, createdAt: true, updatedAt: true } as const;

// ── Exam Types / Series ───────────────────────────────────────────────────────
export const examTypesTable = pgTable("exam_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("exam_types_active_idx").on(t.active),
  tenantNameUniq: uniqueIndex("exam_types_tenant_name_uniq").on(t.tenantId, t.name),
}));

// ── Grading Scales ────────────────────────────────────────────────────────────
export const examGradingScalesTable = pgTable("exam_grading_scales", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("exam_grading_scales_active_idx").on(t.active),
  tenantNameUniq: uniqueIndex("exam_grading_scales_tenant_name_uniq").on(t.tenantId, t.name),
}));

// ── Grade Bands ───────────────────────────────────────────────────────────────
export const examGradeBandsTable = pgTable("exam_grade_bands", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  gradeScaleId: uuid("grade_scale_id").notNull().references(() => examGradingScalesTable.id, { onDelete: "cascade" }),
  grade: text("grade").notNull(),
  minPercent: real("min_percent").notNull().default(0),
  maxPercent: real("max_percent").notNull().default(100),
  remarks: text("remarks"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("exam_grade_bands_active_idx").on(t.active),
  scaleIdx: index("exam_grade_bands_scale_idx").on(t.gradeScaleId),
}));

// ── Exam Schedules ────────────────────────────────────────────────────────────
// One row = one exam sitting (class + subject + date + total marks)
export const examSchedulesTable = pgTable("exam_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  examTypeId:    uuid("exam_type_id").references(() => examTypesTable.id, { onDelete: "set null" }),
  academicYearId: uuid("academic_year_id").references(() => academicYearsTable.id, { onDelete: "set null" }),
  classCode:    text("class_code").notNull(),
  subjectCode:  text("subject_code").notNull(),
  subjectName:  text("subject_name"),
  sessionLabel: text("session_label").notNull(),     // e.g. "2025" or "Spring 2025"
  examDate:     text("exam_date"),                   // ISO date string
  totalMarks:   integer("total_marks").notNull().default(100),
  passMarks:    integer("pass_marks").notNull().default(33),
  venue:           text("venue"),
  notes:           text("notes"),
  active:          boolean("active").notNull().default(true),
  resultsStatus:   text("results_status").notNull().default("draft"), // draft|submitted|published
  marksEnteredBy:  uuid("marks_entered_by"),   // → admin_users.id
  publishedBy:     uuid("published_by"),        // → admin_users.id
  publishedAt:     timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  classIdx:         index("exam_schedules_class_idx").on(t.classCode),
  sessionIdx:       index("exam_schedules_session_idx").on(t.sessionLabel),
  resultsStatusIdx: index("exam_schedules_results_status_idx").on(t.resultsStatus),
  upsertKeyTyped:   uniqueIndex("exam_schedules_upsert_key_typed")
    .on(t.tenantId, t.classCode, t.subjectCode, t.examTypeId, t.sessionLabel)
    .where(sql`${t.examTypeId} IS NOT NULL`),
  upsertKeyUntyped: uniqueIndex("exam_schedules_upsert_key_untyped")
    .on(t.tenantId, t.classCode, t.subjectCode, t.sessionLabel)
    .where(sql`${t.examTypeId} IS NULL`),
}));

// ── Exam Results ──────────────────────────────────────────────────────────────
export const examResultsTable = pgTable("exam_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  scheduleId:    uuid("schedule_id").notNull().references(() => examSchedulesTable.id, { onDelete: "cascade" }),
  studentId:     uuid("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  obtainedMarks: integer("obtained_marks"),   // null = not yet entered
  isAbsent:      boolean("is_absent").notNull().default(false),
  remarks:       text("remarks"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  uniq:        uniqueIndex("exam_results_schedule_student_uniq").on(t.scheduleId, t.studentId),
  scheduleIdx: index("exam_results_schedule_idx").on(t.scheduleId),
  studentIdx:  index("exam_results_student_idx").on(t.studentId),
}));

// ── Insert schemas ────────────────────────────────────────────────────────────
export const insertExamTypeSchema = createInsertSchema(examTypesTable).omit(omitTs);
export const insertExamGradingScaleSchema = createInsertSchema(examGradingScalesTable).omit(omitTs);
export const insertExamGradeBandSchema = createInsertSchema(examGradeBandsTable).omit(omitTs);

export const insertExamScheduleSchema = createInsertSchema(examSchedulesTable).omit(omitTs);
export const insertExamResultSchema   = createInsertSchema(examResultsTable).omit(omitTs);

export type ExamType = typeof examTypesTable.$inferSelect;
export type ExamGradingScale = typeof examGradingScalesTable.$inferSelect;
export type ExamGradeBand = typeof examGradeBandsTable.$inferSelect;
export type ExamSchedule = typeof examSchedulesTable.$inferSelect;
export type ExamResult   = typeof examResultsTable.$inferSelect;
export type InsertExamType = z.infer<typeof insertExamTypeSchema>;
export type InsertExamGradingScale = z.infer<typeof insertExamGradingScaleSchema>;
export type InsertExamGradeBand = z.infer<typeof insertExamGradeBandSchema>;
export type InsertExamSchedule = z.infer<typeof insertExamScheduleSchema>;
export type InsertExamResult   = z.infer<typeof insertExamResultSchema>;
