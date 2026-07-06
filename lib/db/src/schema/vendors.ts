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

// ── Vendors / Suppliers ────────────────────────────────────────────────────────
// Companies or individuals the college purchases goods/services from.
export const vendorsTable = pgTable(
  "vendors",
  {
    id:            uuid("id").primaryKey().defaultRandom(),
    tenantId:      uuid("tenant_id"),                   // → tenants.id
    vendorCode:    text("vendor_code").notNull(),       // VND-001, VND-002, …
    name:          text("name").notNull(),
    contactPerson: text("contact_person"),
    phone:         text("phone"),
    email:         text("email"),
    address:       text("address"),
    taxNo:         text("tax_no"),                      // NTN / STRN
    bankName:      text("bank_name"),
    accountNumber: text("account_number"),
    active:        boolean("active").notNull().default(true),
    sortOrder:     integer("sort_order").notNull().default(0),
    notes:         text("notes"),
    coaId:         uuid("coa_id"),                      // → chart_of_accounts.id (AP sub-account)
    createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:     timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    tenantCodeUniq: uniqueIndex("vendors_tenant_code_unique").on(t.tenantId, t.vendorCode),
    tenantIdx: index("vendors_tenant_idx").on(t.tenantId),
    nameIdx:   index("vendors_name_idx").on(t.name),
    activeIdx: index("vendors_active_idx").on(t.active),
    coaIdx:    index("vendors_coa_idx").on(t.coaId),
  }),
);

const omit = { id: true, createdAt: true, updatedAt: true } as const;

export const insertVendorSchema = createInsertSchema(vendorsTable).omit(omit);

export type Vendor       = typeof vendorsTable.$inferSelect;
export type InsertVendor  = z.infer<typeof insertVendorSchema>;
