import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const printSignaturesTable = pgTable("print_signatures", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenantId:   uuid("tenant_id").notNull(),
  name:       text("name").notNull(),
  label:      text("label").notNull(),
  type:       text("type").notNull().default("signature"),
  storageKey: text("storage_key").notNull(),
  url:        text("url").notNull(),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PrintSignature = typeof printSignaturesTable.$inferSelect;
