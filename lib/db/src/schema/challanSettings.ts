import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const challanSettingsTable = pgTable(
  "challan_settings",
  {
    id:               uuid("id").primaryKey().defaultRandom(),
    tenantId:         uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    phone:            text("phone"),
    address:          text("address"),
    showSection:      boolean("show_section").notNull().default(true),
    showFeeDesc:      boolean("show_fee_desc").notNull().default(true),
    showBankAccounts: boolean("show_bank_accounts").notNull().default(false),
    showInstructions: boolean("show_instructions").notNull().default(true),
    hideZeroRows:     boolean("hide_zero_rows").notNull().default(false),
    bankAccountIds:   text("bank_account_ids"),
    institutionCode:  text("institution_code"),
    activeTemplate:   text("active_template").notNull().default("standard"),
    updatedAt:        timestamp("updated_at", { withTimezone: true }).$onUpdate(() => new Date()),
  },
  (t) => ({
    tenantUniq: uniqueIndex("challan_settings_tenant_uniq").on(t.tenantId),
  }),
);

export type ChallanSettingsRow = typeof challanSettingsTable.$inferSelect;
