import { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { db, pool } from "@workspace/db";
import {
  adminUsersTable,
  adminUserRolesTable,
  feeChallansTable,
  feeTypesTable,
  studentsTable,
  examSchedulesTable,
  examTypesTable,
  employeeSalaryTransactionsTable,
  employeesTable,
  tenantAdminUsersTable,
} from "@workspace/db";
import { tenantsTable } from "@workspace/db/schema";
import { eq, asc, desc, sql, inArray } from "drizzle-orm";
import {
  requireAdmin,
  requireRole,
  requireGlobalRole,
  hashPassword,
  verifyPassword,
  issueToken,
  verifyEnvCredentials,
} from "../lib/admin-auth";

const router = Router();

// ── Rate limiter for login endpoints ─────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // max 10 attempts per IP per window
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts — please wait 15 minutes and try again." },
  skipSuccessfulRequests: true, // only count failed attempts
});

// ── Login (supports both env-var and DB users) ────────────────────────────────

router.post("/admin/login", loginLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    // 1. Try env-var super-admin first
    const envUser = verifyEnvCredentials(username, password);
    if (envUser) {
      const { token, expiresAt } = issueToken(envUser);
      return res.json({ token, expiresAt: expiresAt.toISOString(), user: envUser });
    }

    // 2. Try DB users (global admin_users table)
    const [dbUser] = await db
      .select()
      .from(adminUsersTable)
      .where(eq(adminUsersTable.username, username))
      .limit(1);

    if (dbUser) {
      if (!dbUser.isActive) {
        return res.status(401).json({ error: "Account is inactive" });
      }
      const { valid: dbValid, needsRehash: dbRehash } = await verifyPassword(password, dbUser.passwordHash);
      if (!dbValid) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      // Fetch roles
      const roles = await db
        .select({ module: adminUserRolesTable.module, permission: adminUserRolesTable.permission })
        .from(adminUserRolesTable)
        .where(eq(adminUserRolesTable.userId, dbUser.id));

      // Update last login; opportunistically re-hash legacy HMAC passwords to bcrypt
      const loginUpdates: Record<string, unknown> = { lastLoginAt: new Date() };
      if (dbRehash) loginUpdates.passwordHash = await hashPassword(password);
      await db
        .update(adminUsersTable)
        .set(loginUpdates)
        .where(eq(adminUsersTable.id, dbUser.id));

      const user = {
        id:           dbUser.id,
        username:     dbUser.username,
        name:         dbUser.fullName,
        role:         dbUser.isSuperAdmin ? "super_admin" : "staff",
        isSuperAdmin: dbUser.isSuperAdmin,
        tenantId:     dbUser.tenantId ?? undefined,
        roles,
      };

      const { token, expiresAt } = issueToken(user);
      return res.json({ token, expiresAt: expiresAt.toISOString(), user });
    }

    // 3. Try tenant_admin_users (tenant-scoped accounts created via SaaS Admin)
    const [tenantUser] = await db
      .select()
      .from(tenantAdminUsersTable)
      .where(eq(tenantAdminUsersTable.username, username))
      .limit(1);

    if (!tenantUser) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    if (!tenantUser.isActive) {
      return res.status(401).json({ error: "Account is inactive" });
    }
    const { valid: tValid, needsRehash: tRehash } = await verifyPassword(password, tenantUser.passwordHash);
    if (!tValid) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Update last login; opportunistically re-hash legacy HMAC passwords to bcrypt
    const tenantUpdates: Record<string, unknown> = { lastLoginAt: new Date() };
    if (tRehash) tenantUpdates.passwordHash = await hashPassword(password);
    await db
      .update(tenantAdminUsersTable)
      .set(tenantUpdates)
      .where(eq(tenantAdminUsersTable.id, tenantUser.id));

    const tenantUserPayload = {
      id:           tenantUser.id,
      username:     tenantUser.username,
      name:         tenantUser.fullName,
      role:         tenantUser.role,
      isSuperAdmin: false,
      tenantId:     tenantUser.tenantId,
      roles:        [] as { module: string; permission: string }[],
    };

    const { token: tenantToken, expiresAt: tenantExpiresAt } = issueToken(tenantUserPayload);
    return res.json({ token: tenantToken, expiresAt: tenantExpiresAt.toISOString(), user: tenantUserPayload });
  } catch (err) {
    req.log.error({ err }, "Login failed");
    return res.status(500).json({ error: "Login failed" });
  }
});

// ── Current user ──────────────────────────────────────────────────────────────

router.get("/admin/me", requireAdmin, async (req: Request, res: Response) => {
  const user = req.adminUser!;

  // If the token carries a tenantId, verify that tenant still exists in this DB.
  // A mismatch means the token was issued against a different database — force re-login.
  if (user.tenantId) {
    const [tenant] = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, user.tenantId))
      .limit(1);
    if (!tenant) {
      return res.status(401).json({ error: "Session tenant not found — please log in again" });
    }
  }

  if (user.id !== "env-admin") {
    try {
      const roles = await db
        .select({ module: adminUserRolesTable.module, permission: adminUserRolesTable.permission })
        .from(adminUserRolesTable)
        .where(eq(adminUserRolesTable.userId, user.id));
      return res.json({ ...user, roles });
    } catch {
      // fall through
    }
  }
  return res.json(user);
});

// ── GET /api/admin/tenant-name ────────────────────────────────────────────────
router.get("/admin/tenant-name", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = req.adminUser?.tenantId;
  if (!tenantId) return res.json({ name: "Cadet College Murree" });
  try {
    const [row] = await db.select({ name: tenantsTable.name }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
    return res.json({ name: row?.name ?? "Cadet College Murree" });
  } catch {
    return res.json({ name: "Cadet College Murree" });
  }
});

// ── List admin users (requires "delete"-level settings permission) ───────────

router.get("/admin/admin-users", requireGlobalRole("settings", "delete"), async (req: Request, res: Response) => {
  try {
    const users = await db
      .select({
        id:           adminUsersTable.id,
        username:     adminUsersTable.username,
        fullName:     adminUsersTable.fullName,
        email:        adminUsersTable.email,
        isSuperAdmin: adminUsersTable.isSuperAdmin,
        isActive:     adminUsersTable.isActive,
        lastLoginAt:  adminUsersTable.lastLoginAt,
        createdAt:    adminUsersTable.createdAt,
      })
      .from(adminUsersTable)
      .orderBy(asc(adminUsersTable.createdAt));

    const allRoles = await db.select().from(adminUserRolesTable);

    const rolesByUser: Record<string, Array<{ module: string; permission: string }>> = {};
    for (const r of allRoles) {
      if (!rolesByUser[r.userId]) rolesByUser[r.userId] = [];
      rolesByUser[r.userId].push({ module: r.module, permission: r.permission });
    }

    return res.json(
      users.map((u) => ({
        ...u,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt:   u.createdAt.toISOString(),
        roles:       rolesByUser[u.id] ?? [],
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list admin users");
    return res.status(500).json({ error: "Failed to load admin users" });
  }
});

// ── Create admin user (requires "delete"-level settings permission) ──────────

router.post("/admin/admin-users", requireGlobalRole("settings", "delete"), async (req: Request, res: Response) => {
  try {
    const { username, password, fullName, email, isSuperAdmin, isActive, roles } = req.body ?? {};
    if (!username?.trim()) return res.status(400).json({ error: "username is required" });
    if (!password?.trim()) return res.status(400).json({ error: "password is required" });
    if (!fullName?.trim()) return res.status(400).json({ error: "fullName is required" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    // Granting super-admin status is reserved for actual super-admins — a
    // named user with "delete" permission in settings can manage admin users
    // but cannot mint a new super-admin.
    const actor = req.adminUser!;
    if (Boolean(isSuperAdmin) && !actor.isSuperAdmin) {
      return res.status(403).json({ error: "Only a super-admin can grant super-admin status" });
    }

    const passwordHash = await hashPassword(password);

    const [user] = await db
      .insert(adminUsersTable)
      .values({
        username:     username.trim(),
        passwordHash,
        fullName:     fullName.trim(),
        email:        email?.trim() || null,
        isSuperAdmin: Boolean(isSuperAdmin),
        isActive:     isActive !== undefined ? Boolean(isActive) : true,
      })
      .returning();

    if (Array.isArray(roles) && roles.length) {
      await db.insert(adminUserRolesTable).values(
        roles.map((r: any) => ({
          userId:     user.id,
          module:     r.module,
          permission: r.permission,
        })),
      );
    }

    const userRoles = await db
      .select({ module: adminUserRolesTable.module, permission: adminUserRolesTable.permission })
      .from(adminUserRolesTable)
      .where(eq(adminUserRolesTable.userId, user.id));

    const { passwordHash: _ph, ...safeUser } = user;
    return res.status(201).json({ ...safeUser, roles: userRoles });
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Username already exists" });
    req.log.error({ err }, "Failed to create admin user");
    return res.status(500).json({ error: "Failed to create admin user" });
  }
});

// ── Update admin user (requires "delete"-level settings permission) ──────────

router.put("/admin/admin-users/:id", requireGlobalRole("settings", "delete"), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { fullName, email, isSuperAdmin, isActive, password, roles } = req.body ?? {};

    const actor = req.adminUser!;
    const [target] = await db
      .select({ isSuperAdmin: adminUsersTable.isSuperAdmin })
      .from(adminUsersTable)
      .where(eq(adminUsersTable.id, id))
      .limit(1);
    if (!target) return res.status(404).json({ error: "User not found" });

    // Only an actual super-admin can grant/modify super-admin status, or
    // modify an account that already holds it.
    if (!actor.isSuperAdmin && (target.isSuperAdmin || (isSuperAdmin !== undefined && Boolean(isSuperAdmin)))) {
      return res.status(403).json({ error: "Only a super-admin can grant or modify super-admin status" });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (fullName !== undefined)     updates.fullName     = fullName.trim();
    if (email !== undefined)        updates.email        = email?.trim() || null;
    if (isSuperAdmin !== undefined) updates.isSuperAdmin = Boolean(isSuperAdmin);
    if (isActive !== undefined)     updates.isActive     = Boolean(isActive);
    if (password?.trim()) {
      if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
      updates.passwordHash = await hashPassword(password);
    }

    const [user] = await db
      .update(adminUsersTable)
      .set(updates)
      .where(eq(adminUsersTable.id, id))
      .returning();
    if (!user) return res.status(404).json({ error: "User not found" });

    if (Array.isArray(roles)) {
      await db.delete(adminUserRolesTable).where(eq(adminUserRolesTable.userId, id));
      if (roles.length) {
        await db.insert(adminUserRolesTable).values(
          roles.map((r: any) => ({
            userId:     id,
            module:     r.module,
            permission: r.permission,
          })),
        );
      }
    }

    const userRoles = await db
      .select({ module: adminUserRolesTable.module, permission: adminUserRolesTable.permission })
      .from(adminUserRolesTable)
      .where(eq(adminUserRolesTable.userId, id));

    const { passwordHash: _ph, ...safeUser } = user;
    return res.json({ ...safeUser, roles: userRoles });
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Username already exists" });
    req.log.error({ err }, "Failed to update admin user");
    return res.status(500).json({ error: "Failed to update admin user" });
  }
});

// ── Delete admin user (requires "delete"-level settings permission) ──────────

router.delete("/admin/admin-users/:id", requireGlobalRole("settings", "delete"), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    // Only an actual super-admin can delete another super-admin account.
    const actor = req.adminUser!;
    const [target] = await db
      .select({ isSuperAdmin: adminUsersTable.isSuperAdmin })
      .from(adminUsersTable)
      .where(eq(adminUsersTable.id, id))
      .limit(1);
    if (target?.isSuperAdmin && !actor.isSuperAdmin) {
      return res.status(403).json({ error: "Only a super-admin can delete a super-admin account" });
    }

    // Null out all FK references before deleting to avoid constraint violations
    await db.execute(sql`
      UPDATE journal_entries             SET created_by  = NULL WHERE created_by  = ${id}::uuid;
      UPDATE journal_entries             SET approved_by = NULL WHERE approved_by = ${id}::uuid;
      UPDATE fee_challans                SET collected_by = NULL WHERE collected_by = ${id}::uuid;
      UPDATE fee_challans                SET approved_by  = NULL WHERE approved_by  = ${id}::uuid;
      UPDATE exam_schedules              SET marks_entered_by = NULL WHERE marks_entered_by = ${id}::uuid;
      UPDATE exam_schedules              SET published_by     = NULL WHERE published_by     = ${id}::uuid;
      UPDATE employee_salary_transactions SET prepared_by = NULL WHERE prepared_by = ${id}::uuid;
      UPDATE employee_salary_transactions SET approved_by = NULL WHERE approved_by = ${id}::uuid;
    `);
    await db.delete(adminUsersTable).where(eq(adminUsersTable.id, id));
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete admin user");
    return res.status(500).json({ error: "Failed to delete admin user" });
  }
});

// ── Batch name resolution ─────────────────────────────────────────────────────

router.get("/admin/admin-users/resolve-names", requireAdmin, async (req: Request, res: Response) => {
  try {
    const ids = String(req.query.ids ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ids.length) return res.json({});
    const users = await db
      .select({ id: adminUsersTable.id, fullName: adminUsersTable.fullName })
      .from(adminUsersTable)
      .where(inArray(adminUsersTable.id, ids));
    const map: Record<string, string> = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
    return res.json(map);
  } catch (err) {
    req.log.error({ err }, "Failed to resolve admin user names");
    return res.status(500).json({ error: "Failed to resolve names" });
  }
});

// ── Approvals inbox ───────────────────────────────────────────────────────────

router.get("/admin/approvals/inbox", requireAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.adminUser!;
    const isSuperAdmin = user.isSuperAdmin;
    // Tenant-scoped admins see empty approvals — financial/exam/payroll tables are not
    // yet tenant-partitioned so we must not expose cross-tenant data.
    if (user.tenantId) {
      return res.json({ items: [], total: 0 });
    }

    const canCheck = (module: string) =>
      isSuperAdmin ||
      user.roles.some(
        (r) =>
          (r.module === module || r.module === "*") &&
          r.permission === "post",
      );

    const items: any[] = [];

    if (canCheck("fees")) {
      const challans = await db
        .select({
          id:            feeChallansTable.id,
          challanNumber: feeChallansTable.challanNumber,
          amount:        feeChallansTable.amount,
          collectedBy:   feeChallansTable.collectedBy,
          createdAt:     feeChallansTable.createdAt,
          feeTypeName:   feeTypesTable.name,
          studentFullName: studentsTable.fullName,
        })
        .from(feeChallansTable)
        .innerJoin(feeTypesTable, eq(feeChallansTable.feeTypeId, feeTypesTable.id))
        .innerJoin(studentsTable, eq(feeChallansTable.studentId, studentsTable.id))
        .where(eq(feeChallansTable.status, "pending_approval"))
        .orderBy(desc(feeChallansTable.createdAt))
        .limit(100);

      for (const c of challans) {
        if (!isSuperAdmin && c.collectedBy && c.collectedBy === user.id) continue;
        items.push({
          module:     "fees",
          type:       "fee_challan",
          id:         c.id,
          label:      `${c.challanNumber ?? c.id} — ${c.studentFullName} (${c.feeTypeName})`,
          amount:     c.amount,
          createdBy:  c.collectedBy,
          createdAt:  c.createdAt.toISOString(),
          approveUrl: `/api/admin/fee-challans/${c.id}/approve`,
          rejectUrl:  `/api/admin/fee-challans/${c.id}/reject`,
        });
      }
    }

    if (canCheck("exams")) {
      const schedules = await db
        .select({
          id:             examSchedulesTable.id,
          classCode:      examSchedulesTable.classCode,
          subjectName:    examSchedulesTable.subjectName,
          sessionLabel:   examSchedulesTable.sessionLabel,
          examDate:       examSchedulesTable.examDate,
          marksEnteredBy: examSchedulesTable.marksEnteredBy,
          updatedAt:      examSchedulesTable.updatedAt,
          examTypeName:   examTypesTable.name,
        })
        .from(examSchedulesTable)
        .leftJoin(examTypesTable, eq(examSchedulesTable.examTypeId, examTypesTable.id))
        .where(eq(examSchedulesTable.resultsStatus, "submitted"))
        .orderBy(desc(examSchedulesTable.updatedAt))
        .limit(100);

      for (const s of schedules) {
        if (!isSuperAdmin && s.marksEnteredBy && s.marksEnteredBy === user.id) continue;
        items.push({
          module:     "exams",
          type:       "exam_schedule",
          id:         s.id,
          label:      `${s.examTypeName ?? "Exam"} — ${s.classCode} ${s.subjectName ?? ""} (${s.sessionLabel})`,
          createdBy:  s.marksEnteredBy,
          createdAt:  s.updatedAt.toISOString(),
          date:       s.examDate,
          approveUrl: `/api/admin/exams/schedules/${s.id}/publish`,
          rejectUrl:  `/api/admin/exams/schedules/${s.id}/reject`,
        });
      }
    }

    if (canCheck("payroll")) {
      const txns = await db
        .select({
          id:         employeeSalaryTransactionsTable.id,
          month:      employeeSalaryTransactionsTable.month,
          netSalary:  employeeSalaryTransactionsTable.netSalary,
          preparedBy: employeeSalaryTransactionsTable.preparedBy,
          createdAt:  employeeSalaryTransactionsTable.createdAt,
          fullName:   employeesTable.fullName,
          staffId:    employeesTable.staffId,
        })
        .from(employeeSalaryTransactionsTable)
        .innerJoin(employeesTable, eq(employeeSalaryTransactionsTable.employeeId, employeesTable.id))
        .where(eq(employeeSalaryTransactionsTable.status, "pending"))
        .orderBy(desc(employeeSalaryTransactionsTable.createdAt))
        .limit(100);

      for (const t of txns) {
        if (!isSuperAdmin && t.preparedBy && t.preparedBy === user.id) continue;
        items.push({
          module:     "payroll",
          type:       "salary_transaction",
          id:         t.id,
          label:      `${t.staffId} ${t.fullName} — ${t.month}`,
          amount:     t.netSalary,
          createdBy:  t.preparedBy,
          createdAt:  t.createdAt.toISOString(),
          approveUrl: `/api/admin/payroll/transactions/${t.id}/approve`,
          rejectUrl:  `/api/admin/payroll/transactions/${t.id}/reject`,
        });
      }
    }

    if (canCheck("finance")) {
      // Draft journal entries awaiting checker approval
      try {
        const jeRows = await pool.query(`
          SELECT id, narration, source_ref, date::text, created_by, created_at,
                 COALESCE((SELECT SUM(dr_amount) FROM journal_entry_lines WHERE journal_entry_id = je.id), 0) AS total_dr
          FROM journal_entries je
          WHERE status = 'draft' AND NOT is_voided
          ORDER BY created_at DESC
          LIMIT 100
        `);
        for (const je of jeRows.rows as any[]) {
          if (!isSuperAdmin && je.created_by && je.created_by === user.id) continue;
          items.push({
            module:     "finance",
            type:       "journal_entry",
            id:         je.id,
            label:      `JE ${je.source_ref ?? je.id.slice(0, 8)} — ${je.narration ?? "(no description)"}`,
            amount:     Number(je.total_dr),
            createdBy:  je.created_by,
            createdAt:  je.created_at,
            date:       je.date,
            approveUrl: `/api/admin/journal-entries/${je.id}/post`,
            rejectUrl:  `/api/admin/journal-entries/${je.id}/reject`,
          });
        }
      } catch (err: any) {
        if (err?.code !== "42P01") req.log.warn({ err }, "Failed to load draft JEs for inbox");
      }

      // Draft vouchers awaiting checker approval
      try {
        const vRows = await pool.query(`
          SELECT v.id, v.voucher_type, v.voucher_no, v.date::text, v.narration, v.created_by, v.created_at,
                 COALESCE((SELECT SUM(amount) FROM voucher_rows WHERE voucher_id = v.id), 0) AS total
          FROM vouchers v
          WHERE v.status = 'draft'
          ORDER BY v.created_at DESC
          LIMIT 100
        `);
        for (const v of vRows.rows as any[]) {
          if (!isSuperAdmin && v.created_by && v.created_by === user.id) continue;
          const typeLabel = v.voucher_type === "receipt" ? "Receipt Voucher" : "Payment Voucher";
          items.push({
            module:     "finance",
            type:       "voucher",
            id:         v.id,
            label:      `${typeLabel} ${v.voucher_no} — ${v.narration ?? "(no narration)"}`,
            amount:     Number(v.total),
            createdBy:  v.created_by,
            createdAt:  v.created_at,
            date:       v.date,
            approveUrl: `/api/admin/vouchers/${v.id}/post`,
            rejectUrl:  null,
          });
        }
      } catch (err: any) {
        if (err?.code !== "42P01") req.log.warn({ err }, "Failed to load draft vouchers for inbox");
      }
    }

    if (canCheck("admissions")) {
      // Applications in result_announced status awaiting admit/reject decision
      try {
        const appRows = await pool.query(`
          SELECT id, reference_id, full_name, status, updated_at
          FROM applications
          WHERE status IN ('result_announced', 'on_hold')
          ORDER BY updated_at DESC
          LIMIT 100
        `);
        for (const app of appRows.rows as any[]) {
          items.push({
            module:     "admissions",
            type:       "application_status",
            id:         app.id,
            label:      `${app.reference_id} — ${app.full_name} (${app.status.replace(/_/g, " ")})`,
            createdBy:  null,
            createdAt:  app.updated_at,
            approveUrl: `/api/admin/applications/${app.reference_id}/status`,
            rejectUrl:  null,
          });
        }
      } catch (err: any) {
        if (err?.code !== "42P01") req.log.warn({ err }, "Failed to load admissions applications for inbox");
      }
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Resolve creator names from admin_users
    const creatorIds = [...new Set(items.map((i: any) => i.createdBy).filter(Boolean) as string[])];
    if (creatorIds.length > 0) {
      const users = await db
        .select({ id: adminUsersTable.id, fullName: adminUsersTable.fullName })
        .from(adminUsersTable)
        .where(inArray(adminUsersTable.id, creatorIds));
      const nameMap: Record<string, string> = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
      for (const item of items as any[]) {
        if (item.createdBy) item.createdByName = nameMap[item.createdBy] ?? null;
      }
    }

    return res.json({ items, total: items.length });
  } catch (err) {
    req.log.error({ err }, "Failed to load approvals inbox");
    return res.status(500).json({ error: "Failed to load approvals inbox" });
  }
});

// ── Approvals count (for sidebar badge) ──────────────────────────────────────

router.get("/admin/approvals/count", requireAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.adminUser!;
    const isSuperAdmin = user.isSuperAdmin;
    // Tenant-scoped admins — financial/exam/payroll tables are not yet tenant-partitioned
    if (user.tenantId) {
      return res.json({ count: 0 });
    }

    const canCheck = (module: string) =>
      isSuperAdmin ||
      user.roles.some(
        (r) => (r.module === module || r.module === "*") && r.permission === "post",
      );

    const baseResults = await Promise.all([
      canCheck("fees")
        ? db.select({ n: sql<number>`count(*)` }).from(feeChallansTable)
            .where(eq(feeChallansTable.status, "pending_approval"))
        : Promise.resolve([{ n: 0 }]),
      canCheck("exams")
        ? db.select({ n: sql<number>`count(*)` }).from(examSchedulesTable)
            .where(eq(examSchedulesTable.resultsStatus, "submitted"))
        : Promise.resolve([{ n: 0 }]),
      canCheck("payroll")
        ? db.select({ n: sql<number>`count(*)` }).from(employeeSalaryTransactionsTable)
            .where(eq(employeeSalaryTransactionsTable.status, "pending"))
        : Promise.resolve([{ n: 0 }]),
    ]);
    let count = baseResults.reduce((sum, r) => sum + Number(r[0]?.n ?? 0), 0);

    if (canCheck("finance")) {
      try {
        const [jeCount, vCount] = await Promise.all([
          pool.query(`SELECT COUNT(*)::int AS n FROM journal_entries WHERE status = 'draft' AND NOT is_voided`),
          pool.query(`SELECT COUNT(*)::int AS n FROM vouchers WHERE status = 'draft'`),
        ]);
        count += Number((jeCount.rows[0] as any)?.n ?? 0);
        count += Number((vCount.rows[0] as any)?.n ?? 0);
      } catch { /* JE/voucher tables may not exist yet */ }
    }

    if (canCheck("admissions")) {
      try {
        const aCount = await pool.query(`SELECT COUNT(*)::int AS n FROM applications WHERE status IN ('result_announced','on_hold')`);
        count += Number((aCount.rows[0] as any)?.n ?? 0);
      } catch { /* applications table may not exist */ }
    }

    return res.json({ count });
  } catch (err) {
    req.log.error({ err }, "Failed to get approvals count");
    return res.status(500).json({ error: "Failed to get approvals count" });
  }
});

// ── Staff role management (settings-checker or super-admin) ──────────────────
// Allows a settings-checker to view and update module roles for staff users
// without needing full super-admin access.

router.get("/admin/staff/roles", requireGlobalRole("settings", "post"), async (req: Request, res: Response) => {
  try {
    const users = await db
      .select({
        id:           adminUsersTable.id,
        username:     adminUsersTable.username,
        fullName:     adminUsersTable.fullName,
        email:        adminUsersTable.email,
        isSuperAdmin: adminUsersTable.isSuperAdmin,
        isActive:     adminUsersTable.isActive,
      })
      .from(adminUsersTable)
      .orderBy(asc(adminUsersTable.createdAt));

    const allRoles = await db.select().from(adminUserRolesTable);
    const rolesByUser: Record<string, Array<{ module: string; permission: string }>> = {};
    for (const r of allRoles) {
      if (!rolesByUser[r.userId]) rolesByUser[r.userId] = [];
      rolesByUser[r.userId]!.push({ module: r.module, permission: r.permission });
    }

    return res.json(
      users.map((u) => ({ ...u, roles: rolesByUser[u.id] ?? [] })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list staff roles");
    return res.status(500).json({ error: "Failed to load staff roles" });
  }
});

router.put("/admin/staff/:userId/roles", requireGlobalRole("settings", "post"), async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);
    const { roles } = req.body ?? {};
    if (!Array.isArray(roles)) return res.status(400).json({ error: "roles must be an array" });

    const VALID_MODULES = ["finance", "fees", "exams", "payroll", "admissions", "settings", "hr", "hostel", "library", "store", "transport", "medical", "*"];
    const VALID_PERMISSIONS = ["view", "draft", "post", "edit", "delete"];

    for (const r of roles as any[]) {
      if (!VALID_MODULES.includes(r.module)) return res.status(400).json({ error: `Invalid module: ${r.module}` });
      if (!VALID_PERMISSIONS.includes(r.permission)) return res.status(400).json({ error: `Invalid permission: ${r.permission}` });
    }

    const [user] = await db.select({ id: adminUsersTable.id, isSuperAdmin: adminUsersTable.isSuperAdmin })
      .from(adminUsersTable).where(eq(adminUsersTable.id, userId)).limit(1);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Settings-checkers cannot grant super-admin or modify super-admin users
    const actor = req.adminUser!;
    if (!actor.isSuperAdmin && user.isSuperAdmin) {
      return res.status(403).json({ error: "Cannot modify roles for a super-admin user" });
    }

    await db.delete(adminUserRolesTable).where(eq(adminUserRolesTable.userId, userId));
    if (roles.length) {
      await db.insert(adminUserRolesTable).values(
        (roles as any[]).map((r) => ({ userId, module: r.module, permission: r.permission })),
      );
    }

    const updated = await db
      .select({ module: adminUserRolesTable.module, permission: adminUserRolesTable.permission })
      .from(adminUserRolesTable)
      .where(eq(adminUserRolesTable.userId, userId));

    return res.json({ userId, roles: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update staff roles");
    return res.status(500).json({ error: "Failed to update staff roles" });
  }
});

export default router;
