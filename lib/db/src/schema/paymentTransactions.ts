import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { applicationsTable } from "./applications";

// ── Payment Transactions ──────────────────────────────────────────────────────
// Online fee payments made through a Pakistani payment gateway (PayFast /
// Bank Alfalah and JazzCash) for the admission lifecycle fees. Each row is a
// single attempt to pay one of the two applicant fees.
//   feeType: "application" (entry-test processing fee) | "admission"
//   gateway: "payfast" | "jazzcash"
//   status:  "initiated" | "paid" | "failed" | "cancelled"
//   amount:  whole PKR rupees (gateway libs convert to paisa where required)
//   txnRef:  our own unique reference sent to the gateway (basket id / TxnRefNo)
export const paymentTransactionsTable = pgTable(
  "payment_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applicationsTable.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id"),
    feeType: text("fee_type").notNull(),
    gateway: text("gateway").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("PKR"),
    status: text("status").notNull().default("initiated"),
    txnRef: text("txn_ref").notNull(),
    gatewayTxnId: text("gateway_txn_id"),
    responseCode: text("response_code"),
    responseMessage: text("response_message"),
    rawResponse: text("raw_response"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => ({
    txnRefIdx: uniqueIndex("payment_txn_ref_idx").on(t.txnRef),
    appIdx: index("payment_txn_app_idx").on(t.applicationId),
    tenantIdx: index("payment_txn_tenant_idx").on(t.tenantId),
    statusIdx: index("payment_txn_status_idx").on(t.status),
  }),
);
