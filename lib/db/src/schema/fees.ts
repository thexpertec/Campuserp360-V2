import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { academicYearsTable } from "./academic";
import { studentsTable } from "./students";
import { tenantsTable } from "./tenants";

// ── Duration → month count mapping ────────────────────────────────────────────
// "once" is excluded (one-time fees have no period).
export const DURATION_MONTH_COUNT: Record<string, number> = {
  single:         1,
  "bi-monthly":   2,
  "tri-monthly":  3,
  "tetra-monthly":4,
  "six-monthly":  6,
  annual:         12,
  // Legacy values — kept for backward compatibility with existing records
  monthly:        1,
} as const;

// ── Fee Types ─────────────────────────────────────────────────────────────────
// Master list of fee components (Tuition Fee, Admission Fee, Annual Fund, etc.)
export const feeTypesTable = pgTable(
  "fee_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    feeCategory: text("fee_category").notNull().default("non-tuition"), // "tuition" | "non-tuition"
    feeCode: text("fee_code").notNull(), // slug, e.g. "tuition-fee"; unique per tenant
    duration: text("duration").notNull().default("single"), // "once" | "single" | "bi-monthly" | "tri-monthly" | "tetra-monthly" | "six-monthly" | "annual"
    months: text("months"), // JSON array of month names (legacy optional-months support)
    description: text("description"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    coaId: uuid("coa_id"),   // → chart_of_accounts.id (income account, set by coa-sync)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    tenantFeeCodeIdx: uniqueIndex("fee_types_tenant_fee_code_idx").on(t.tenantId, t.feeCode),
    activeIdx: index("fee_types_active_idx").on(t.active),
    tenantIdx: index("fee_types_tenant_idx").on(t.tenantId),
  }),
);

// ── Fee Schedule ──────────────────────────────────────────────────────────────
// Amount per fee type, per class, per academic year.
// classCode mirrors classesTable.code (string, no FK) — same pattern as students.
export const feeScheduleTable = pgTable(
  "fee_schedule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYearsTable.id, { onDelete: "cascade" }),
    classCode: text("class_code").notNull(),
    feeTypeId: uuid("fee_type_id")
      .notNull()
      .references(() => feeTypesTable.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull().default(0), // PKR, whole rupees
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    uniq: uniqueIndex("fee_schedule_unique").on(t.academicYearId, t.classCode, t.feeTypeId),
    yearIdx: index("fee_schedule_year_idx").on(t.academicYearId),
    classIdx: index("fee_schedule_class_idx").on(t.classCode),
    feeTypeIdx: index("fee_schedule_fee_type_idx").on(t.feeTypeId),
  }),
);

// ── Fee Challans ──────────────────────────────────────────────────────────────
// Generated payment challans for individual students.
export const feeChallansTable = pgTable(
  "fee_challans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    feeTypeId: uuid("fee_type_id")
      .notNull()
      .references(() => feeTypesTable.id, { onDelete: "restrict" }),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYearsTable.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(),
    grossAmount: integer("gross_amount").notNull().default(0),      // class-schedule rate at generation time
    discountAmount: integer("discount_amount").notNull().default(0), // reduction (schedule − override); 0 when none
    month: text("month"), // YYYY-MM (legacy); prefer periodMonthStart for new challans
    periodMonthStart: text("period_month_start"), // YYYY-MM start of the fee period
    periodMonthEnd: text("period_month_end"),     // YYYY-MM end of the fee period; null for single-month
    issueDate: text("issue_date").notNull(),
    dueDate: text("due_date").notNull(),
    challanNumber: text("challan_number"), // e.g. CCM-202601-0001; same per batch
    status: text("status").notNull().default("pending"), // "pending" | "pending_approval" | "paid" | "partial" | "overdue"
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidAmount: integer("paid_amount"),                  // null = not yet paid; < amount = partial
    paymentMethod: text("payment_method"),               // "cash" | "bank" | "cheque" | "online"
    accountTitle: text("account_title"),                 // bank/account name when non-cash
    remarks: text("remarks"),
    collectedBy:  uuid("collected_by"),                  // → admin_users.id (maker)
    approvedBy:   uuid("approved_by"),                   // → admin_users.id (checker)
    approvedAt:   timestamp("approved_at", { withTimezone: true }),
    lateFineApplied: boolean("late_fine_applied").notNull().default(false), // prevents double-charging late fee
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    studentIdx: index("fee_challans_student_idx").on(t.studentId),
    yearIdx: index("fee_challans_year_idx").on(t.academicYearId),
    statusIdx: index("fee_challans_status_idx").on(t.status),
    monthIdx: index("fee_challans_month_idx").on(t.month),
    periodStartIdx: index("fee_challans_period_start_idx").on(t.periodMonthStart),
    collectedByIdx: index("fee_challans_collected_by_idx").on(t.collectedBy),
    approvedByIdx: index("fee_challans_approved_by_idx").on(t.approvedBy),
  }),
);

// ── Fine Rules ────────────────────────────────────────────────────────────────
// Configures automatic fine line items at challan generation time.
// fineType: "attendance" | "late_fee"
// fineMode: "flat" | "per_day" | "per_absent_day"
// classCode: null = applies to all classes
// threshold: for attendance = min % (integer 0-100); for late_fee = grace days
export const fineRulesTable = pgTable(
  "fine_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYearsTable.id, { onDelete: "cascade" }),
    fineType: text("fine_type").notNull(), // "attendance" | "late_fee"
    classCode: text("class_code"),         // null = all classes
    threshold: integer("threshold").notNull(), // attendance: min % ; late_fee: grace days
    fineAmount: integer("fine_amount").notNull().default(0), // PKR per unit or flat
    fineMode: text("fine_mode").notNull().default("flat"),   // "flat" | "per_day" | "per_absent_day"
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    tenantIdx:  index("fine_rules_tenant_idx").on(t.tenantId),
    yearIdx:    index("fine_rules_year_idx").on(t.academicYearId),
    typeIdx:    index("fine_rules_type_idx").on(t.fineType),
  }),
);

export const insertFineRuleSchema = createInsertSchema(fineRulesTable).omit({
  id: true, createdAt: true, updatedAt: true, tenantId: true,
});

export type FineRule = typeof fineRulesTable.$inferSelect;
export type InsertFineRule = z.infer<typeof insertFineRuleSchema>;

// ── Student Fee Overrides ─────────────────────────────────────────────────────
// Per-student overrides of the class-level fee schedule. When present, this
// amount is used instead of fee_schedule.amount for that student.
export const studentFeeOverridesTable = pgTable(
  "student_fee_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    feeTypeId: uuid("fee_type_id")
      .notNull()
      .references(() => feeTypesTable.id, { onDelete: "cascade" }),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYearsTable.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    uniq:       uniqueIndex("sfo_unique").on(t.studentId, t.feeTypeId, t.academicYearId),
    studentIdx: index("sfo_student_idx").on(t.studentId),
    yearIdx:    index("sfo_year_idx").on(t.academicYearId),
  }),
);

// ── Insert schemas & types ────────────────────────────────────────────────────
const omitTimestamps      = { id: true, createdAt: true, updatedAt: true, tenantId: true } as const;
const omitTimestampsBasic = { id: true, createdAt: true, updatedAt: true } as const;

export const insertFeeTypeSchema   = createInsertSchema(feeTypesTable).omit(omitTimestamps);
export const insertFeeScheduleSchema = createInsertSchema(feeScheduleTable).omit(omitTimestampsBasic);
export const insertFeeChallanSchema  = createInsertSchema(feeChallansTable).omit({ id: true, createdAt: true, updatedAt: true, tenantId: true });

export type FeeType     = typeof feeTypesTable.$inferSelect;
export type FeeSchedule = typeof feeScheduleTable.$inferSelect;
export type FeeChallan  = typeof feeChallansTable.$inferSelect;
export type InsertFeeType     = z.infer<typeof insertFeeTypeSchema>;
export type InsertFeeSchedule = z.infer<typeof insertFeeScheduleSchema>;
export type InsertFeeChallan  = z.infer<typeof insertFeeChallanSchema>;
