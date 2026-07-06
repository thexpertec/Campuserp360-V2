import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
  serial,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { applicationsTable } from "./applications";
import { sectionsTable, housesTable, academicYearsTable } from "./academic";
import { tenantsTable } from "./tenants";

// ── Guardians / Parents ───────────────────────────────────────────────────────
// Normalised guardian record shared across siblings.
// familySeq is a DB serial used to derive a human-readable familyId: FAM-NNNN.
export const guardiansTable = pgTable(
  "guardians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familySeq: serial("family_seq").notNull(),
    name: text("name").notNull(),
    cnic: text("cnic"),
    phone: text("phone"),
    email: text("email"),
    city: text("city"),
    address: text("address"),
    notes: text("notes"),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    cnicUniq: uniqueIndex("guardians_cnic_idx").on(t.cnic),
    nameIdx: index("guardians_name_idx").on(t.name),
    tenantIdx: index("guardians_tenant_idx").on(t.tenantId),
  }),
);

export const insertGuardianSchema = createInsertSchema(guardiansTable).omit({
  id: true,
  familySeq: true,
  createdAt: true,
  updatedAt: true,
});

export type Guardian = typeof guardiansTable.$inferSelect;
export type InsertGuardian = z.infer<typeof insertGuardianSchema>;

// ── Students ──────────────────────────────────────────────────────────────────
// Enrolled cadets. applicantId is the stable Applicant ID.
// classCode mirrors classesTable.code (string, no FK) — same pattern as
// applications.classApplying.
// applicationId links back to the admission application when the student was
// admitted through the portal; manually-enrolled students leave it null.
export const studentsTable = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicantId: text("applicant_id").notNull(),

    // Origin
    applicationId: uuid("application_id").references(
      () => applicationsTable.id,
      { onDelete: "set null" },
    ),

    // Personal
    fullName: text("full_name").notNull().default(""),
    dateOfBirth: text("date_of_birth"),
    bloodGroup: text("blood_group"),
    religion: text("religion"),
    nationality: text("nationality").default("Pakistani"),
    photoFilename: text("photo_filename"),

    // Contact
    mobile: text("mobile"),
    email: text("email"),
    address: text("address"),
    city: text("city"),
    province: text("province"),

    // Guardian / Family (legacy inline columns kept for backward compat)
    fatherName: text("father_name"),
    guardianName: text("guardian_name"),
    relation: text("relation"),
    occupation: text("occupation"),
    guardianMobile: text("guardian_mobile"),
    guardianCnic: text("guardian_cnic"),

    // Normalised FK to guardians table (nullable — not all students linked yet)
    guardianId: uuid("guardian_id").references(() => guardiansTable.id, {
      onDelete: "set null",
    }),

    // Class roll number (distinct from applicantId; e.g. 1, 2, 3…)
    rollNo: text("roll_no"),

    // Academic placement
    classCode: text("class_code").notNull(),
    sectionId: uuid("section_id").references(() => sectionsTable.id, {
      onDelete: "set null",
    }),
    houseId: uuid("house_id").references(() => housesTable.id, {
      onDelete: "set null",
    }),
    academicYearId: uuid("academic_year_id").references(
      () => academicYearsTable.id,
      { onDelete: "set null" },
    ),
    enrollmentDate: text("enrollment_date"),

    // Status: active | alumni | expelled | transferred | deceased
    status: text("status").notNull().default("active"),

    // → chart_of_accounts.id (fee-receivable sub-ledger, set by coa-sync).
    // Column added by additive migration; declared here so it can be selected
    // like any other Drizzle column (see coa-sync.ts syncStudentCoa).
    coaId: uuid("coa_id"),

    // Multi-tenancy: set when student belongs to a specific tenant (null = global/CCM)
    tenantId: uuid("tenant_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    applicantIdIdx: uniqueIndex("students_applicant_id_idx").on(t.tenantId, t.applicantId),
    applicationIdx: index("students_application_idx").on(t.applicationId),
    classIdx: index("students_class_idx").on(t.classCode),
    sectionIdx: index("students_section_idx").on(t.sectionId),
    houseIdx: index("students_house_idx").on(t.houseId),
    yearIdx: index("students_year_idx").on(t.academicYearId),
    statusIdx: index("students_status_idx").on(t.status),
    tenantIdx: index("students_tenant_idx").on(t.tenantId),
    guardianIdx: index("students_guardian_idx").on(t.guardianId),
  }),
);

// ── Student Attendance ────────────────────────────────────────────────────────
export const STUDENT_ATTENDANCE_STATUSES = ["present", "absent", "leave", "off", "late"] as const;
export type StudentAttendanceStatus = typeof STUDENT_ATTENDANCE_STATUSES[number];

export const studentAttendanceTable = pgTable(
  "student_attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
    attendanceDate: text("attendance_date").notNull(), // YYYY-MM-DD
    status: text("status").notNull().default("present"), // present | absent | leave | off | late
    classCode: text("class_code").notNull(),
    sectionId: uuid("section_id").references(() => sectionsTable.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    studentDateIdx: uniqueIndex("student_att_student_date_idx").on(t.studentId, t.attendanceDate),
    dateIdx: index("student_att_date_idx").on(t.attendanceDate),
    classIdx: index("student_att_class_idx").on(t.classCode),
    statusIdx: index("student_att_status_idx").on(t.status),
  }),
);

// ── Student Disciplinary ──────────────────────────────────────────────────────
// Kept below for reference (defined in schema/disciplinary.ts but referenced here)

// ── Student Enrollments (academic year history) ───────────────────────────────
// One row per academic year a student was enrolled. When a student is promoted
// to a new year, the previous row gets endDate set and a new row is inserted.
// status: active | promoted | transferred | left
export const studentEnrollmentsTable = pgTable(
  "student_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    academicYearId: uuid("academic_year_id")
      .references(() => academicYearsTable.id, { onDelete: "set null" }),
    classCode: text("class_code").notNull(),
    sectionId: uuid("section_id")
      .references(() => sectionsTable.id, { onDelete: "set null" }),
    houseId: uuid("house_id")
      .references(() => housesTable.id, { onDelete: "set null" }),
    startDate: text("start_date"),
    endDate: text("end_date"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    studentYearUniq: uniqueIndex("student_enrollments_student_year_idx").on(t.studentId, t.academicYearId),
    studentIdx: index("student_enrollments_student_idx").on(t.studentId),
    yearIdx: index("student_enrollments_year_idx").on(t.academicYearId),
    classIdx: index("student_enrollments_class_idx").on(t.classCode),
  }),
);

// ── Insert schema & types ─────────────────────────────────────────────────────
export const insertStudentSchema = createInsertSchema(studentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStudentAttendanceSchema = createInsertSchema(studentAttendanceTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export const insertStudentEnrollmentSchema = createInsertSchema(studentEnrollmentsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type Student = typeof studentsTable.$inferSelect;
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type StudentAttendance = typeof studentAttendanceTable.$inferSelect;
export type InsertStudentAttendance = z.infer<typeof insertStudentAttendanceSchema>;
export type StudentEnrollment = typeof studentEnrollmentsTable.$inferSelect;
export type InsertStudentEnrollment = z.infer<typeof insertStudentEnrollmentSchema>;
