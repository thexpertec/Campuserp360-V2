import {
  pgTable, uuid, text, boolean, integer, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

const omitTs       = { id: true, createdAt: true, updatedAt: true, tenantId: true } as const;
const omitTsBasic  = { id: true, createdAt: true, updatedAt: true } as const;

// ── Departments ───────────────────────────────────────────────────────────────
export const hrDepartmentsTable = pgTable("hr_departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("hr_departments_active_idx").on(t.active),
  tenantNameIdx: uniqueIndex("hr_departments_tenant_name_idx").on(t.tenantId, t.name),
}));

// ── Designations ─────────────────────────────────────────────────────────────
export const hrDesignationsTable = pgTable("hr_designations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  departmentId: uuid("department_id").references(() => hrDepartmentsTable.id, { onDelete: "set null" }),
  grade: text("grade"),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("hr_designations_active_idx").on(t.active),
  deptIdx: index("hr_designations_dept_idx").on(t.departmentId),
  tenantNameIdx: uniqueIndex("hr_designations_tenant_name_idx").on(t.tenantId, t.name),
}));

// ── Salary Grades ─────────────────────────────────────────────────────────────
export const hrSalaryGradesTable = pgTable("hr_salary_grades", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  basicMin: integer("basic_min").notNull().default(0),
  basicMax: integer("basic_max").notNull().default(0),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("hr_salary_grades_active_idx").on(t.active),
  tenantNameIdx: uniqueIndex("hr_salary_grades_tenant_name_idx").on(t.tenantId, t.name),
}));

// ── Employees ────────────────────────────────────────────────────────────────
export const EMPLOYEE_ROLES = ["admin", "teacher", "accountant", "director", "admission_officer", "librarian", "medical_officer", "support"] as const;
export type EmployeeRole = typeof EMPLOYEE_ROLES[number];

export const employeesTable = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
  staffId: text("staff_id").notNull(),       // e.g. TCH-26-001; unique per tenant

  // Personal
  fullName: text("full_name").notNull().default(""),
  fatherName: text("father_name"),
  gender: text("gender"),                              // male | female | other
  religion: text("religion"),
  bloodGroup: text("blood_group"),
  dateOfBirth: text("date_of_birth"),                 // ISO date string
  cnic: text("cnic"),
  nationality: text("nationality").default("Pakistani"),
  photoFilename: text("photo_filename"),

  // Contact
  email: text("email"),
  phone: text("phone"),
  presentAddress: text("present_address"),
  permanentAddress: text("permanent_address"),

  // Professional
  role: text("role").notNull().default("admin"),       // EmployeeRole
  designationId: uuid("designation_id").references(() => hrDesignationsTable.id, { onDelete: "set null" }),
  departmentId: uuid("department_id").references(() => hrDepartmentsTable.id, { onDelete: "set null" }),
  salaryGradeId: uuid("salary_grade_id").references(() => hrSalaryGradesTable.id, { onDelete: "set null" }),
  qualification: text("qualification"),
  experience: text("experience"),
  joiningDate: text("joining_date"),
  contractType: text("contract_type").default("permanent"), // permanent | contract | visiting
  status: text("status").notNull().default("active"),  // active | inactive | on_leave | terminated

  // Attendance configuration
  attendanceMode: text("attendance_mode").notNull().default("time_based"), // time_based | lecture_based
  scheduledStartTime: text("scheduled_start_time"),   // HH:MM — expected clock-in (time-based)
  scheduledEndTime: text("scheduled_end_time"),       // HH:MM — expected clock-out (time-based)
  graceMinutes: integer("grace_minutes").notNull().default(0), // late tolerance after scheduled start

  // Auth
  username: text("username").unique(),
  passwordHash: text("password_hash"),

  // COA link — points to the salary expense account for this employee (or null = use role default)
  coaId: uuid("coa_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantStaffIdIdx: uniqueIndex("employees_tenant_staff_id_idx").on(t.tenantId, t.staffId),
  tenantIdx: index("employees_tenant_idx").on(t.tenantId),
  roleIdx: index("employees_role_idx").on(t.role),
  statusIdx: index("employees_status_idx").on(t.status),
  emailIdx: index("employees_email_idx").on(t.email),
}));

// ── Employee Bank Accounts ────────────────────────────────────────────────────
export const employeeBankAccountsTable = pgTable("employee_bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  bankName: text("bank_name").notNull(),
  branchName: text("branch_name"),
  accountTitle: text("account_title"),
  accountNumber: text("account_number").notNull(),
  iban: text("iban"),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({ empIdx: index("emp_bank_emp_idx").on(t.employeeId) }));

// ── Employee Documents ────────────────────────────────────────────────────────
export const employeeDocumentsTable = pgTable("employee_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  docType: text("doc_type").notNull(),  // cnic_front | cnic_back | degree | experience_letter | other
  docLabel: text("doc_label"),
  filename: text("filename").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ empIdx: index("emp_docs_emp_idx").on(t.employeeId) }));

// ── Employee Salary Transactions ──────────────────────────────────────────────
export const employeeSalaryTransactionsTable = pgTable("employee_salary_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  month: text("month").notNull(),           // YYYY-MM
  basicSalary: integer("basic_salary").notNull().default(0),
  allowances: integer("allowances").notNull().default(0),
  deductions: integer("deductions").notNull().default(0),
  netSalary: integer("net_salary").notNull().default(0),
  status: text("status").notNull().default("draft"), // draft | pending | approved | paid
  paidAt: timestamp("paid_at", { withTimezone: true }),
  amountPaid: integer("amount_paid"),       // actual amount paid (may be < netSalary for partial payment); null until paid
  bankAccountId: uuid("bank_account_id"),   // institution bank account used at pay-time
  remarks: text("remarks"),
  preparedBy:  uuid("prepared_by"),   // → admin_users.id (maker)
  approvedBy:  uuid("approved_by"),   // → admin_users.id (checker)
  approvedAt:  timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  empIdx: index("emp_sal_emp_idx").on(t.employeeId),
  monthIdx: index("emp_sal_month_idx").on(t.month),
}));

// ── Staff Attendance ──────────────────────────────────────────────────────────
export const hrAttendanceTable = pgTable("hr_attendance", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  attendanceDate: text("attendance_date").notNull(),  // YYYY-MM-DD
  status: text("status").notNull().default("present"), // present | absent | leave | off | late  (off = weekend/holiday; late = short-leave marker)
  inTime: text("in_time"),                             // HH:MM
  outTime: text("out_time"),
  notes: text("notes"),
  earlyDeparture: boolean("early_departure").notNull().default(false), // left before scheduled end (time-based)
  lecturesAttended: integer("lectures_attended"),      // rollup: lectures marked present (lecture-based)
  lecturesTotal: integer("lectures_total"),            // rollup: total scheduled lectures (lecture-based)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  empIdx: index("hr_attendance_emp_idx").on(t.employeeId),
  dateIdx: index("hr_attendance_date_idx").on(t.attendanceDate),
  statusIdx: index("hr_attendance_status_idx").on(t.status),
  empDateUniq: uniqueIndex("hr_attendance_emp_date_uniq").on(t.employeeId, t.attendanceDate),
}));

// ── Per-Lecture Staff Attendance (lecture-based teachers) ─────────────────────
// One row per teacher per scheduled lecture per day; rolled up into hr_attendance.
export const hrLectureAttendanceTable = pgTable("hr_lecture_attendance", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  attendanceDate: text("attendance_date").notNull(),  // YYYY-MM-DD
  slotId: uuid("slot_id").notNull(),                   // soft ref → timetable_slots
  periodId: uuid("period_id"),                         // soft ref → timetable_periods (ordering/display)
  present: boolean("present").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  empDateIdx: index("hr_lecture_att_emp_date_idx").on(t.employeeId, t.attendanceDate),
  empDateSlotUniq: uniqueIndex("hr_lecture_att_emp_date_slot_uniq").on(t.employeeId, t.attendanceDate, t.slotId),
}));

// ── Leave Requests ────────────────────────────────────────────────────────────
export const hrLeaveRequestsTable = pgTable("hr_leave_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  leaveType: text("leave_type").notNull().default("casual"), // casual | sick | annual | other
  fromDate: text("from_date").notNull(),
  toDate: text("to_date").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  approvedBy: text("approved_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  empIdx: index("hr_leave_emp_idx").on(t.employeeId),
  statusIdx: index("hr_leave_status_idx").on(t.status),
  dateIdx: index("hr_leave_date_idx").on(t.fromDate),
}));

// ── Incentive Types ───────────────────────────────────────────────────────────
export const hrIncentiveTypesTable = pgTable("hr_incentive_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  category: text("category").notNull().default("allowance"), // allowance | bonus | overtime | other
  calculationType: text("calculation_type").notNull().default("fixed"), // fixed | percentage
  defaultValue: integer("default_value").notNull().default(0),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("hr_incentive_types_active_idx").on(t.active),
  tenantNameIdx: uniqueIndex("hr_incentive_types_tenant_name_idx").on(t.tenantId, t.name),
}));

// ── Deduction Types ───────────────────────────────────────────────────────────
export const hrDeductionTypesTable = pgTable("hr_deduction_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  category: text("category").notNull().default("tax"), // tax | loan | advance | insurance | other
  calculationType: text("calculation_type").notNull().default("fixed"), // fixed | percentage
  defaultValue: integer("default_value").notNull().default(0),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("hr_deduction_types_active_idx").on(t.active),
  tenantNameIdx: uniqueIndex("hr_deduction_types_tenant_name_idx").on(t.tenantId, t.name),
}));

// ── Employee Salary Templates (per-employee) ───────────────────────────────────
export const employeeSalaryTemplatesTable = pgTable("employee_salary_templates", {
  id:           uuid("id").primaryKey().defaultRandom(),
  templateCode: text("template_code").notNull().unique(),           // EST-001, EST-002, …
  employeeId:   uuid("employee_id").notNull().unique()
                  .references(() => employeesTable.id, { onDelete: "cascade" }),
  basicSalary:  integer("basic_salary").notNull().default(0),
  effectiveFrom: text("effective_from"),                            // YYYY-MM-DD
  notes:        text("notes"),
  active:       boolean("active").notNull().default(true),
  // Leave deduction rules
  leaveDeductEnabled: boolean("leave_deduct_enabled").notNull().default(true),
  leaveDeductType:    text("leave_deduct_type").notNull().default("per_day"), // per_day | percentage | fixed
  leaveDeductValue:   integer("leave_deduct_value").notNull().default(0),
  // Short leave deduction rules
  shortLeaveEnabled:            boolean("short_leave_enabled").notNull().default(false),
  shortLeaveThresholdMinutes:   integer("short_leave_threshold_minutes").notNull().default(30),
  shortLeaveDeductType:         text("short_leave_deduct_type").notNull().default("fixed"), // fixed | per_occurrence | percentage
  shortLeaveDeductValue:        integer("short_leave_deduct_value").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  empIdx:    uniqueIndex("emp_sal_tpl_emp_idx").on(t.employeeId),
  activeIdx: index("emp_sal_tpl_active_idx").on(t.active),
}));

// ── Employee Salary Template Items (incentives & deductions) ──────────────────
export const employeeSalaryTemplateItemsTable = pgTable("employee_salary_template_items", {
  id:              uuid("id").primaryKey().defaultRandom(),
  templateId:      uuid("template_id").notNull()
                     .references(() => employeeSalaryTemplatesTable.id, { onDelete: "cascade" }),
  itemType:        text("item_type").notNull().default("incentive"), // incentive | deduction
  name:            text("name").notNull(),
  calculationType: text("calculation_type").notNull().default("fixed"), // fixed | percentage
  value:           integer("value").notNull().default(0),
  sortOrder:       integer("sort_order").notNull().default(0),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tplIdx: index("emp_sal_tpl_items_tpl_idx").on(t.templateId),
}));

// ── Insert schemas ────────────────────────────────────────────────────────────
export const insertHrDepartmentSchema = createInsertSchema(hrDepartmentsTable).omit(omitTs);
export const insertHrDesignationSchema = createInsertSchema(hrDesignationsTable).omit(omitTs);
export const insertHrSalaryGradeSchema = createInsertSchema(hrSalaryGradesTable).omit(omitTs);
export const insertHrIncentiveTypeSchema = createInsertSchema(hrIncentiveTypesTable).omit(omitTs);
export const insertHrDeductionTypeSchema = createInsertSchema(hrDeductionTypesTable).omit(omitTs);
export const insertEmployeeSchema = createInsertSchema(employeesTable).omit(omitTs);
export const insertEmployeeBankAccountSchema = createInsertSchema(employeeBankAccountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmployeeDocumentSchema = createInsertSchema(employeeDocumentsTable).omit({ id: true, uploadedAt: true });
export const insertEmployeeSalaryTransactionSchema = createInsertSchema(employeeSalaryTransactionsTable).omit({ id: true, createdAt: true });
export const insertHrAttendanceSchema = createInsertSchema(hrAttendanceTable).omit(omitTsBasic);
export const insertHrLectureAttendanceSchema = createInsertSchema(hrLectureAttendanceTable).omit(omitTsBasic);
export const insertHrLeaveRequestSchema = createInsertSchema(hrLeaveRequestsTable).omit(omitTsBasic);
export const insertEmployeeSalaryTemplateSchema = createInsertSchema(employeeSalaryTemplatesTable).omit(omitTsBasic);

export type HrDepartment = typeof hrDepartmentsTable.$inferSelect;
export type HrDesignation = typeof hrDesignationsTable.$inferSelect;
export type HrSalaryGrade = typeof hrSalaryGradesTable.$inferSelect;
export type HrIncentiveType = typeof hrIncentiveTypesTable.$inferSelect;
export type HrDeductionType = typeof hrDeductionTypesTable.$inferSelect;
export type Employee = typeof employeesTable.$inferSelect;
export type EmployeeBankAccount = typeof employeeBankAccountsTable.$inferSelect;
export type EmployeeDocument = typeof employeeDocumentsTable.$inferSelect;
export type EmployeeSalaryTransaction = typeof employeeSalaryTransactionsTable.$inferSelect;
export type HrAttendance = typeof hrAttendanceTable.$inferSelect;
export type HrLectureAttendance = typeof hrLectureAttendanceTable.$inferSelect;
export type HrLeaveRequest = typeof hrLeaveRequestsTable.$inferSelect;

export type InsertHrDepartment = z.infer<typeof insertHrDepartmentSchema>;
export type InsertHrDesignation = z.infer<typeof insertHrDesignationSchema>;
export type InsertHrSalaryGrade = z.infer<typeof insertHrSalaryGradeSchema>;
export type InsertHrIncentiveType = z.infer<typeof insertHrIncentiveTypeSchema>;
export type InsertHrDeductionType = z.infer<typeof insertHrDeductionTypeSchema>;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type InsertEmployeeBankAccount = z.infer<typeof insertEmployeeBankAccountSchema>;
export type InsertEmployeeDocument = z.infer<typeof insertEmployeeDocumentSchema>;
export type InsertEmployeeSalaryTransaction = z.infer<typeof insertEmployeeSalaryTransactionSchema>;
export type InsertHrAttendance = z.infer<typeof insertHrAttendanceSchema>;
export type InsertHrLectureAttendance = z.infer<typeof insertHrLectureAttendanceSchema>;
export type InsertHrLeaveRequest = z.infer<typeof insertHrLeaveRequestSchema>;
export type InsertEmployeeSalaryTemplate = z.infer<typeof insertEmployeeSalaryTemplateSchema>;
