import { pgTable, uuid, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const interviewersTable = pgTable(
  "interviewers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    designation: text("designation"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    tenantId: uuid("tenant_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    tenantIdx: index("interviewers_tenant_idx").on(t.tenantId),
    activeIdx: index("interviewers_active_idx").on(t.active),
  }),
);

export const insertInterviewerSchema = createInsertSchema(interviewersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInterviewer = z.infer<typeof insertInterviewerSchema>;
export type Interviewer = typeof interviewersTable.$inferSelect;
