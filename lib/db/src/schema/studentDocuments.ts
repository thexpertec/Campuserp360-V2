import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";

export const studentDocumentsTable = pgTable(
  "student_documents",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    studentId:    uuid("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
    docType:      text("doc_type").notNull(),       // birth_certificate | cnic | photo | leaving_certificate | medical | other
    originalName: text("original_name").notNull(),
    storedName:   text("stored_name").notNull(),
    mimeType:     text("mime_type").notNull(),
    fileSize:     integer("file_size").notNull(),
    uploadedAt:   timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    studentIdx: index("stu_docs_student_idx").on(t.studentId),
  }),
);

export type StudentDocument = typeof studentDocumentsTable.$inferSelect;
