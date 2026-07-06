import {
  pgTable, uuid, text, boolean, integer, timestamp, index,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

// ── Career Positions ──────────────────────────────────────────────────────────
// Admin-managed list of open positions. Applicants pick from these as tag chips.
export const careerPositionsTable = pgTable("career_positions", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
  title:       text("title").notNull(),
  department:  text("department"),
  description: text("description"),
  isActive:    boolean("is_active").notNull().default(true),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantActiveIdx: index("career_positions_tenant_active_idx").on(t.tenantId, t.isActive),
}));

// ── Career Applications ───────────────────────────────────────────────────────
// status: new | reviewed | shortlisted | interviewed | hired | rejected
export const careerApplicationsTable = pgTable("career_applications", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
  fullName:    text("full_name").notNull(),
  fatherName:  text("father_name"),
  cnic:        text("cnic"),
  dob:         text("dob"),
  gender:      text("gender"),
  phone:       text("phone").notNull(),
  email:       text("email").notNull(),
  address:     text("address"),
  education:   text("education"),
  experience:  text("experience"),
  coverNote:   text("cover_note"),
  cvUrl:       text("cv_url"),
  notes:       text("notes"),
  status:      text("status").notNull().default("new"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantStatusIdx:  index("career_applications_tenant_status_idx").on(t.tenantId, t.status),
  tenantCreatedIdx: index("career_applications_tenant_created_idx").on(t.tenantId, t.createdAt),
}));

// ── Career Application → Positions Junction ───────────────────────────────────
export const careerApplicationPositionsTable = pgTable("career_application_positions", {
  id:             uuid("id").primaryKey().defaultRandom(),
  applicationId:  uuid("application_id").notNull().references(() => careerApplicationsTable.id, { onDelete: "cascade" }),
  positionId:     uuid("position_id").notNull().references(() => careerPositionsTable.id, { onDelete: "cascade" }),
}, (t) => ({
  appPosIdx: index("career_app_positions_app_idx").on(t.applicationId),
}));
