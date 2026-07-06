import {
  pgTable, uuid, text, boolean, integer, timestamp, index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const omitTs = { id: true, createdAt: true, updatedAt: true } as const;

// ── Medicine Categories ───────────────────────────────────────────────────────
export const medicalMedicineCategoriesTable = pgTable("medical_medicine_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("medical_medicine_categories_active_idx").on(t.active),
  tenantIdx: index("medical_medicine_categories_tenant_idx").on(t.tenantId),
}));

// ── Medicines ─────────────────────────────────────────────────────────────────
export const medicalMedicinesTable = pgTable("medical_medicines", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  categoryId: uuid("category_id").references(() => medicalMedicineCategoriesTable.id, { onDelete: "set null" }),
  unit: text("unit").notNull().default("tablet"), // tablet | capsule | ml | mg | sachet
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  reorderLevel: integer("reorder_level").notNull().default(10),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("medical_medicines_active_idx").on(t.active),
  catIdx: index("medical_medicines_cat_idx").on(t.categoryId),
  tenantIdx: index("medical_medicines_tenant_idx").on(t.tenantId),
}));

// ── Condition Types ───────────────────────────────────────────────────────────
export const medicalConditionsTable = pgTable("medical_conditions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("medical_conditions_active_idx").on(t.active),
  tenantIdx: index("medical_conditions_tenant_idx").on(t.tenantId),
}));

// ── Patient Visits (Sick-bay log) ─────────────────────────────────────────────
export const medicalVisitsTable = pgTable("medical_visits", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  studentId: uuid("student_id"),              // soft ref
  studentName: text("student_name").notNull().default(""),
  applicantId: text("applicant_id"),
  classCode: text("class_code"),
  visitDate: text("visit_date").notNull(),    // YYYY-MM-DD
  complaint: text("complaint").notNull().default(""),
  conditionId: uuid("condition_id").references(() => medicalConditionsTable.id, { onDelete: "set null" }),
  diagnosis: text("diagnosis"),
  treatmentGiven: text("treatment_given"),
  medicinesGiven: text("medicines_given"),    // comma-separated names
  status: text("status").notNull().default("outpatient"), // outpatient | admitted | referred | discharged
  referredTo: text("referred_to"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  studentIdx: index("medical_visits_student_idx").on(t.studentId),
  dateIdx: index("medical_visits_date_idx").on(t.visitDate),
  statusIdx: index("medical_visits_status_idx").on(t.status),
  tenantIdx: index("medical_visits_tenant_idx").on(t.tenantId),
}));

// ── Insert schemas ────────────────────────────────────────────────────────────
export const insertMedicalMedicineCategorySchema = createInsertSchema(medicalMedicineCategoriesTable).omit(omitTs);
export const insertMedicalMedicineSchema = createInsertSchema(medicalMedicinesTable).omit(omitTs);
export const insertMedicalConditionSchema = createInsertSchema(medicalConditionsTable).omit(omitTs);
export const insertMedicalVisitSchema = createInsertSchema(medicalVisitsTable).omit(omitTs);

export type MedicalMedicineCategory = typeof medicalMedicineCategoriesTable.$inferSelect;
export type MedicalMedicine = typeof medicalMedicinesTable.$inferSelect;
export type MedicalCondition = typeof medicalConditionsTable.$inferSelect;
export type MedicalVisit = typeof medicalVisitsTable.$inferSelect;
export type InsertMedicalMedicineCategory = z.infer<typeof insertMedicalMedicineCategorySchema>;
export type InsertMedicalMedicine = z.infer<typeof insertMedicalMedicineSchema>;
export type InsertMedicalCondition = z.infer<typeof insertMedicalConditionSchema>;
export type InsertMedicalVisit = z.infer<typeof insertMedicalVisitSchema>;
