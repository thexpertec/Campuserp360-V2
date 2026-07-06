import {
  pgTable, uuid, text, boolean, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const omitTs = { id: true, createdAt: true, updatedAt: true } as const;

// ── Announcements ─────────────────────────────────────────────────────────────
export const announcementsTable = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  title: text("title").notNull(),
  slug: text("slug"),
  body: text("body").notNull().default(""),
  targetAudience: text("target_audience").notNull().default("all"), // all | students | parents | staff
  priority: text("priority").notNull().default("normal"), // normal | urgent
  publishedAt: text("published_at"),          // ISO date string (nullable = draft)
  expiresAt: text("expires_at"),
  createdBy: text("created_by"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("announcements_active_idx").on(t.active),
  audienceIdx: index("announcements_audience_idx").on(t.targetAudience),
  tenantIdx: index("announcements_tenant_idx").on(t.tenantId),
  tenantSlugIdx: uniqueIndex("announcements_tenant_slug_idx").on(t.tenantId, t.slug),
}));

// ── Noticeboard Items ─────────────────────────────────────────────────────────
export const noticeboardItemsTable = pgTable("noticeboard_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  title: text("title").notNull(),
  slug: text("slug"),
  content: text("content"),
  category: text("category"),                 // general | academic | sports | event | other
  publishedAt: text("published_at"),
  expiresAt: text("expires_at"),
  attachmentUrl: text("attachment_url"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("noticeboard_items_active_idx").on(t.active),
  tenantIdx: index("noticeboard_items_tenant_idx").on(t.tenantId),
  tenantSlugIdx: uniqueIndex("noticeboard_items_tenant_slug_idx").on(t.tenantId, t.slug),
}));

// ── Insert schemas ────────────────────────────────────────────────────────────
export const insertAnnouncementSchema = createInsertSchema(announcementsTable).omit(omitTs);
export const insertNoticeboardItemSchema = createInsertSchema(noticeboardItemsTable).omit(omitTs);

export type Announcement = typeof announcementsTable.$inferSelect;
export type NoticeboardItem = typeof noticeboardItemsTable.$inferSelect;
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type InsertNoticeboardItem = z.infer<typeof insertNoticeboardItemSchema>;
