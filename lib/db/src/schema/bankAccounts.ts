import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Institution Bank Accounts ──────────────────────────────────────────────────
// Cash boxes and bank accounts owned by the college.
// type: "cash" = physical cash, "bank" = bank account
export const bankAccountsTable = pgTable(
  "bank_accounts",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    tenantId:     uuid("tenant_id"),
    type:         text("type").notNull(),           // "cash" | "bank"
    bankName:     text("bank_name"),
    accountTitle: text("account_title").notNull(),
    ibanNumber:   text("iban_number"),
    isActive:     boolean("is_active").notNull().default(true),
    notes:        text("notes"),
    sortOrder:    integer("sort_order").notNull().default(0),
    coaId:        uuid("coa_id"),                   // → chart_of_accounts.id (set by coa-sync)
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    typeIdx:  index("bank_accounts_type_idx").on(t.type),
    coaIdx:   index("bank_accounts_coa_idx").on(t.coaId),
    activeIdx: index("bank_accounts_active_idx").on(t.isActive),
  }),
);

const omit = { id: true, createdAt: true, updatedAt: true } as const;

export const insertBankAccountSchema = createInsertSchema(bankAccountsTable).omit(omit);

export type BankAccount       = typeof bankAccountsTable.$inferSelect;
export type InsertBankAccount  = z.infer<typeof insertBankAccountSchema>;
