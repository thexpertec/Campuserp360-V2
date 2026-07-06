import {
  pgTable,
  uuid,
  text,
  boolean,
  numeric,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { chartOfAccountsTable } from "./coa";

// ── Journal Entries ───────────────────────────────────────────────────────────
// Header record for a balanced double-entry posting.
// source_module values: "manual" | "fee" | "vendor" | "hr" | "store" | ...

export const journalEntriesTable = pgTable(
  "journal_entries",
  {
    id:            uuid("id").primaryKey().defaultRandom(),
    tenantId:      uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    date:          text("date").notNull(),
    narration:     text("narration").notNull(),
    sourceRef:     text("source_ref"),
    sourceModule:  text("source_module").notNull().default("manual"),
    sourceRefId:   uuid("source_ref_id"),
    isVoided:      boolean("is_voided").notNull().default(false),
    voidedAt:      timestamp("voided_at", { withTimezone: true }),
    createdBy:     uuid("created_by"),
    postedAt:      timestamp("posted_at", { withTimezone: true }),
    createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx:      index("je_tenant_idx").on(t.tenantId),
    dateIdx:        index("je_date_idx").on(t.date),
    moduleIdx:      index("je_source_module_idx").on(t.sourceModule),
  }),
);

// ── Journal Entry Lines ───────────────────────────────────────────────────────
// Each line is a debit or credit against a ledger-kind COA account.

export const journalEntryLinesTable = pgTable(
  "journal_entry_lines",
  {
    id:               uuid("id").primaryKey().defaultRandom(),
    journalEntryId:   uuid("journal_entry_id").notNull().references(() => journalEntriesTable.id, { onDelete: "cascade" }),
    accountId:        uuid("account_id").notNull().references(() => chartOfAccountsTable.id, { onDelete: "restrict" }),
    drAmount:         numeric("dr_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    crAmount:         numeric("cr_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    memo:             text("memo"),
    sortOrder:        integer("sort_order").notNull().default(0),
    createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    jeIdx:            index("jel_je_idx").on(t.journalEntryId),
    accountIdx:       index("jel_account_idx").on(t.accountId),
  }),
);

// ── Insert schemas ────────────────────────────────────────────────────────────

const jeOmit = { id: true, createdAt: true, tenantId: true } as const;

export const insertJournalEntrySchema = createInsertSchema(journalEntriesTable).omit(jeOmit);
export const insertJournalEntryLineSchema = createInsertSchema(journalEntryLinesTable).omit({
  id: true,
  createdAt: true,
});

export type JournalEntry       = typeof journalEntriesTable.$inferSelect;
export type JournalEntryLine   = typeof journalEntryLinesTable.$inferSelect;
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type InsertJournalEntryLine = z.infer<typeof insertJournalEntryLineSchema>;
