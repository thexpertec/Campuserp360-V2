import {
  pgTable, uuid, text, boolean, integer, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const omitTs = { id: true, createdAt: true, updatedAt: true } as const;

// ── Period Definitions ────────────────────────────────────────────────────────
export const timetablePeriodsTable = pgTable("timetable_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  startTime: text("start_time").notNull().default(""), // "HH:MM"
  endTime: text("end_time").notNull().default(""),     // "HH:MM"
  periodType: text("period_type").notNull().default("lecture"), // lecture | break | assembly | other
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("timetable_periods_active_idx").on(t.active),
  tenantNameUniq: uniqueIndex("timetable_periods_tenant_name_uniq").on(t.tenantId, t.name),
}));

// ── Timetable Slots ───────────────────────────────────────────────────────────
export const timetableSlotsTable = pgTable("timetable_slots", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  classCode: text("class_code").notNull(),
  sectionName: text("section_name"),
  dayOfWeek: integer("day_of_week").notNull(),    // 1=Mon … 7=Sun
  periodId: uuid("period_id").notNull().references(() => timetablePeriodsTable.id, { onDelete: "cascade" }),
  subjectCode: text("subject_code"),
  subjectName: text("subject_name"),
  teacherName: text("teacher_name"),
  teacherEmployeeId: uuid("teacher_employee_id"), // soft ref to employees
  academicYearId: uuid("academic_year_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  classIdx: index("timetable_slots_class_idx").on(t.classCode),
  dayIdx: index("timetable_slots_day_idx").on(t.dayOfWeek),
  periodIdx: index("timetable_slots_period_idx").on(t.periodId),
}));

// ── Teacher ↔ Subject ↔ Class Assignments ─────────────────────────────────────
export const teacherSubjectAssignmentsTable = pgTable("teacher_subject_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  employeeId: uuid("employee_id").notNull(),   // soft ref to employees
  classId: uuid("class_id").notNull(),         // soft ref to classes
  subjectId: uuid("subject_id").notNull(),     // soft ref to subjects
  periodsPerWeek: integer("periods_per_week").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  uniq: uniqueIndex("teacher_subject_assignments_unique").on(t.employeeId, t.classId, t.subjectId),
  empIdx: index("teacher_subject_assignments_emp_idx").on(t.employeeId),
  classIdx: index("teacher_subject_assignments_class_idx").on(t.classId),
}));

// ── Insert schemas ────────────────────────────────────────────────────────────
export const insertTimetablePeriodSchema = createInsertSchema(timetablePeriodsTable).omit(omitTs);
export const insertTimetableSlotSchema = createInsertSchema(timetableSlotsTable).omit(omitTs);
export const insertTeacherSubjectAssignmentSchema = createInsertSchema(teacherSubjectAssignmentsTable).omit(omitTs);

export type TimetablePeriod = typeof timetablePeriodsTable.$inferSelect;
export type TimetableSlot = typeof timetableSlotsTable.$inferSelect;
export type TeacherSubjectAssignment = typeof teacherSubjectAssignmentsTable.$inferSelect;
export type InsertTimetablePeriod = z.infer<typeof insertTimetablePeriodSchema>;
export type InsertTimetableSlot = z.infer<typeof insertTimetableSlotSchema>;
export type InsertTeacherSubjectAssignment = z.infer<typeof insertTeacherSubjectAssignmentSchema>;
