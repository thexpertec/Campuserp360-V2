import {
  pgTable, uuid, text, boolean, integer, timestamp, index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const omitTs = { id: true, createdAt: true, updatedAt: true } as const;

// ── Syllabus Units (topic groups per class + subject) ─────────────────────────
export const syllabusUnitsTable = pgTable("syllabus_units", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  classCode: text("class_code").notNull(),
  subjectCode: text("subject_code").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("syllabus_units_active_idx").on(t.active),
  classIdx: index("syllabus_units_class_idx").on(t.classCode),
  subjectIdx: index("syllabus_units_subject_idx").on(t.subjectCode),
}));

// ── Syllabus Topics ───────────────────────────────────────────────────────────
export const syllabusTopicsTable = pgTable("syllabus_topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  unitId: uuid("unit_id").notNull().references(() => syllabusUnitsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("syllabus_topics_active_idx").on(t.active),
  unitIdx: index("syllabus_topics_unit_idx").on(t.unitId),
}));

// ── Insert schemas ────────────────────────────────────────────────────────────
export const insertSyllabusUnitSchema = createInsertSchema(syllabusUnitsTable).omit(omitTs);
export const insertSyllabusTopicSchema = createInsertSchema(syllabusTopicsTable).omit(omitTs);

export type SyllabusUnit = typeof syllabusUnitsTable.$inferSelect;
export type SyllabusTopic = typeof syllabusTopicsTable.$inferSelect;
export type InsertSyllabusUnit = z.infer<typeof insertSyllabusUnitSchema>;
export type InsertSyllabusTopic = z.infer<typeof insertSyllabusTopicSchema>;
