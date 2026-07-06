import { pgTable, uuid, text, boolean, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const testCentresTable = pgTable(
  "test_centres",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    centreCode: text("centre_code").unique(),
    name: text("name").notNull(),
    city: text("city").notNull(),
    address: text("address"),
    focalPerson: text("focal_person"),
    phone: text("phone"),
    email: text("email"),
    contact: text("contact"),
    venueType: text("venue_type").notNull().default("test"), // "test" | "interview" | "both"
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    activeIdx: index("test_centres_active_idx").on(t.active),
    tenantIdx: index("test_centres_tenant_idx").on(t.tenantId),
    tenantNameUniq: uniqueIndex("test_centres_tenant_name_uniq").on(t.tenantId, t.name),
  }),
);

export const insertTestCentreSchema = createInsertSchema(testCentresTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTestCentre = z.infer<typeof insertTestCentreSchema>;
export type TestCentre = typeof testCentresTable.$inferSelect;
