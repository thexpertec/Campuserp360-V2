import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { applicationsTable } from "./applications";

export const applicationEventsTable = pgTable(
  "application_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applicationsTable.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    appIdx: index("application_events_app_idx").on(t.applicationId),
  }),
);

export type ApplicationEvent = typeof applicationEventsTable.$inferSelect;
