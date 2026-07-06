import {
  pgTable, uuid, text, boolean, integer, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const omitTs = { id: true, createdAt: true, updatedAt: true } as const;

// ── Book Categories ───────────────────────────────────────────────────────────
export const libraryCategoriesTable = pgTable("library_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("library_categories_active_idx").on(t.active),
  tenantIdx: index("library_categories_tenant_idx").on(t.tenantId),
  tenantNameUniq: uniqueIndex("library_categories_tenant_name_uniq").on(t.tenantId, t.name),
}));

// ── Publishers ────────────────────────────────────────────────────────────────
export const libraryPublishersTable = pgTable("library_publishers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  city: text("city"),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("library_publishers_active_idx").on(t.active),
  tenantIdx: index("library_publishers_tenant_idx").on(t.tenantId),
  tenantNameUniq: uniqueIndex("library_publishers_tenant_name_uniq").on(t.tenantId, t.name),
}));

// ── Books ─────────────────────────────────────────────────────────────────────
export const libraryBooksTable = pgTable("library_books", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  title: text("title").notNull(),
  author: text("author").notNull().default(""),
  isbn: text("isbn"),
  categoryId: uuid("category_id").references(() => libraryCategoriesTable.id, { onDelete: "set null" }),
  publisherId: uuid("publisher_id").references(() => libraryPublishersTable.id, { onDelete: "set null" }),
  edition: text("edition"),
  yearPublished: text("year_published"),
  totalCopies: integer("total_copies").notNull().default(1),
  availableCopies: integer("available_copies").notNull().default(1),
  shelfLocation: text("shelf_location"),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("library_books_active_idx").on(t.active),
  catIdx: index("library_books_cat_idx").on(t.categoryId),
  pubIdx: index("library_books_pub_idx").on(t.publisherId),
  tenantIdx: index("library_books_tenant_idx").on(t.tenantId),
}));

// ── Book Issues / Returns ─────────────────────────────────────────────────────
export const libraryIssuesTable = pgTable("library_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  bookId: uuid("book_id").notNull().references(() => libraryBooksTable.id, { onDelete: "restrict" }),
  studentId: uuid("student_id"),              // soft ref to students
  studentName: text("student_name"),          // display name (denormalised)
  applicantId: text("applicant_id"),
  issuedDate: text("issued_date").notNull(),  // YYYY-MM-DD
  dueDate: text("due_date").notNull(),
  returnedDate: text("returned_date"),
  fineAmount: integer("fine_amount").notNull().default(0),
  status: text("status").notNull().default("issued"), // issued | returned | overdue
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  bookIdx: index("library_issues_book_idx").on(t.bookId),
  studentIdx: index("library_issues_student_idx").on(t.studentId),
  statusIdx: index("library_issues_status_idx").on(t.status),
  tenantIdx: index("library_issues_tenant_idx").on(t.tenantId),
}));

// ── Insert schemas ────────────────────────────────────────────────────────────
export const insertLibraryCategorySchema = createInsertSchema(libraryCategoriesTable).omit(omitTs);
export const insertLibraryPublisherSchema = createInsertSchema(libraryPublishersTable).omit(omitTs);
export const insertLibraryBookSchema = createInsertSchema(libraryBooksTable).omit(omitTs);
export const insertLibraryIssueSchema = createInsertSchema(libraryIssuesTable).omit(omitTs);

export type LibraryCategory = typeof libraryCategoriesTable.$inferSelect;
export type LibraryPublisher = typeof libraryPublishersTable.$inferSelect;
export type LibraryBook = typeof libraryBooksTable.$inferSelect;
export type LibraryIssue = typeof libraryIssuesTable.$inferSelect;
export type InsertLibraryCategory = z.infer<typeof insertLibraryCategorySchema>;
export type InsertLibraryPublisher = z.infer<typeof insertLibraryPublisherSchema>;
export type InsertLibraryBook = z.infer<typeof insertLibraryBookSchema>;
export type InsertLibraryIssue = z.infer<typeof insertLibraryIssueSchema>;
