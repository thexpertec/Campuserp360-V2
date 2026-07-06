import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

// ── Chart of Accounts ─────────────────────────────────────────────────────────
// Multilevel, self-referencing tree.
// type values: "asset" | "liability" | "equity" | "income" | "expense"
// kind values: "group" (can hold sub-accounts) | "ledger" (final posting account)
// normalBalance values: "dr" (debit-normal) | "cr" (credit-normal)
export const chartOfAccountsTable = pgTable(
  "chart_of_accounts",
  {
    id:               uuid("id").primaryKey().defaultRandom(),
    tenantId:         uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    code:             text("code").notNull(),
    name:             text("name").notNull(),
    type:             text("type").notNull(),          // "asset"|"liability"|"equity"|"income"|"expense"
    kind:             text("kind").notNull().default("group"),          // "group" | "ledger"
    normalBalance:    text("normal_balance").notNull().default("dr"),   // "dr" | "cr"
    parentId:         uuid("parent_id"),               // null = top-level; no FK to keep migrations simple
    description:      text("description"),
    isActive:         boolean("is_active").notNull().default(true),
    sortOrder:        integer("sort_order").notNull().default(0),
    // Module wiring — set by coa-sync service; null = manually created
    sourceModule:     text("source_module"),           // "fee"|"bank"|"vendor"|"store"|"hr"|null
    sourceRefId:      uuid("source_ref_id"),           // FK to the originating record (no DB constraint)
    isSystemAccount:  boolean("is_system_account").notNull().default(false), // if true, edit/delete disabled in UI
    createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:        timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    tenantCodeUniq: uniqueIndex("coa_tenant_code_unique").on(t.tenantId, t.code),
    typeIdx:        index("coa_type_idx").on(t.type),
    parentIdx:      index("coa_parent_idx").on(t.parentId),
    tenantIdx:      index("coa_tenant_idx").on(t.tenantId),
    srcModuleIdx:   index("coa_source_module_idx").on(t.sourceModule),
    srcRefIdx:      index("coa_source_ref_idx").on(t.sourceRefId),
  }),
);

const omit = { id: true, createdAt: true, updatedAt: true, tenantId: true } as const;

export const insertCoaSchema = createInsertSchema(chartOfAccountsTable).omit(omit);

export type CoaAccount      = typeof chartOfAccountsTable.$inferSelect;
export type InsertCoaAccount = z.infer<typeof insertCoaSchema>;
