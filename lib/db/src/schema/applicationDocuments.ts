import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { applicationsTable } from "./applications";

export const applicationDocumentsTable = pgTable(
  "application_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applicationsTable.id, { onDelete: "cascade" }),
    docType: text("doc_type").notNull(),
    originalName: text("original_name").notNull(),
    storedName: text("stored_name").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull(),
    status: text("status").notNull().default("pending"), // pending | verified | rejected
    rejectionReason: text("rejection_reason"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    appIdx: index("app_docs_app_idx").on(t.applicationId),
    typeIdx: index("app_docs_type_idx").on(t.applicationId, t.docType),
  }),
);

export type ApplicationDocument = typeof applicationDocumentsTable.$inferSelect;
