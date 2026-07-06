import { pgTable, uuid, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { testCentresTable } from "./testCentres";

export const testSchedulesTable = pgTable(
  "test_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    testDate: text("test_date").notNull(),
    testTime: text("test_time"),
    centreId: uuid("centre_id").references(() => testCentresTable.id, { onDelete: "set null" }),
    centreName: text("centre_name"),
    classApplying: text("class_applying"),
    session: text("session"),
    totalSeats: integer("total_seats"),
    notes: text("notes"),
    status: text("status").notNull().default("upcoming"),
    tenantId: uuid("tenant_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    tenantIdx: index("test_schedules_tenant_idx").on(t.tenantId),
    statusIdx: index("test_schedules_status_idx").on(t.status),
  }),
);

export const insertTestScheduleSchema = createInsertSchema(testSchedulesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTestSchedule = z.infer<typeof insertTestScheduleSchema>;
export type TestSchedule = typeof testSchedulesTable.$inferSelect;
