import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const admissionPaymentConfigTable = pgTable(
  "admission_payment_config",
  {
    id:                      uuid("id").primaryKey().defaultRandom(),
    tenantId:                uuid("tenant_id").notNull().unique().references(() => tenantsTable.id, { onDelete: "cascade" }),

    // Fee enabled toggle
    applicationFeeEnabled:   boolean("application_fee_enabled").notNull().default(true),

    // Fee amounts (PKR, whole rupees)
    applicationFeeAmount:    integer("application_fee_amount").notNull().default(2000),
    admissionFeeAmount:      integer("admission_fee_amount").notNull().default(15000),

    // Bank deposit details
    bankName:                text("bank_name").notNull().default("National Bank of Pakistan"),
    bankBranch:              text("bank_branch").notNull().default(""),
    accountTitle:            text("account_title").notNull().default(""),
    accountNumber:           text("account_number").notNull().default("0004-6000-2000-3201"),
    challanInstructions:     text("challan_instructions").notNull().default(""),

    // Payment method toggles
    enableBankDeposit:       boolean("enable_bank_deposit").notNull().default(true),
    enableJazzcash:          boolean("enable_jazzcash").notNull().default(true),
    enablePayfast:           boolean("enable_payfast").notNull().default(true),

    updatedAt:               timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
);

export type AdmissionPaymentConfig = typeof admissionPaymentConfigTable.$inferSelect;

// Hard-coded defaults — returned when no DB row exists for the tenant
// so existing tenants continue working without migration data.
export const PAYMENT_CONFIG_DEFAULTS = {
  applicationFeeEnabled:   true,
  applicationFeeAmount:    2000,
  admissionFeeAmount:      15000,
  bankName:                "National Bank of Pakistan",
  bankBranch:              "",
  accountTitle:            "",
  accountNumber:           "0004-6000-2000-3201",
  challanInstructions:     "",
  enableBankDeposit:       true,
  enableJazzcash:          true,
  enablePayfast:           true,
} as const;
