import {
  pgTable,
  uuid,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

/**
 * Per-tenant payment gateway credentials.
 * Rows are upserted on save; absent row = fall back to env vars.
 * Credentials are stored as plaintext; restrict DB access appropriately.
 */
export const gatewayCredentialsTable = pgTable("gateway_credentials", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  tenantId:            uuid("tenant_id").notNull().unique().references(() => tenantsTable.id, { onDelete: "cascade" }),

  // ── JazzCash ──────────────────────────────────────────────────────────────
  jazzcashMerchantId:    text("jazzcash_merchant_id"),
  jazzcashPassword:      text("jazzcash_password"),
  jazzcashIntegritySalt: text("jazzcash_integrity_salt"),
  jazzcashMode:          text("jazzcash_mode").notNull().default("sandbox"),

  // ── PayFast (Bank Alfalah) ─────────────────────────────────────────────────
  payfastMerchantId:     text("payfast_merchant_id"),
  payfastSecuredKey:     text("payfast_secured_key"),
  payfastMerchantName:   text("payfast_merchant_name"),
  payfastMode:           text("payfast_mode").notNull().default("sandbox"),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type GatewayCredentials = typeof gatewayCredentialsTable.$inferSelect;
