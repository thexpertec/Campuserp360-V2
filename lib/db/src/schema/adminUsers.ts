import {
  pgTable, uuid, text, boolean, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Admin Users ───────────────────────────────────────────────────────────────
// Named admin accounts for maker-checker enforcement.
// The legacy env-var super-admin still works as a fallback.
export const adminUsersTable = pgTable("admin_users", {
  id:           uuid("id").primaryKey().defaultRandom(),
  username:     text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName:     text("full_name").notNull(),
  email:        text("email"),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  isActive:     boolean("is_active").notNull().default(true),
  // Multi-tenancy: null = global super-admin; set = scoped to one tenant
  tenantId:     uuid("tenant_id"),
  lastLoginAt:  timestamp("last_login_at", { withTimezone: true }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  usernameUniq: uniqueIndex("admin_users_username_uniq").on(t.username),
  activeIdx:    index("admin_users_active_idx").on(t.isActive),
}));

// ── Admin User Roles ──────────────────────────────────────────────────────────
// Grants a named user a permission level in a module.
// module: "finance" | "fees" | "exams" | "payroll" | "hr" | "admissions" | "settings" | "*"
// permission: "maker" | "checker" | "viewer"
export const adminUserRolesTable = pgTable("admin_user_roles", {
  id:         uuid("id").primaryKey().defaultRandom(),
  userId:     uuid("user_id").notNull().references(() => adminUsersTable.id, { onDelete: "cascade" }),
  module:     text("module").notNull(),
  permission: text("permission").notNull(), // maker | checker | viewer
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userModuleIdx: index("admin_user_roles_user_module_idx").on(t.userId, t.module),
}));

// ── Insert schemas ─────────────────────────────────────────────────────────────
export const insertAdminUserSchema = createInsertSchema(adminUsersTable).omit({
  id: true, createdAt: true, updatedAt: true, lastLoginAt: true,
});
export const insertAdminUserRoleSchema = createInsertSchema(adminUserRolesTable).omit({
  id: true, createdAt: true,
});

export type AdminUserRow     = typeof adminUsersTable.$inferSelect;
export type AdminUserRoleRow = typeof adminUserRolesTable.$inferSelect;
export type InsertAdminUser  = z.infer<typeof insertAdminUserSchema>;
