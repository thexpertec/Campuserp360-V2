import {
  pgTable, uuid, text, boolean, timestamp, index, uniqueIndex, jsonb, integer,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Tenants ───────────────────────────────────────────────────────────────────
// Each tenant represents a school/institution using the SaaS platform.
export const tenantsTable = pgTable("tenants", {
  id:           uuid("id").primaryKey().defaultRandom(),
  name:         text("name").notNull(),
  slug:         text("slug").notNull().unique(),
  contactEmail: text("contact_email"),
  // Public hostname this tenant's website is served on (e.g. "girlscadetcollege.com").
  // Used to resolve which tenant a public website request belongs to.
  domain:       text("domain"),
  // Visual theme key applied to the public website ("ccm" | "gccm").
  siteTheme:    text("site_theme").notNull().default("ccm"),
  plan:         text("plan").notNull().default("basic"), // basic | standard | premium
  isActive:     boolean("is_active").notNull().default(true),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  slugUniq:   uniqueIndex("tenants_slug_uniq").on(t.slug),
  // A custom domain may belong to at most one tenant, so host-based public
  // resolution is unambiguous. Partial (WHERE domain IS NOT NULL) so multiple
  // tenants without a domain are still allowed.
  domainUniq: uniqueIndex("tenants_domain_uniq").on(t.domain).where(sql`${t.domain} IS NOT NULL`),
  activeIdx:  index("tenants_active_idx").on(t.isActive),
}));

// ── Tenant Admin Users ────────────────────────────────────────────────────────
// Named admin accounts scoped to a specific tenant.
export const tenantAdminUsersTable = pgTable("tenant_admin_users", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenantId:     uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  username:     text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  fullName:     text("full_name").notNull(),
  email:        text("email"),
  role:         text("role").notNull().default("admin"),
  isActive:     boolean("is_active").notNull().default(true),
  lastLoginAt:  timestamp("last_login_at", { withTimezone: true }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantUserUniq: uniqueIndex("tenant_admin_users_tenant_username_uniq").on(t.tenantId, t.username),
  tenantIdx:      index("tenant_admin_users_tenant_idx").on(t.tenantId),
}));

// ── Tenant Module Permissions ──────────────────────────────────────────────────
// Stores per-tenant feature flags. Absent row = module enabled by default.
// config holds optional limit overrides, e.g. { max_students: 500 }.
export const tenantModulePermissionsTable = pgTable("tenant_module_permissions", {
  id:        uuid("id").primaryKey().defaultRandom(),
  tenantId:  uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  moduleKey: text("module_key").notNull(),
  enabled:   boolean("enabled").notNull().default(true),
  config:    jsonb("config").default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantModuleUniq: uniqueIndex("tenant_module_permissions_tenant_module_uniq").on(t.tenantId, t.moduleKey),
  tenantIdx:        index("tenant_module_permissions_tenant_idx").on(t.tenantId),
}));

// ── SaaS Admin Account ────────────────────────────────────────────────────────
// Single row: the super-admin who manages the SaaS platform itself.
// Seeded on first boot from env vars; email is stored but never updatable via API.
export const saasAdminAccountTable = pgTable("saas_admin_account", {
  id:           uuid("id").primaryKey().defaultRandom(),
  username:     text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  email:        text("email"),
  tokenVersion: integer("token_version").notNull().default(1),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SaasAdminAccountRow = typeof saasAdminAccountTable.$inferSelect;

// ── Insert schemas ─────────────────────────────────────────────────────────────
export const insertTenantSchema = createInsertSchema(tenantsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertTenantAdminUserSchema = createInsertSchema(tenantAdminUsersTable).omit({
  id: true, createdAt: true, updatedAt: true, lastLoginAt: true,
});

export type TenantRow                    = typeof tenantsTable.$inferSelect;
export type TenantAdminUserRow           = typeof tenantAdminUsersTable.$inferSelect;
export type TenantModulePermissionRow    = typeof tenantModulePermissionsTable.$inferSelect;
export type InsertTenant                 = z.infer<typeof insertTenantSchema>;
