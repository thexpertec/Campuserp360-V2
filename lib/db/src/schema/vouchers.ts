import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

// ── Vouchers ──────────────────────────────────────────────────────────────────
// Receipt (money in) and Payment (money out) vouchers.
// voucherType: "receipt" | "payment"
// status:      "draft" (no JE) | "posted" (JE posted, locked)
// cashBankAccountId → chart_of_accounts.id of the cash/bank ledger.
export const vouchersTable = pgTable(
  "vouchers",
  {
    id:                uuid("id").primaryKey().defaultRandom(),
    tenantId:          uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "restrict" }),
    voucherType:       text("voucher_type").notNull(),          // "receipt" | "payment"
    status:            text("status").notNull().default("draft"), // "draft" | "posted"
    voucherNo:         text("voucher_no").notNull(),
    date:              date("date").notNull(),
    cashBankAccountId: uuid("cash_bank_account_id"),            // → chart_of_accounts.id
    narration:         text("narration"),
    journalEntryId:    uuid("journal_entry_id"),                // reserved for future JE linkage
    postedAt:          timestamp("posted_at", { withTimezone: true }),
    createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:         timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    tenantIdx: index("vouchers_tenant_idx").on(t.tenantId),
    typeIdx:   index("vouchers_type_idx").on(t.voucherType),
    statusIdx: index("vouchers_status_idx").on(t.status),
  }),
);

// ── Voucher rows ────────────────────────────────────────────────────────────────
// One row per income/expense account line on a voucher.
export const voucherRowsTable = pgTable(
  "voucher_rows",
  {
    id:        uuid("id").primaryKey().defaultRandom(),
    voucherId: uuid("voucher_id").notNull().references(() => vouchersTable.id, { onDelete: "cascade" }),
    accountId: uuid("account_id"),                  // → chart_of_accounts.id (income/expense ledger)
    ref:       text("ref"),
    amount:    numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    voucherIdx: index("voucher_rows_voucher_idx").on(t.voucherId),
  }),
);

const voucherOmit = { id: true, createdAt: true, updatedAt: true, tenantId: true } as const;

export const insertVoucherSchema    = createInsertSchema(vouchersTable).omit(voucherOmit);
export const insertVoucherRowSchema = createInsertSchema(voucherRowsTable).omit({ id: true, createdAt: true, voucherId: true });

export type Voucher        = typeof vouchersTable.$inferSelect;
export type InsertVoucher  = z.infer<typeof insertVoucherSchema>;
export type VoucherRow     = typeof voucherRowsTable.$inferSelect;
export type InsertVoucherRow = z.infer<typeof insertVoucherRowSchema>;
