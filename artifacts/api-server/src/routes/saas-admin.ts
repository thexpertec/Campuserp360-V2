import { Router, type IRouter, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  tenantsTable, tenantAdminUsersTable, tenantModulePermissionsTable,
  chartOfAccountsTable,
  feeTypesTable,
  hrDepartmentsTable, hrDesignationsTable, hrSalaryGradesTable,
  hrIncentiveTypesTable, hrDeductionTypesTable,
  employeesTable,
  saasAdminAccountTable,
} from "@workspace/db/schema";
import { MODULES, MODULE_KEYS } from "@workspace/db/moduleRegistry";
import { eq, and, ne } from "drizzle-orm";
import { z } from "zod/v4";
import {
  requireSaasAdmin,
  verifySaasCredentials,
  issueSaasToken,
} from "../lib/saas-admin-auth";
import { issueToken } from "../lib/admin-auth";
import { clearTenantCache } from "../lib/tenant";
import { seedNewTenant } from "../lib/seed-data.js";
import {
  loadPrefixPool, findPrefixConflict, loadTenantPrefixes,
  DEFAULT_GR_FORMAT, DEFAULT_CANDIDATE_FORMAT,
  PREFIX_FIELD_LABELS, type PrefixPoolEntry,
} from "../lib/prefix-pool";

// Builds the 409 message when a slug collides with an entry in the global
// identifier pool (another tenant's slug, or any tenant's ID prefix).
function slugConflictMessage(slug: string, conflict: PrefixPoolEntry): string {
  if (conflict.field === "slug") {
    return "A tenant with this slug already exists";
  }
  const owner = conflict.tenantName ? `tenant "${conflict.tenantName}"` : "another tenant";
  return `Slug "${slug}" conflicts with the ${PREFIX_FIELD_LABELS[conflict.field]} of ${owner}. Choose a different slug.`;
}

const router: IRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts — please wait 15 minutes and try again." },
  skipSuccessfulRequests: true,
});

// ── SaaS Admin Login ──────────────────────────────────────────────────────────
router.post("/saas-admin/login", loginLimiter, async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: "username and password required" });
    return;
  }
  const user = await verifySaasCredentials(username, password);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const { token, expiresAt } = issueSaasToken(user);
  res.json({ token, expiresAt: expiresAt.toISOString(), user });
});

// ── SaaS Admin Me ─────────────────────────────────────────────────────────────
router.get("/saas-admin/me", requireSaasAdmin, async (req: Request, res: Response) => {
  try {
    const [row] = await db
      .select({ id: saasAdminAccountTable.id, username: saasAdminAccountTable.username, email: saasAdminAccountTable.email })
      .from(saasAdminAccountTable)
      .limit(1);
    if (row) {
      res.json({ ...req.saasAdmin, email: row.email });
      return;
    }
  } catch {}
  res.json(req.saasAdmin);
});

// ── Change SaaS Admin Credentials ─────────────────────────────────────────────
const changeCredentialsSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newUsername:     z.string().min(1).optional(),
  newPassword:     z.string().min(8, "New password must be at least 8 characters").optional(),
  confirmPassword: z.string().optional(),
});

router.patch(
  "/saas-admin/credentials",
  requireSaasAdmin,
  async (req: Request, res: Response) => {
    const parsed = changeCredentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
      return;
    }
    const { currentPassword, newUsername, newPassword, confirmPassword } = parsed.data;

    if (newPassword !== undefined && newPassword !== confirmPassword) {
      res.status(400).json({ error: "New passwords do not match" });
      return;
    }

    if (!newUsername && !newPassword) {
      res.status(400).json({ error: "Provide newUsername or newPassword (or both)" });
      return;
    }

    const caller = await verifySaasCredentials(req.saasAdmin!.username, currentPassword);
    if (!caller) {
      res.status(403).json({ error: "Incorrect current password" });
      return;
    }

    try {
      const updates: Record<string, unknown> = {};
      if (newUsername) {
        const [conflict] = await db
          .select({ id: saasAdminAccountTable.id })
          .from(saasAdminAccountTable)
          .where(eq(saasAdminAccountTable.username, newUsername))
          .limit(1);
        if (conflict && conflict.id !== caller.id) {
          res.status(409).json({ error: "Username already in use" });
          return;
        }
        updates.username = newUsername;
      }
      if (newPassword) {
        updates.passwordHash = await bcrypt.hash(newPassword, 12);
      }

      // Bump tokenVersion to invalidate all existing sessions server-side
      updates.tokenVersion = (caller.tokenVersion ?? 0) + 1;

      await db
        .update(saasAdminAccountTable)
        .set(updates)
        .where(eq(saasAdminAccountTable.id, caller.id));

      res.json({ ok: true });
    } catch (err) {
      console.error("[saas-admin] changeCredentials error:", err);
      res.status(500).json({ error: "Failed to update credentials" });
    }
  },
);

// ── List Tenants ──────────────────────────────────────────────────────────────
router.get(
  "/saas-admin/tenants",
  requireSaasAdmin,
  async (_req: Request, res: Response) => {
    try {
      const [tenants, prefixes] = await Promise.all([
        db.select().from(tenantsTable).orderBy(tenantsTable.createdAt),
        loadTenantPrefixes(),
      ]);
      res.json(tenants.map((t) => {
        const p = prefixes.get(String(t.id));
        return {
          ...t,
          applicantPrefix: p?.applicantPrefix ?? DEFAULT_CANDIDATE_FORMAT.prefix,
          enrolledPrefix:  p?.enrolledPrefix ?? DEFAULT_GR_FORMAT.prefix,
        };
      }));
    } catch (err) {
      res.status(500).json({ error: "Failed to list tenants" });
    }
  },
);

// ── Create Tenant ─────────────────────────────────────────────────────────────
// Normalize a custom domain to a bare host: strip scheme, www., path, port and
// lowercase it. The public tenant resolver matches the request host against this
// value, so it must be stored consistently (e.g. "girlscadetcollege.com").
function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  if (!d) return "";
  d = d.replace(/^https?:\/\//, "");
  d = d.split("/")[0] ?? "";
  d = d.split(":")[0] ?? "";
  d = d.replace(/^www\./, "");
  return d;
}

// A normalized custom domain must be a valid bare hostname: dot-separated labels
// of letters/digits/hyphens (not starting/ending with a hyphen) plus an alpha
// TLD. Rejects empty/garbage so we never store a value the resolver can't match.
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
function isValidDomain(d: string): boolean {
  return DOMAIN_RE.test(d);
}

// Returns another tenant already using this normalized domain, or null.
async function findTenantByDomain(domain: string, excludeId?: string) {
  const where = excludeId
    ? and(eq(tenantsTable.domain, domain), ne(tenantsTable.id, excludeId))
    : eq(tenantsTable.domain, domain);
  const [row] = await db
    .select({ id: tenantsTable.id, name: tenantsTable.name })
    .from(tenantsTable)
    .where(where)
    .limit(1);
  return row ?? null;
}

const domainSchema = z
  .string()
  .trim()
  .max(253)
  .optional()
  .or(z.literal(""));

// Slugs that collide with gateway-reserved paths and would silently break routing.
const RESERVED_SLUGS = new Set([
  "admin", "saas", "api", "portal", "uploads",
  "www", "static", "assets", "health", "favicon",
  "robots", "sitemap",
]);

const slugSchema = z
  .string()
  .min(3, "slug must be at least 3 characters")
  .max(20, "slug must be 20 characters or fewer")
  .regex(/^[a-z][a-z0-9-]*$/, "slug must start with a letter and contain only lowercase letters, numbers, and hyphens")
  .refine(s => !RESERVED_SLUGS.has(s), { message: "this slug is reserved and cannot be used" });

const createTenantSchema = z.object({
  name:         z.string().min(1),
  slug:         slugSchema,
  contactEmail: z.string().email().optional().or(z.literal("")),
  domain:       domainSchema,
  plan:         z.enum(["basic", "standard", "premium"]).optional(),
  isActive:     z.boolean().optional(),
});

router.post(
  "/saas-admin/tenants",
  requireSaasAdmin,
  async (req: Request, res: Response) => {
    const parsed = createTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
      return;
    }
    const domain = parsed.data.domain ? normalizeDomain(parsed.data.domain) : "";
    if (domain && !isValidDomain(domain)) {
      res.status(400).json({ error: "Invalid domain — use a bare hostname like school.edu.pk (no https://, www, path or port)" });
      return;
    }
    try {
      if (domain) {
        const conflict = await findTenantByDomain(domain);
        if (conflict) {
          res.status(409).json({ error: `Domain "${domain}" is already assigned to tenant "${conflict.name}"` });
          return;
        }
      }
      // Slug must be unique across the global identifier pool: every tenant's
      // slug AND every tenant's applicant/enrolled ID prefixes (case-insensitive).
      const pool = await loadPrefixPool();
      const slugConflict = findPrefixConflict(pool, "", "slug", parsed.data.slug.toUpperCase());
      if (slugConflict) {
        res.status(409).json({ error: slugConflictMessage(parsed.data.slug, slugConflict) });
        return;
      }
      const [tenant] = await db
        .insert(tenantsTable)
        .values({
          name:         parsed.data.name,
          slug:         parsed.data.slug,
          contactEmail: parsed.data.contactEmail || null,
          domain:       domain || null,
          plan:         parsed.data.plan ?? "basic",
          isActive:     parsed.data.isActive ?? true,
        })
        .returning();
      clearTenantCache();
      // Seed blank default content so the new tenant's website is immediately
      // functional (nav, footer, settings rows) instead of showing empty arrays.
      // Best-effort: a seed failure must NOT fail the create request.
      seedNewTenant(tenant.id).catch((err) => {
        console.error("[saas-admin] seedNewTenant failed for", tenant.id, err);
      });
      res.status(201).json(tenant);
    } catch (err: any) {
      if (String(err.message).includes("unique")) {
        res.status(409).json({ error: "A tenant with this slug already exists" });
        return;
      }
      res.status(500).json({ error: "Failed to create tenant" });
    }
  },
);

// ── Get Tenant ────────────────────────────────────────────────────────────────
router.get(
  "/saas-admin/tenants/:id",
  requireSaasAdmin,
  async (req: Request, res: Response) => {
    try {
      const [tenant] = await db
        .select()
        .from(tenantsTable)
        .where(eq(tenantsTable.id, String(req.params.id)));
      if (!tenant) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }
      res.json(tenant);
    } catch (err) {
      res.status(500).json({ error: "Failed to get tenant" });
    }
  },
);

// ── Update Tenant ─────────────────────────────────────────────────────────────
const updateTenantSchema = z.object({
  name:         z.string().min(1).optional(),
  slug:         slugSchema.optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  domain:       domainSchema,
  plan:         z.enum(["basic", "standard", "premium"]).optional(),
  isActive:     z.boolean().optional(),
});

router.patch(
  "/saas-admin/tenants/:id",
  requireSaasAdmin,
  async (req: Request, res: Response) => {
    const parsed = updateTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
      return;
    }
    const tenantId = String(req.params.id);
    let nextDomain: string | null | undefined;
    if (parsed.data.domain !== undefined) {
      const d = parsed.data.domain ? normalizeDomain(parsed.data.domain) : "";
      if (d && !isValidDomain(d)) {
        res.status(400).json({ error: "Invalid domain — use a bare hostname like school.edu.pk (no https://, www, path or port)" });
        return;
      }
      nextDomain = d || null;
    }
    try {
      if (nextDomain) {
        const conflict = await findTenantByDomain(nextDomain, tenantId);
        if (conflict) {
          res.status(409).json({ error: `Domain "${nextDomain}" is already assigned to tenant "${conflict.name}"` });
          return;
        }
      }
      // Check slug uniqueness against the global identifier pool (all tenant
      // slugs + all applicant/enrolled ID prefixes, case-insensitive). A
      // tenant's own current values never conflict with themselves.
      if (parsed.data.slug !== undefined) {
        const pool = await loadPrefixPool();
        const conflict = findPrefixConflict(pool, tenantId, "slug", parsed.data.slug.toUpperCase());
        if (conflict) {
          res.status(409).json({ error: slugConflictMessage(parsed.data.slug, conflict) });
          return;
        }
      }

      const updates: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) updates.name = parsed.data.name;
      if (parsed.data.slug !== undefined) updates.slug = parsed.data.slug;
      if (parsed.data.contactEmail !== undefined) updates.contactEmail = parsed.data.contactEmail || null;
      if (nextDomain !== undefined) updates.domain = nextDomain;
      if (parsed.data.plan !== undefined) updates.plan = parsed.data.plan;
      if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

      const [tenant] = await db
        .update(tenantsTable)
        .set(updates)
        .where(eq(tenantsTable.id, tenantId))
        .returning();
      if (!tenant) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }
      clearTenantCache();
      res.json(tenant);
    } catch (err) {
      res.status(500).json({ error: "Failed to update tenant" });
    }
  },
);

// ── List Tenant Admin Users ───────────────────────────────────────────────────
router.get(
  "/saas-admin/tenants/:id/admins",
  requireSaasAdmin,
  async (req: Request, res: Response) => {
    try {
      const admins = await db
        .select({
          id:          tenantAdminUsersTable.id,
          tenantId:    tenantAdminUsersTable.tenantId,
          username:    tenantAdminUsersTable.username,
          fullName:    tenantAdminUsersTable.fullName,
          email:       tenantAdminUsersTable.email,
          role:        tenantAdminUsersTable.role,
          isActive:    tenantAdminUsersTable.isActive,
          lastLoginAt: tenantAdminUsersTable.lastLoginAt,
          createdAt:   tenantAdminUsersTable.createdAt,
        })
        .from(tenantAdminUsersTable)
        .where(eq(tenantAdminUsersTable.tenantId, String(req.params.id)))
        .orderBy(tenantAdminUsersTable.createdAt);
      res.json(admins);
    } catch (err) {
      res.status(500).json({ error: "Failed to list tenant admins" });
    }
  },
);

// ── Create Tenant Admin User ──────────────────────────────────────────────────
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

const createAdminSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6),
  fullName: z.string().min(1),
  email:    z.string().email().optional().or(z.literal("")),
  role:     z.string().optional(),
});

router.post(
  "/saas-admin/tenants/:id/admins",
  requireSaasAdmin,
  async (req: Request, res: Response) => {
    const parsed = createAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
      return;
    }
    try {
      const [tenant] = await db
        .select({ id: tenantsTable.id })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, String(req.params.id)));
      if (!tenant) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }

      // Enforce globally unique usernames across all tenants — /admin/login
      // resolves by username alone, so duplicate usernames across tenants would
      // cause ambiguous login resolution.
      const [existingByUsername] = await db
        .select({ id: tenantAdminUsersTable.id })
        .from(tenantAdminUsersTable)
        .where(eq(tenantAdminUsersTable.username, parsed.data.username))
        .limit(1);
      if (existingByUsername) {
        res.status(409).json({ error: "Username already in use across all tenants — choose a unique username" });
        return;
      }

      const [admin] = await db
        .insert(tenantAdminUsersTable)
        .values({
          tenantId:     String(req.params.id),
          username:     parsed.data.username,
          passwordHash: await hashPassword(parsed.data.password),
          fullName:     parsed.data.fullName,
          email:        parsed.data.email || null,
          role:         parsed.data.role ?? "admin",
        })
        .returning({
          id:          tenantAdminUsersTable.id,
          tenantId:    tenantAdminUsersTable.tenantId,
          username:    tenantAdminUsersTable.username,
          fullName:    tenantAdminUsersTable.fullName,
          email:       tenantAdminUsersTable.email,
          role:        tenantAdminUsersTable.role,
          isActive:    tenantAdminUsersTable.isActive,
          createdAt:   tenantAdminUsersTable.createdAt,
        });
      res.status(201).json(admin);
    } catch (err: any) {
      if (String(err.message).includes("unique")) {
        res.status(409).json({ error: "Username already in use — choose a unique username" });
        return;
      }
      res.status(500).json({ error: "Failed to create tenant admin" });
    }
  },
);

// ── Reset Tenant Admin Password ───────────────────────────────────────────────
router.patch(
  "/saas-admin/tenants/:tenantId/admins/:adminId/reset-password",
  requireSaasAdmin,
  async (req: Request, res: Response) => {
    const { password } = req.body as { password?: string };
    if (!password || password.length < 6) {
      res.status(400).json({ error: "password must be at least 6 characters" });
      return;
    }
    try {
      const [admin] = await db
        .update(tenantAdminUsersTable)
        .set({ passwordHash: await hashPassword(password) })
        .where(
          and(
            eq(tenantAdminUsersTable.id, String(req.params.adminId)),
            eq(tenantAdminUsersTable.tenantId, String(req.params.tenantId)),
          ),
        )
        .returning({ id: tenantAdminUsersTable.id });
      if (!admin) {
        res.status(404).json({ error: "Admin user not found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to reset password" });
    }
  },
);

// ── Promote / Demote Tenant Admin Role ────────────────────────────────────────
router.patch(
  "/saas-admin/tenants/:tenantId/admins/:adminId/role",
  requireSaasAdmin,
  async (req: Request, res: Response) => {
    const { role } = req.body as { role?: string };
    if (!role || !["admin", "super_admin"].includes(role)) {
      res.status(400).json({ error: 'role must be "admin" or "super_admin"' });
      return;
    }
    try {
      const [updated] = await db
        .update(tenantAdminUsersTable)
        .set({ role })
        .where(
          and(
            eq(tenantAdminUsersTable.id, String(req.params.adminId)),
            eq(tenantAdminUsersTable.tenantId, String(req.params.tenantId)),
          ),
        )
        .returning({ id: tenantAdminUsersTable.id, role: tenantAdminUsersTable.role });
      if (!updated) {
        res.status(404).json({ error: "Admin user not found" });
        return;
      }
      res.json({ ok: true, role: updated.role });
    } catch (err) {
      res.status(500).json({ error: "Failed to update admin role" });
    }
  },
);

// ── Tenant Module Permissions ─────────────────────────────────────────────────

router.get(
  "/saas-admin/tenants/:id/modules",
  requireSaasAdmin,
  async (req: Request, res: Response) => {
    const tenantId = String(req.params.id);
    try {
      const [tenant] = await db
        .select({ id: tenantsTable.id })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId))
        .limit(1);
      if (!tenant) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }
      const rows = await db
        .select()
        .from(tenantModulePermissionsTable)
        .where(eq(tenantModulePermissionsTable.tenantId, tenantId));
      const saved = new Map(rows.map((r) => [r.moduleKey, r]));
      const modules = MODULES.map((m) => {
        const row = saved.get(m.key);
        return {
          key:    m.key,
          label:  m.label,
          description: m.description,
          enabled: row ? row.enabled : true,
          config:  (row?.config as Record<string, unknown>) ?? {},
          configFields: m.configFields ?? [],
        };
      });
      res.json({ modules });
    } catch (err) {
      res.status(500).json({ error: "Failed to get tenant modules" });
    }
  },
);

const updateModulesBodySchema = z.object({
  modules: z.array(
    z.object({
      key:     z.string(),
      enabled: z.boolean(),
      config:  z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});

router.put(
  "/saas-admin/tenants/:id/modules",
  requireSaasAdmin,
  async (req: Request, res: Response) => {
    const tenantId = String(req.params.id);
    const parsed = updateModulesBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
      return;
    }
    try {
      const [tenant] = await db
        .select({ id: tenantsTable.id })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId))
        .limit(1);
      if (!tenant) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }
      for (const mod of parsed.data.modules) {
        if (!MODULE_KEYS.includes(mod.key)) continue;
        await db
          .insert(tenantModulePermissionsTable)
          .values({
            tenantId,
            moduleKey: mod.key,
            enabled:   mod.enabled,
            config:    mod.config ?? {},
          })
          .onConflictDoUpdate({
            target: [tenantModulePermissionsTable.tenantId, tenantModulePermissionsTable.moduleKey],
            set: {
              enabled: mod.enabled,
              config:  mod.config ?? {},
            },
          });
      }
      const rows = await db
        .select()
        .from(tenantModulePermissionsTable)
        .where(eq(tenantModulePermissionsTable.tenantId, tenantId));
      const saved = new Map(rows.map((r) => [r.moduleKey, r]));
      const modules = MODULES.map((m) => {
        const row = saved.get(m.key);
        return {
          key:     m.key,
          label:   m.label,
          description: m.description,
          enabled: row ? row.enabled : true,
          config:  (row?.config as Record<string, unknown>) ?? {},
          configFields: m.configFields ?? [],
        };
      });
      res.json({ modules });
    } catch (err) {
      res.status(500).json({ error: "Failed to update tenant modules" });
    }
  },
);

// ── Delete Tenant ─────────────────────────────────────────────────────────────
// Requires the SaaS admin password in the body as an extra safety gate.
// Deletes all restrict-FK-linked data first, then removes the tenant row
// (which cascades to module permissions, site settings, payment config, etc.).
router.delete(
  "/saas-admin/tenants/:id",
  requireSaasAdmin,
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const { password } = req.body as { password?: string };

    if (!password) {
      res.status(400).json({ error: "Admin password is required" });
      return;
    }
    if (!await verifySaasCredentials(req.saasAdmin!.username, password)) {
      res.status(403).json({ error: "Incorrect admin password" });
      return;
    }

    try {
      const [tenant] = await db
        .select({ id: tenantsTable.id, name: tenantsTable.name, slug: tenantsTable.slug })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, id))
        .limit(1);
      if (!tenant) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }

      await db.transaction(async (tx) => {
        // 1. HR — delete employees first (their child rows cascade automatically:
        //    bank accounts, documents, salary transactions, attendance, leave requests).
        //    Then clear the lookup tables that have restrict FKs to tenants.
        await tx.delete(employeesTable).where(eq(employeesTable.tenantId, id));
        await tx.delete(hrIncentiveTypesTable).where(eq(hrIncentiveTypesTable.tenantId, id));
        await tx.delete(hrDeductionTypesTable).where(eq(hrDeductionTypesTable.tenantId, id));
        await tx.delete(hrDepartmentsTable).where(eq(hrDepartmentsTable.tenantId, id));
        await tx.delete(hrDesignationsTable).where(eq(hrDesignationsTable.tenantId, id));
        await tx.delete(hrSalaryGradesTable).where(eq(hrSalaryGradesTable.tenantId, id));

        // 2. Finance
        await tx.delete(chartOfAccountsTable).where(eq(chartOfAccountsTable.tenantId, id));
        await tx.delete(feeTypesTable).where(eq(feeTypesTable.tenantId, id));

        // 3. Tenant row — cascades to: tenant_module_permissions, site_settings,
        //    site_nav_items, admission_payment_config, gateway_credentials.
        await tx.delete(tenantsTable).where(eq(tenantsTable.id, id));
      });

      clearTenantCache();
      res.json({ ok: true, deleted: { id: tenant.id, name: tenant.name, slug: tenant.slug } });
    } catch (err: any) {
      console.error("[saas-admin] deleteTenant error:", err);
      res.status(500).json({ error: "Failed to delete tenant" });
    }
  },
);

// ── Impersonate Tenant ────────────────────────────────────────────────────────
// Issues a CCM admin token scoped to the given tenant.
router.post(
  "/saas-admin/tenants/:id/impersonate",
  requireSaasAdmin,
  async (req: Request, res: Response) => {
    try {
      const [tenant] = await db
        .select()
        .from(tenantsTable)
        .where(eq(tenantsTable.id, String(req.params.id)));
      if (!tenant) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }
      if (!tenant.isActive) {
        res.status(403).json({ error: "Tenant is inactive" });
        return;
      }

      // isSuperAdmin is intentionally false — impersonation is a tenant-scoped
      // admin session, not a super-admin session. Super-admin-only CCM endpoints
      // (e.g. /admin/admin-users) should remain inaccessible during impersonation.
      const { token, expiresAt, user } = issueToken({
        id:           `saas-impersonate-${tenant.id}`,
        username:     `saas@${tenant.slug}`,
        name:         `SaaS Admin (${tenant.name})`,
        role:         "admin",
        isSuperAdmin: false,
        tenantId:     tenant.id,
        roles:        [],
      });

      res.json({ token, expiresAt: expiresAt.toISOString(), tenant, user });
    } catch (err) {
      res.status(500).json({ error: "Failed to issue impersonation token" });
    }
  },
);

export default router;
