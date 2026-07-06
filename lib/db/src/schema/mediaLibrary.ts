import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const mediaLibraryTable = pgTable("media_library", {
  id:           uuid("id").primaryKey().defaultRandom(),
  // Every media item belongs to a tenant. The column is nullable so the
  // migration can add it without a default and existing rows are backfilled to
  // the CCM tenant; the API stamps it on upload (including inline website
  // uploads) and filters reads by it so each school's library stays private.
  tenantId:     uuid("tenant_id"),
  filename:     text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType:     text("mime_type").notNull(),
  sizeBytes:    integer("size_bytes").notNull().default(0),
  altText:      text("alt_text"),
  tags:         text("tags"),           // comma-separated
  url:          text("url").notNull(),  // /uploads/media/uuid.ext
  uploadedAt:   timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uploadedAtIdx: index("media_library_uploaded_at_idx").on(t.uploadedAt),
  tenantIdx:     index("media_library_tenant_idx").on(t.tenantId),
}));

export type MediaLibraryItem = typeof mediaLibraryTable.$inferSelect;
