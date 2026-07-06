import {
  pgTable, uuid, text, boolean, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const omitTs = { id: true, createdAt: true, updatedAt: true } as const;

export const eventsTable = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  title: text("title").notNull(),
  slug: text("slug"),
  description: text("description"),
  eventType: text("event_type").notNull().default("other"),
  // academic | cultural | sports | ceremony | meeting | holiday | other
  startDate: text("start_date").notNull(),   // YYYY-MM-DD
  startTime: text("start_time"),             // HH:MM
  endDate: text("end_date"),                 // YYYY-MM-DD
  endTime: text("end_time"),                 // HH:MM
  venue: text("venue"),
  organizer: text("organizer"),
  targetAudience: text("target_audience").notNull().default("all"),
  // all | cadets | staff | parents
  status: text("status").notNull().default("draft"),
  // draft | published | cancelled | completed
  isPublic: boolean("is_public").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  startDateIdx: index("events_start_date_idx").on(t.startDate),
  statusIdx: index("events_status_idx").on(t.status),
  typeIdx: index("events_type_idx").on(t.eventType),
  tenantSlugUniq: uniqueIndex("events_tenant_slug_uniq").on(t.tenantId, t.slug),
}));

export const insertEventSchema = createInsertSchema(eventsTable).omit(omitTs);

export type Event = typeof eventsTable.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
