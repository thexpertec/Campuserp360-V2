import {
  pgTable, uuid, text, timestamp, index,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants.js";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const omitTs = { id: true, createdAt: true, updatedAt: true } as const;

// ── Gate Log (general in/out log) ─────────────────────────────────────────────
export const gateLogTable = pgTable("gate_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  personName: text("person_name").notNull(),
  personType: text("person_type").notNull().default("visitor"), // student | visitor | staff | delivery
  purpose: text("purpose"),
  vehicleNo: text("vehicle_no"),
  phone: text("phone"),
  inTime: text("in_time").notNull(),           // datetime string
  outTime: text("out_time"),
  gatePassNo: text("gate_pass_no"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  typeIdx: index("gate_log_type_idx").on(t.personType),
  inTimeIdx: index("gate_log_in_time_idx").on(t.inTime),
  tenantIdx: index("gate_log_tenant_idx").on(t.tenantId),
}));

// ── Gate Outpass (student outpass) ────────────────────────────────────────────
export const gateOutpassTable = pgTable("gate_outpass", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  studentName: text("student_name").notNull(),
  applicantId: text("applicant_id"),
  classCode: text("class_code"),
  purpose: text("purpose").notNull(),
  destination: text("destination"),
  validFrom: text("valid_from").notNull(),     // YYYY-MM-DD HH:MM
  validUntil: text("valid_until").notNull(),
  approvedBy: text("approved_by"),
  passNumber: text("pass_number"),
  status: text("status").notNull().default("active"), // active | used | expired | cancelled
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  statusIdx: index("gate_outpass_status_idx").on(t.status),
  applicantIdIdx: index("gate_outpass_applicant_id_idx").on(t.applicantId),
  tenantIdx: index("gate_outpass_tenant_idx").on(t.tenantId),
}));

// ── Insert schemas ────────────────────────────────────────────────────────────
export const insertGateLogSchema = createInsertSchema(gateLogTable).omit(omitTs);
export const insertGateOutpassSchema = createInsertSchema(gateOutpassTable).omit(omitTs);

export type GateLog = typeof gateLogTable.$inferSelect;
export type GateOutpass = typeof gateOutpassTable.$inferSelect;
export type InsertGateLog = z.infer<typeof insertGateLogSchema>;
export type InsertGateOutpass = z.infer<typeof insertGateOutpassSchema>;
