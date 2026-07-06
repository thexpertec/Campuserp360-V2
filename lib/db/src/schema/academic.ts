import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { applicationsTable } from "./applications";

// ── Academic Years ───────────────────────────────────────────────────────────
export const academicYearsTable = pgTable(
  "academic_years",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    activeIdx: index("academic_years_active_idx").on(t.active),
    tenantNameUniq: uniqueIndex("academic_years_tenant_name_uniq").on(t.tenantId, t.name),
  }),
);

// ── Class Categories ─────────────────────────────────────────────────────────
export const classCategoriesTable = pgTable(
  "class_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    activeIdx: index("class_categories_active_idx").on(t.active),
    tenantNameUniq: uniqueIndex("class_categories_tenant_name_uniq").on(t.tenantId, t.name),
  }),
);

// ── Classes ──────────────────────────────────────────────────────────────────
// `code` is the stable string applications reference via classApplying (e.g.
// "class-9"). It is NOT a foreign key from applications — it mirrors how
// applications reference test centres by name-string.
export const classesTable = pgTable(
  "classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    categoryId: uuid("category_id").references(() => classCategoriesTable.id, {
      onDelete: "set null",
    }),
    feeType: text("fee_type"),
    eligibility: text("eligibility"),
    termType: text("term_type"),
    termCount: integer("term_count"),
    seats: integer("seats").notNull().default(0),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    activeIdx: index("classes_active_idx").on(t.active),
    categoryIdx: index("classes_category_idx").on(t.categoryId),
    tenantCodeUniq: uniqueIndex("classes_tenant_code_uniq").on(t.tenantId, t.code),
  }),
);

// ── Class ↔ Academic Year link ───────────────────────────────────────────────
export const classAcademicYearsTable = pgTable(
  "class_academic_years",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classesTable.id, { onDelete: "cascade" }),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYearsTable.id, { onDelete: "cascade" }),
  },
  (t) => ({
    uniq: uniqueIndex("class_academic_years_unique").on(t.classId, t.academicYearId),
    classIdx: index("class_academic_years_class_idx").on(t.classId),
  }),
);

// ── Sections ─────────────────────────────────────────────────────────────────
export const sectionsTable = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull().default(0),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    activeIdx: index("sections_active_idx").on(t.active),
    tenantNameUniq: uniqueIndex("sections_tenant_name_uniq").on(t.tenantId, t.name),
  }),
);

// ── Section Allocations ──────────────────────────────────────────────────────
// Places an admitted applicant into a class section for a given academic year.
export const sectionAllocationsTable = pgTable(
  "section_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applicationsTable.id, { onDelete: "cascade" }),
    classCode: text("class_code").notNull(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sectionsTable.id, { onDelete: "cascade" }),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYearsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    // One placement per applicant per academic year.
    uniq: uniqueIndex("section_allocations_app_year_unique").on(
      t.applicationId,
      t.academicYearId,
    ),
    sectionIdx: index("section_allocations_section_idx").on(t.sectionId),
    yearIdx: index("section_allocations_year_idx").on(t.academicYearId),
  }),
);

// ── Houses ───────────────────────────────────────────────────────────────────
export const housesTable = pgTable(
  "houses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    name: text("name").notNull(),
    color: text("color"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    activeIdx: index("houses_active_idx").on(t.active),
    tenantNameUniq: uniqueIndex("houses_tenant_name_uniq").on(t.tenantId, t.name),
  }),
);

// ── Academic Terms (Annual / Semester) ───────────────────────────────────────
export const academicTermsTable = pgTable(
  "academic_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    name: text("name").notNull(),
    kind: text("kind"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    activeIdx: index("academic_terms_active_idx").on(t.active),
    tenantNameUniq: uniqueIndex("academic_terms_tenant_name_uniq").on(t.tenantId, t.name),
  }),
);

// ── Affiliations ─────────────────────────────────────────────────────────────
export const affiliationsTable = pgTable(
  "affiliations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    name: text("name").notNull(),
    body: text("body"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    activeIdx: index("affiliations_active_idx").on(t.active),
    tenantNameUniq: uniqueIndex("affiliations_tenant_name_uniq").on(t.tenantId, t.name),
  }),
);

// ── Terms & Conditions ───────────────────────────────────────────────────────
export const termsConditionsTable = pgTable(
  "terms_conditions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    activeIdx: index("terms_conditions_active_idx").on(t.active),
    tenantTitleUniq: uniqueIndex("terms_conditions_tenant_title_uniq").on(t.tenantId, t.title),
  }),
);

// ── Subjects ─────────────────────────────────────────────────────────────────
export const subjectsTable = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull().default("theory"),
    isElective: boolean("is_elective").notNull().default(false),
    maxMarks: integer("max_marks").notNull().default(100),
    passMarks: integer("pass_marks").notNull().default(33),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    activeIdx: index("subjects_active_idx").on(t.active),
    tenantCodeUniq: uniqueIndex("subjects_tenant_code_uniq").on(t.tenantId, t.code),
  }),
);

// ── Class ↔ Section link ──────────────────────────────────────────────────────
export const classSectionsTable = pgTable(
  "class_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classesTable.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sectionsTable.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    uniq: uniqueIndex("class_sections_unique").on(t.classId, t.sectionId),
    classIdx: index("class_sections_class_idx").on(t.classId),
  }),
);

// ── Class ↔ Subject link ──────────────────────────────────────────────────────
export const classSubjectsTable = pgTable(
  "class_subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    classId: uuid("class_id")
      .notNull()
      .references(() => classesTable.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjectsTable.id, { onDelete: "cascade" }),
    periodsPerWeek: integer("periods_per_week").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    uniq: uniqueIndex("class_subjects_unique").on(t.classId, t.subjectId),
    classIdx: index("class_subjects_class_idx").on(t.classId),
    tenantClassSubjectUniq: uniqueIndex("class_subjects_tenant_class_subject_uniq").on(t.tenantId, t.classId, t.subjectId),
  }),
);

// ── Merit Formula Config ──────────────────────────────────────────────────────
// Per-year, per-class customisable weights and gate thresholds for merit scoring.
// Lookup precedence: (year+class) → (year only) → (class only) → (global) → hardcoded.
export const meritConfigTable = pgTable(
  "merit_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    // null = applies to all academic years
    academicYearId: uuid("academic_year_id").references(() => academicYearsTable.id, {
      onDelete: "cascade",
    }),
    // null = applies to all classes
    classCode: text("class_code"),
    // Weights (must sum to 100 in application logic; stored independently for flexibility)
    academicWeight: integer("academic_weight").notNull().default(20),
    testWeight: integer("test_weight").notNull().default(50),
    interviewWeight: integer("interview_weight").notNull().default(30),
    // Gate threshold — single cumulative minimum
    minMeritScore: integer("min_merit_score").notNull().default(50),    // total merit score
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    uniq: uniqueIndex("merit_config_tenant_year_class_unique").on(t.tenantId, t.academicYearId, t.classCode),
    yearIdx: index("merit_config_year_idx").on(t.academicYearId),
    tenantIdx: index("merit_config_tenant_idx").on(t.tenantId),
  }),
);

// ── School Calendar — Weekend Config ─────────────────────────────────────────
// One row per (academic year, audience, tenant). Stores which days of week are off.
export const schoolCalendarWeekendsTable = pgTable(
  "school_calendar_weekends",
  {
    id:       uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    yearId:   uuid("year_id").notNull().references(() => academicYearsTable.id, { onDelete: "cascade" }),
    audience: text("audience").notNull(), // students | staff | both
    mon: boolean("mon").notNull().default(false),
    tue: boolean("tue").notNull().default(false),
    wed: boolean("wed").notNull().default(false),
    thu: boolean("thu").notNull().default(false),
    fri: boolean("fri").notNull().default(false),
    sat: boolean("sat").notNull().default(true),
    sun: boolean("sun").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    uniq:    uniqueIndex("school_calendar_weekends_tenant_year_audience_uniq").on(t.tenantId, t.yearId, t.audience),
    yearIdx: index("school_calendar_weekends_year_idx").on(t.yearId),
  }),
);

// ── School Calendar — Gazetted Holidays ──────────────────────────────────────
// Individual holiday dates per (academic year, audience).
export const schoolHolidaysTable = pgTable(
  "school_holidays",
  {
    id:       uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    yearId:   uuid("year_id").notNull().references(() => academicYearsTable.id, { onDelete: "cascade" }),
    audience: text("audience").notNull(), // students | staff | both
    date:     text("date").notNull(),     // YYYY-MM-DD
    name:     text("name").notNull(),
    category: text("category").notNull().default("other"), // national | religious | event | institutional | other
    notes:    text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    yearAudienceIdx: index("school_holidays_year_audience_idx").on(t.yearId, t.audience),
    dateIdx:         index("school_holidays_date_idx").on(t.date),
  }),
);

// ── Insert schemas ───────────────────────────────────────────────────────────
const omitTimestamps = { id: true, createdAt: true, updatedAt: true } as const;

export const insertAcademicYearSchema = createInsertSchema(academicYearsTable).omit(omitTimestamps);
export const insertClassCategorySchema = createInsertSchema(classCategoriesTable).omit(omitTimestamps);
export const insertClassSchema = createInsertSchema(classesTable).omit(omitTimestamps);
export const insertSectionSchema = createInsertSchema(sectionsTable).omit(omitTimestamps);
export const insertSectionAllocationSchema = createInsertSchema(sectionAllocationsTable).omit(omitTimestamps);
export const insertHouseSchema = createInsertSchema(housesTable).omit(omitTimestamps);
export const insertAcademicTermSchema = createInsertSchema(academicTermsTable).omit(omitTimestamps);
export const insertAffiliationSchema = createInsertSchema(affiliationsTable).omit(omitTimestamps);
export const insertTermsConditionSchema = createInsertSchema(termsConditionsTable).omit(omitTimestamps);
export const insertSubjectSchema = createInsertSchema(subjectsTable).omit(omitTimestamps);
export const insertClassSubjectSchema = createInsertSchema(classSubjectsTable).omit({ id: true });
export const insertClassSectionSchema = createInsertSchema(classSectionsTable).omit({ id: true });
export const insertMeritConfigSchema  = createInsertSchema(meritConfigTable).omit(omitTimestamps);

export type AcademicYear = typeof academicYearsTable.$inferSelect;
export type ClassCategory = typeof classCategoriesTable.$inferSelect;
export type ClassRecord = typeof classesTable.$inferSelect;
export type ClassAcademicYear = typeof classAcademicYearsTable.$inferSelect;
export type Section = typeof sectionsTable.$inferSelect;
export type SectionAllocation = typeof sectionAllocationsTable.$inferSelect;
export type House = typeof housesTable.$inferSelect;
export type AcademicTerm = typeof academicTermsTable.$inferSelect;
export type Affiliation = typeof affiliationsTable.$inferSelect;
export type TermsCondition = typeof termsConditionsTable.$inferSelect;

export type InsertAcademicYear = z.infer<typeof insertAcademicYearSchema>;
export type InsertClassCategory = z.infer<typeof insertClassCategorySchema>;
export type InsertClass = z.infer<typeof insertClassSchema>;
export type InsertSection = z.infer<typeof insertSectionSchema>;
export type InsertSectionAllocation = z.infer<typeof insertSectionAllocationSchema>;
export type InsertHouse = z.infer<typeof insertHouseSchema>;
export type InsertAcademicTerm = z.infer<typeof insertAcademicTermSchema>;
export type InsertAffiliation = z.infer<typeof insertAffiliationSchema>;
export type InsertTermsCondition = z.infer<typeof insertTermsConditionSchema>;
export type Subject = typeof subjectsTable.$inferSelect;
export type ClassSubject = typeof classSubjectsTable.$inferSelect;
export type ClassSection = typeof classSectionsTable.$inferSelect;
export type InsertSubject = z.infer<typeof insertSubjectSchema>;
export type InsertClassSubject = z.infer<typeof insertClassSubjectSchema>;
export type InsertClassSection = z.infer<typeof insertClassSectionSchema>;
export type MeritConfig = typeof meritConfigTable.$inferSelect;
export type InsertMeritConfig = z.infer<typeof insertMeritConfigSchema>;
