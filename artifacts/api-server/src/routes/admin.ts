import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { resolveUrl } from "../lib/storage";
import { seedAllData } from "../lib/seed-data";
import { canonicalizeCnic, canonicalizePhone } from "../lib/format-utils.js";
import { checkAcademicSetup, academicSetupErrorMessage } from "../lib/academic-setup";
import { db, applicationsTable, applicationEventsTable, testCentresTable, studentsTable, guardiansTable, meritConfigTable, academicYearsTable, admissionsSettingsTable, applicationDocumentsTable, employeesTable, hrLeaveRequestsTable, hrDepartmentsTable, hrAttendanceTable, employeeSalaryTransactionsTable, hostelAllocationsTable, hostelRoomsTable, hostelBlocksTable, libraryIssuesTable, medicalVisitsTable, transportVehiclesTable, storeItemsTable, feeChallansTable, classesTable, subjectsTable, examSchedulesTable, examTypesTable, batchPrintJobsTable, studentPrintRecordsTable, adminUsersTable, sectionAllocationsTable, studentEnrollmentsTable, interviewersTable, testSchedulesTable, paymentTransactionsTable, mediaLibraryTable, tenantAdminUsersTable, tenantsTable, printTemplatesTable, printSignaturesTable, bankAccountsTable, journalEntriesTable } from "@workspace/db";
import { tryCreateAndPostJE, coaByCode, coaById, postApplicationFeeJE } from "../lib/je-factory";
import { resolvePaymentConfig } from "../lib/payment-config-cache.js";
import { eq, and, or, gte, lte, ilike, sql, desc, asc, count, inArray, isNull, isNotNull, sum, ne } from "drizzle-orm";
import {
  UpdateAdminApplicationStatusBody,
  AddAdminApplicationEventBody,
  AssignAdminApplicationTestBody,
  RecordAdminApplicationResultBody,
  BulkUpdateAdminApplicationStatusBody,
  BulkScheduleAdminApplicationTestBody,
  BulkRecordAdminApplicationResultBody,
  PreviewAdminMeritListBody,
  CommitAdminMeritListBody,
  BulkRecordAdminApplicationInterviewBody,
  BulkUpdateAdminApplicationMarksBody,
  BulkScheduleAdminApplicationInterviewBody,
  BulkSaveInterviewPerformaBody,
  CreateAdminMeritConfigBody,
  UpdateAdminMeritConfigBody,
  ScheduleAllAdminApplicationsBody,
  BulkUpdateDocVerificationBody,
  BulkUpdateEntryTestBody,
  BulkUpdateInterviewBody,
} from "@workspace/api-zod";
import {
  requireAdmin,
  requireRole,
  verifyToken,
  verifyPassword,
  verifyEnvCredentials,
} from "../lib/admin-auth";
import { verifySaasCredentials } from "../lib/saas-admin-auth";
import { getAdminTenantId } from "../lib/tenant";
import { logger } from "../lib/logger";
import type { NextFunction } from "express";

const router: IRouter = Router();

const ADMIN_UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
try { fs.mkdirSync(ADMIN_UPLOADS_DIR, { recursive: true }); } catch { /* ignore */ }

// ── Global super-admin refresh ────────────────────────────────────────────────
// Tenant admin users promoted to super_admin via the SaaS Admin panel may be
// carrying a stale JWT (issued before the promotion).  This middleware reads the
// token on every /admin/* request and, when the decoded user is a tenant admin
// user whose token still says isSuperAdmin=false, checks their current role.
// If they are now super_admin in the DB, it upgrades req.adminUser.isSuperAdmin
// to true so that requireRole() bypasses all checks.
//
// The DB lookup is cached in-memory (60s TTL) — without the cache this added a
// round-trip to the remote DB on EVERY /admin/* request, which measurably
// slowed the whole console and amplified pool contention under load.
const ROLE_CACHE_TTL_MS = 60_000;
const roleRefreshCache = new Map<string, { isSuperAdmin: boolean; expires: number }>();

async function isPromotedSuperAdmin(userId: string): Promise<boolean> {
  const now = Date.now();
  const cached = roleRefreshCache.get(userId);
  if (cached && cached.expires > now) return cached.isSuperAdmin;

  const [row] = await db
    .select({ role: tenantAdminUsersTable.role })
    .from(tenantAdminUsersTable)
    .where(eq(tenantAdminUsersTable.id, userId))
    .limit(1);
  const isSuperAdmin = row?.role === "super_admin";

  // Opportunistic cleanup so the map cannot grow unbounded.
  if (roleRefreshCache.size > 1000) {
    for (const [k, v] of roleRefreshCache) {
      if (v.expires <= now) roleRefreshCache.delete(k);
    }
  }
  roleRefreshCache.set(userId, { isSuperAdmin, expires: now + ROLE_CACHE_TTL_MS });
  return isSuperAdmin;
}

router.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const rawToken = match?.[1]?.trim() ?? (req.query["token"] as string | undefined);
    if (!rawToken) { next(); return; }

    const user = verifyToken(rawToken);
    if (!user) { next(); return; }

    // Already a super admin per token — nothing to refresh.
    if (user.isSuperAdmin) { req.adminUser = user; next(); return; }

    // Only refresh for tenant admin users (they have a tenantId in the token
    // but no rows in admin_user_roles — their isSuperAdmin comes from the
    // tenant_admin_users.role column, which may have changed since login).
    if (user.tenantId && user.id !== "env-admin") {
      if (await isPromotedSuperAdmin(user.id)) {
        user.isSuperAdmin = true;
      }
    }

    req.adminUser = user;
  } catch {
    // Non-fatal — let the route's own auth middleware reject if needed.
  }
  next();
});

// ── Tenant isolation helpers ──────────────────────────────────────────────────
// CRITICAL: the runtime DB role (neondb_owner) bypasses RLS, so these explicit
// app-level tenant filters are the PRIMARY isolation guard. They are fail-CLOSED:
// when no tenant can be resolved, queries must match nothing (never all tenants).

/**
 * Effective tenant for the request, resolved fail-closed by the admin-router
 * middleware (req.adminTenantId): scoped admin token tenantId, else super-admin
 * override (X-Tenant-Id / ?tenant=) or host-domain match. Falls back to the raw
 * token tenantId if the middleware did not run (defensive).
 */
function reqTenantId(req: Request): string | undefined {
  return (req.adminTenantId ?? (req as any).adminUser?.tenantId) as string | undefined;
}

/**
 * Fail-closed tenant gate for tenant-scoped routes. Returns the resolved tenantId,
 * or sends HTTP 400 and returns null (caller MUST `return` immediately).
 */
function requireTenant(req: Request, res: Response): string | null {
  const tid = reqTenantId(req);
  if (!tid) {
    res.status(400).json({ error: "Tenant context required — select a school before continuing." });
    return null;
  }
  return tid;
}

/**
 * WHERE clause for looking up an application by referenceId, ALWAYS tenant-scoped.
 * Fail-closed: with no resolvable tenant the clause matches nothing, preventing
 * cross-tenant referenceId guessing / IDOR on every referenceId-based endpoint.
 */
function appByRef(req: Request, referenceId: string) {
  const tid = reqTenantId(req);
  return tid
    ? and(eq(applicationsTable.referenceId, referenceId), eq(applicationsTable.tenantId, tid))
    : sql`false`;
}

// Total seats is derived from the sum of active classes in the DB.
// Falls back to 0 if no classes are configured yet.
async function fetchTotalSeats(tenantId: string): Promise<number> {
  const [{ total = 0 } = { total: 0 }] = await db
    .select({ total: sql<number>`COALESCE(SUM(${classesTable.seats}), 0)::int` })
    .from(classesTable)
    .where(and(eq(classesTable.active, true), eq(classesTable.tenantId, tenantId)));
  return Number(total);
}

// Status groupings for dashboard tiles.
// "received" = just submitted; "under_review" = docs being checked; "pending_verification" = awaiting officer sign-off
const PENDING_STATUSES = ["received", "pending_verification", "under_review"];

const REF_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateReferenceId(): string {
  const year = new Date().getFullYear();
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += REF_ID_ALPHABET[Math.floor(Math.random() * REF_ID_ALPHABET.length)];
  }
  return `CCM-${year}-${suffix}`;
}

// ── Dashboard summary ────────────────────────────────────────────────────────
router.get(
  "/admin/dashboard/summary",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const now = Date.now();
      const since24h = new Date(now - 24 * 60 * 60 * 1000);

      // Tenant isolation: scope application + student queries when token carries a tenantId
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const appTenantFilter = eq(applicationsTable.tenantId, tenantId);
      const stuTenantFilter = eq(studentsTable.tenantId, tenantId);

      const [{ total = 0 } = { total: 0 }] = await db
        .select({ total: count() })
        .from(applicationsTable)
        .where(appTenantFilter);

      const [{ recent = 0 } = { recent: 0 }] = await db
        .select({ recent: count() })
        .from(applicationsTable)
        .where(and(gte(applicationsTable.createdAt, since24h), appTenantFilter));

      const byStatusRows = await db
        .select({
          status: applicationsTable.status,
          count: count(),
        })
        .from(applicationsTable)
        .where(appTenantFilter)
        .groupBy(applicationsTable.status);

      const byClassRows = await db
        .select({
          status: applicationsTable.classApplying,
          count: count(),
        })
        .from(applicationsTable)
        .where(appTenantFilter)
        .groupBy(applicationsTable.classApplying)
        .orderBy(applicationsTable.classApplying);

      const byExamCenterRows = await db
        .select({
          examCenter: applicationsTable.examCenter,
          count: count(),
        })
        .from(applicationsTable)
        .where(appTenantFilter)
        .groupBy(applicationsTable.examCenter)
        .orderBy(desc(count()))
        .limit(8);

      const twoYearsAgo = new Date(now - 2 * 365 * 24 * 60 * 60 * 1000);
      const byMonthRows = await db
        .select({
          year: sql<number>`extract(year from ${applicationsTable.createdAt})::int`,
          month: sql<number>`extract(month from ${applicationsTable.createdAt})::int`,
          count: count(),
        })
        .from(applicationsTable)
        .where(and(gte(applicationsTable.createdAt, twoYearsAgo), appTenantFilter))
        .groupBy(
          sql`extract(year from ${applicationsTable.createdAt})`,
          sql`extract(month from ${applicationsTable.createdAt})`,
        )
        .orderBy(
          sql`extract(year from ${applicationsTable.createdAt})`,
          sql`extract(month from ${applicationsTable.createdAt})`,
        );

      const [[{ enrolledStudents = 0 } = { enrolledStudents: 0 }], totalSeats] = await Promise.all([
        db
          .select({ enrolledStudents: count() })
          .from(studentsTable)
          .where(stuTenantFilter ? and(eq(studentsTable.status, "active"), stuTenantFilter) : eq(studentsTable.status, "active")),
        fetchTotalSeats(tenantId),
      ]);

      const statusCounts = new Map<string, number>();
      for (const row of byStatusRows) {
        statusCounts.set(row.status, Number(row.count));
      }

      const sumStatuses = (keys: string[]): number =>
        keys.reduce((acc, k) => acc + (statusCounts.get(k) ?? 0), 0);

      const pendingVerification = statusCounts.get("pending_verification") ?? 0;
      const underReview = statusCounts.get("under_review") ?? 0;
      const testScheduled = statusCounts.get("test_scheduled") ?? 0;
      const testTaken = statusCounts.get("test_taken") ?? 0;
      const resultAnnounced = statusCounts.get("result_announced") ?? 0;
      const admitted = statusCounts.get("admitted") ?? 0;
      const spotsRemaining = Math.max(0, totalSeats - admitted);

      // Recent activity: latest events joined to their application (scoped to tenant).
      const recentEventRows = await db
        .select({
          id: applicationEventsTable.id,
          referenceId: applicationsTable.referenceId,
          fullName: applicationsTable.fullName,
          eventType: applicationEventsTable.eventType,
          title: applicationEventsTable.title,
          description: applicationEventsTable.description,
          occurredAt: applicationEventsTable.occurredAt,
        })
        .from(applicationEventsTable)
        .innerJoin(
          applicationsTable,
          eq(applicationEventsTable.applicationId, applicationsTable.id),
        )
        .where(appTenantFilter)
        .orderBy(desc(applicationEventsTable.occurredAt))
        .limit(12);

      return res.json({
        totalApplications: Number(total),
        submissions24h: Number(recent),
        totalSeats: totalSeats,
        spotsRemaining,
        pendingVerification,
        underReview,
        testScheduled,
        testTaken,
        resultAnnounced,
        admitted,
        enrolledStudents: Number(enrolledStudents),
        byStatus: byStatusRows.map((r) => ({
          status: r.status,
          count: Number(r.count),
        })),
        byClass: byClassRows.map((r) => ({
          status: r.status,
          count: Number(r.count),
        })),
        byExamCenter: byExamCenterRows.map((r) => ({
          examCenter: r.examCenter,
          count: Number(r.count),
        })),
        byMonth: byMonthRows.map((r) => ({
          year: Number(r.year),
          month: Number(r.month),
          count: Number(r.count),
        })),
        recentEvents: recentEventRows.map((r) => ({
          id: r.id,
          referenceId: r.referenceId,
          applicantName: r.fullName,
          eventType: r.eventType,
          title: r.title,
          description: r.description,
          occurredAt: r.occurredAt.toISOString(),
        })),
        serverTime: new Date(now).toISOString(),
      });
    } catch (err) {
      req.log.error({ err }, "Failed to compute admin dashboard summary");
      return res.status(500).json({ error: "Failed to load dashboard" });
    }
  },
);

// ── Dashboard: module-level stats ────────────────────────────────────────────
router.get(
  "/admin/dashboard/module-stats",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const today = new Date().toISOString().slice(0, 10);

      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const stuTenantFilter = eq(studentsTable.tenantId, tenantId);
      const empTenantFilter = eq(employeesTable.tenantId, tenantId);

      const [
        cadetsRes, staffRes, deptsRes, hostelRes,
        booksRes, sickRes, vehiclesRes, storeRes, leaveRes,
      ] = await Promise.all([
        db.select({ n: count() }).from(studentsTable)
          .where(stuTenantFilter ? and(eq(studentsTable.status, "active"), stuTenantFilter) : eq(studentsTable.status, "active")),
        db.select({ n: count() }).from(employeesTable)
          .where(empTenantFilter ? and(eq(employeesTable.status, "active"), empTenantFilter) : eq(employeesTable.status, "active")),
        db.select({ n: count() }).from(hrDepartmentsTable)
          .where(empTenantFilter ? and(eq(hrDepartmentsTable.active, true), eq(hrDepartmentsTable.tenantId, tenantId!)) : eq(hrDepartmentsTable.active, true)),
        db.select({ n: count() }).from(hostelAllocationsTable)
          .innerJoin(studentsTable, eq(hostelAllocationsTable.studentId, studentsTable.id))
          .where(stuTenantFilter ? and(eq(hostelAllocationsTable.status, "active"), stuTenantFilter) : eq(hostelAllocationsTable.status, "active")),
        db.select({ n: count() }).from(libraryIssuesTable)
          .innerJoin(studentsTable, eq(libraryIssuesTable.studentId, studentsTable.id))
          .where(stuTenantFilter
            ? and(or(eq(libraryIssuesTable.status, "issued"), eq(libraryIssuesTable.status, "overdue")), stuTenantFilter)
            : or(eq(libraryIssuesTable.status, "issued"), eq(libraryIssuesTable.status, "overdue")),
          ),
        db.select({ n: count() }).from(medicalVisitsTable)
          .innerJoin(studentsTable, eq(medicalVisitsTable.studentId, studentsTable.id))
          .where(stuTenantFilter ? and(eq(medicalVisitsTable.visitDate, today), stuTenantFilter) : eq(medicalVisitsTable.visitDate, today)),
        db.select({ n: count() }).from(transportVehiclesTable)
          .where(eq(transportVehiclesTable.active, true)),
        db.select({ n: count() }).from(storeItemsTable)
          .where(eq(storeItemsTable.active, true)),
        db.select({ n: count() }).from(hrLeaveRequestsTable)
          .innerJoin(employeesTable, eq(hrLeaveRequestsTable.employeeId, employeesTable.id))
          .where(empTenantFilter
            ? and(eq(hrLeaveRequestsTable.status, "approved"), lte(hrLeaveRequestsTable.fromDate, today), gte(hrLeaveRequestsTable.toDate, today), empTenantFilter)
            : and(eq(hrLeaveRequestsTable.status, "approved"), lte(hrLeaveRequestsTable.fromDate, today), gte(hrLeaveRequestsTable.toDate, today)),
          ),
      ]);

      return res.json({
        enrolledCadets:   Number(cadetsRes[0]?.n   ?? 0),
        activeStaff:      Number(staffRes[0]?.n     ?? 0),
        departments:      Number(deptsRes[0]?.n     ?? 0),
        hostelBedsFilled: Number(hostelRes[0]?.n    ?? 0),
        libraryBooksOut:  Number(booksRes[0]?.n     ?? 0),
        sickBayToday:     Number(sickRes[0]?.n      ?? 0),
        activeVehicles:   Number(vehiclesRes[0]?.n  ?? 0),
        storeItems:       Number(storeRes[0]?.n     ?? 0),
        staffOnLeave:     Number(leaveRes[0]?.n     ?? 0),
      });
    } catch (err) {
      req.log.error({ err }, "Failed to compute module stats");
      return res.status(500).json({ error: "Failed to load module stats" });
    }
  },
);

// ── Dashboard: fee by class ───────────────────────────────────────────────────
router.get(
  "/admin/dashboard/fee-by-class",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const rows = await db
        .select({
          classCode: studentsTable.classCode,
          status: feeChallansTable.status,
          total: sum(feeChallansTable.amount),
        })
        .from(feeChallansTable)
        .innerJoin(studentsTable, eq(feeChallansTable.studentId, studentsTable.id))
        .where(eq(studentsTable.tenantId, tenantId))
        .groupBy(studentsTable.classCode, feeChallansTable.status)
        .orderBy(studentsTable.classCode);

      const byClass = new Map<string, { collected: number; outstanding: number }>();
      for (const row of rows) {
        if (!byClass.has(row.classCode)) byClass.set(row.classCode, { collected: 0, outstanding: 0 });
        const entry = byClass.get(row.classCode)!;
        const amtK = Math.round(Number(row.total ?? 0) / 1000);
        if (row.status === "paid") entry.collected += amtK;
        else entry.outstanding += amtK;
      }

      return res.json(
        Array.from(byClass.entries()).map(([cls, data]) => ({ cls, ...data })),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to compute fee by class");
      return res.status(500).json({ error: "Failed to load fee by class" });
    }
  },
);

// ── Dashboard: finance KPIs ───────────────────────────────────────────────────
router.get(
  "/admin/dashboard/finance-kpis",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const tenantFilter = inArray(
        feeChallansTable.studentId,
        db
          .select({ id: studentsTable.id })
          .from(studentsTable)
          .where(eq(studentsTable.tenantId, tenantId)),
      );
      const today = new Date();
      const ym      = today.toISOString().slice(0, 7); // "YYYY-MM"
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [collectedRow] = await db
        .select({ total: sum(feeChallansTable.amount) })
        .from(feeChallansTable)
        .where(and(
          tenantFilter,
          eq(feeChallansTable.status, "paid"),
          sql`to_char(${feeChallansTable.paidAt}, 'YYYY-MM') = ${ym}`,
        ));

      const [weekRow] = await db
        .select({ total: sum(feeChallansTable.amount) })
        .from(feeChallansTable)
        .where(and(
          tenantFilter,
          eq(feeChallansTable.status, "paid"),
          gte(feeChallansTable.paidAt, weekAgo),
        ));

      const [outstandingRow] = await db
        .select({ total: sum(feeChallansTable.amount) })
        .from(feeChallansTable)
        .where(and(tenantFilter, or(
          eq(feeChallansTable.status, "pending"),
          eq(feeChallansTable.status, "overdue"),
        )));

      const outstandingStudents = await db
        .selectDistinct({ studentId: feeChallansTable.studentId })
        .from(feeChallansTable)
        .where(and(tenantFilter, or(
          eq(feeChallansTable.status, "pending"),
          eq(feeChallansTable.status, "overdue"),
        )));

      return res.json({
        collectedThisMonth:  Number(collectedRow?.total  ?? 0),
        paidThisWeek:        Number(weekRow?.total        ?? 0),
        outstanding:         Number(outstandingRow?.total ?? 0),
        outstandingStudents: outstandingStudents.length,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to compute finance KPIs");
      return res.status(500).json({ error: "Failed to load finance KPIs" });
    }
  },
);

// ── Dashboard: fee overview (aggregate for FinanceDashboard) ─────────────────
router.get(
  "/admin/dashboard/fee-overview",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const tenantFilter = inArray(
        feeChallansTable.studentId,
        db
          .select({ id: studentsTable.id })
          .from(studentsTable)
          .where(eq(studentsTable.tenantId, tenantId)),
      );
      const [statusRows, monthRows] = await Promise.all([
        db
          .select({
            status: feeChallansTable.status,
            cnt: count(),
            total: sum(feeChallansTable.amount),
          })
          .from(feeChallansTable)
          .where(tenantFilter)
          .groupBy(feeChallansTable.status),
        db
          .select({
            month: feeChallansTable.month,
            status: feeChallansTable.status,
            total: sum(feeChallansTable.amount),
          })
          .from(feeChallansTable)
          .where(and(tenantFilter, sql`${feeChallansTable.month} IS NOT NULL`))
          .groupBy(feeChallansTable.month, feeChallansTable.status)
          .orderBy(asc(feeChallansTable.month)),
      ]);

      let totalChallans = 0, paidCount = 0, pendingCount = 0, overdueCount = 0;
      let totalBilled = 0, totalPaid = 0;
      for (const row of statusRows) {
        const n   = Number(row.cnt ?? 0);
        const amt = Number(row.total ?? 0);
        totalChallans += n;
        totalBilled   += amt;
        if (row.status === "paid")         { paidCount += n; totalPaid += amt; }
        else if (row.status === "overdue")   overdueCount += n;
        else                                 pendingCount += n;
      }

      const byMonthMap = new Map<string, { billed: number; paid: number }>();
      for (const row of monthRows) {
        if (!row.month) continue;
        if (!byMonthMap.has(row.month)) byMonthMap.set(row.month, { billed: 0, paid: 0 });
        const entry = byMonthMap.get(row.month)!;
        const amt = Number(row.total ?? 0);
        entry.billed += amt;
        if (row.status === "paid") entry.paid += amt;
      }

      const byMonth = Array.from(byMonthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, ...v }));

      return res.json({ totalChallans, paidCount, pendingCount, overdueCount, totalBilled, totalPaid, byMonth });
    } catch (err) {
      req.log.error({ err }, "Failed to compute fee overview");
      return res.status(500).json({ error: "Failed to load fee overview" });
    }
  },
);

// ── Dashboard: HR summary ─────────────────────────────────────────────────────
router.get(
  "/admin/dashboard/hr-summary",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const today            = new Date().toISOString().slice(0, 10);
      const currentMonth     = today.slice(0, 7);
      const sevenDaysOut     = new Date();
      sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
      const sevenDaysOutStr  = sevenDaysOut.toISOString().slice(0, 10);

      const tenantId       = reqTenantId(req);
      const empTenantFilter = tenantId ? eq(employeesTable.tenantId, tenantId) : undefined;

      const [
        totalStaffRows,
        attendanceTodayRows,
        onLeaveRows,
        byDeptRows,
        byRoleRows,
        upcomingLeaveRows,
        payrollRows,
      ] = await Promise.all([
        // Count of active employees — scoped to tenant
        db.select({ n: count() })
          .from(employeesTable)
          .where(empTenantFilter ? and(eq(employeesTable.status, "active"), empTenantFilter) : eq(employeesTable.status, "active")),

        // Today's attendance by status — join to employees for tenant scope
        db.select({ status: hrAttendanceTable.status, cnt: count() })
          .from(hrAttendanceTable)
          .innerJoin(employeesTable, eq(hrAttendanceTable.employeeId, employeesTable.id))
          .where(empTenantFilter ? and(eq(hrAttendanceTable.attendanceDate, today), empTenantFilter) : eq(hrAttendanceTable.attendanceDate, today))
          .groupBy(hrAttendanceTable.status),

        // Approved/pending leave requests covering today — join for tenant scope
        db.select({ n: count() })
          .from(hrLeaveRequestsTable)
          .innerJoin(employeesTable, eq(hrLeaveRequestsTable.employeeId, employeesTable.id))
          .where(empTenantFilter
            ? and(lte(hrLeaveRequestsTable.fromDate, today), gte(hrLeaveRequestsTable.toDate, today), or(eq(hrLeaveRequestsTable.status, "approved"), eq(hrLeaveRequestsTable.status, "pending")), empTenantFilter)
            : and(lte(hrLeaveRequestsTable.fromDate, today), gte(hrLeaveRequestsTable.toDate, today), or(eq(hrLeaveRequestsTable.status, "approved"), eq(hrLeaveRequestsTable.status, "pending"))),
          ),

        // Active employees grouped by department — scoped to tenant
        db.select({ deptName: hrDepartmentsTable.name, cnt: count() })
          .from(employeesTable)
          .leftJoin(hrDepartmentsTable, eq(employeesTable.departmentId, hrDepartmentsTable.id))
          .where(empTenantFilter ? and(eq(employeesTable.status, "active"), empTenantFilter) : eq(employeesTable.status, "active"))
          .groupBy(hrDepartmentsTable.name)
          .orderBy(desc(count())),

        // Active employees grouped by role — scoped to tenant
        db.select({ role: employeesTable.role, cnt: count() })
          .from(employeesTable)
          .where(empTenantFilter ? and(eq(employeesTable.status, "active"), empTenantFilter) : eq(employeesTable.status, "active"))
          .groupBy(employeesTable.role)
          .orderBy(desc(count())),

        // Upcoming / active leaves in next 7 days — join for tenant scope
        db.select({
            id:        hrLeaveRequestsTable.id,
            fullName:  employeesTable.fullName,
            leaveType: hrLeaveRequestsTable.leaveType,
            fromDate:  hrLeaveRequestsTable.fromDate,
            toDate:    hrLeaveRequestsTable.toDate,
            status:    hrLeaveRequestsTable.status,
          })
          .from(hrLeaveRequestsTable)
          .innerJoin(employeesTable, eq(hrLeaveRequestsTable.employeeId, employeesTable.id))
          .where(empTenantFilter
            ? and(gte(hrLeaveRequestsTable.toDate, today), lte(hrLeaveRequestsTable.fromDate, sevenDaysOutStr), or(eq(hrLeaveRequestsTable.status, "approved"), eq(hrLeaveRequestsTable.status, "pending")), empTenantFilter)
            : and(gte(hrLeaveRequestsTable.toDate, today), lte(hrLeaveRequestsTable.fromDate, sevenDaysOutStr), or(eq(hrLeaveRequestsTable.status, "approved"), eq(hrLeaveRequestsTable.status, "pending"))),
          )
          .orderBy(asc(hrLeaveRequestsTable.fromDate))
          .limit(10),

        // Current-month payroll — join to employees for tenant scope
        db.select({
            status: employeeSalaryTransactionsTable.status,
            netSum: sum(employeeSalaryTransactionsTable.netSalary),
            cnt:    count(),
          })
          .from(employeeSalaryTransactionsTable)
          .innerJoin(employeesTable, eq(employeeSalaryTransactionsTable.employeeId, employeesTable.id))
          .where(empTenantFilter ? and(eq(employeeSalaryTransactionsTable.month, currentMonth), empTenantFilter) : eq(employeeSalaryTransactionsTable.month, currentMonth))
          .groupBy(employeeSalaryTransactionsTable.status),
      ]);

      // Attendance map
      const attMap: Record<string, number> = {};
      attendanceTodayRows.forEach(r => { attMap[r.status] = Number(r.cnt); });

      // Payroll map
      const payMap: Record<string, { net: number; count: number }> = {};
      payrollRows.forEach(r => { payMap[r.status] = { net: Number(r.netSum ?? 0), count: Number(r.cnt) }; });
      const totalPayNet   = Object.values(payMap).reduce((s, v) => s + v.net,   0);
      const totalPayCount = Object.values(payMap).reduce((s, v) => s + v.count, 0);

      return res.json({
        totalStaff:    Number(totalStaffRows[0]?.n ?? 0),
        onLeaveToday:  Number(onLeaveRows[0]?.n ?? 0),
        attendanceToday: attMap,
        byDepartment:  byDeptRows.map(r => ({ name: r.deptName ?? "Unassigned", count: Number(r.cnt) })),
        byRole:        byRoleRows.map(r => ({ role: r.role, count: Number(r.cnt) })),
        upcomingLeaves: upcomingLeaveRows,
        payroll: {
          month:        currentMonth,
          totalNet:     totalPayNet,
          paidNet:      payMap["paid"]?.net   ?? 0,
          pendingNet:   payMap["pending"]?.net ?? 0,
          paidCount:    payMap["paid"]?.count   ?? 0,
          totalCount:   totalPayCount,
          generated:    totalPayCount > 0,
        },
      });
    } catch (err) {
      req.log.error({ err }, "Failed to compute HR summary");
      return res.status(500).json({ error: "Failed to load HR summary" });
    }
  },
);

// ── Dashboard: academics summary ──────────────────────────────────────────────
router.get(
  "/admin/dashboard/academics-summary",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
      const today = new Date().toISOString().slice(0, 10);

      const [studentsPerClass, classesCount, subjectsCount, upcomingExams, totalStudents, totalSchedules] = await Promise.all([
        db.select({ classCode: studentsTable.classCode, cnt: count() })
          .from(studentsTable)
          .where(and(eq(studentsTable.status, "active"), eq(studentsTable.tenantId, tenantId)))
          .groupBy(studentsTable.classCode)
          .orderBy(asc(studentsTable.classCode)),

        db.select({ n: count() }).from(classesTable).where(and(eq(classesTable.active, true), eq(classesTable.tenantId, tenantId))),

        db.select({ n: count() }).from(subjectsTable).where(eq(subjectsTable.tenantId, tenantId)),

        db.select({
          id:           examSchedulesTable.id,
          classCode:    examSchedulesTable.classCode,
          subjectName:  examSchedulesTable.subjectName,
          subjectCode:  examSchedulesTable.subjectCode,
          examDate:     examSchedulesTable.examDate,
          sessionLabel: examSchedulesTable.sessionLabel,
          totalMarks:   examSchedulesTable.totalMarks,
          examTypeName: examTypesTable.name,
        })
        .from(examSchedulesTable)
        .leftJoin(examTypesTable, eq(examSchedulesTable.examTypeId, examTypesTable.id))
        .where(and(gte(examSchedulesTable.examDate, today), eq(examSchedulesTable.tenantId, tenantId)))
        .orderBy(asc(examSchedulesTable.examDate))
        .limit(9),

        db.select({ n: count() }).from(studentsTable).where(and(eq(studentsTable.status, "active"), eq(studentsTable.tenantId, tenantId))),
        db.select({ n: count() }).from(examSchedulesTable).where(eq(examSchedulesTable.tenantId, tenantId)),
      ]);

      return res.json({
        totalStudents:    Number(totalStudents[0]?.n  ?? 0),
        totalClasses:     Number(classesCount[0]?.n   ?? 0),
        totalSubjects:    Number(subjectsCount[0]?.n  ?? 0),
        totalSchedules:   Number(totalSchedules[0]?.n ?? 0),
        studentsPerClass: studentsPerClass.map(r => ({ classCode: r.classCode, count: Number(r.cnt) })),
        upcomingExams,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to compute academics summary");
      return res.status(500).json({ error: "Failed to load academics summary" });
    }
  },
);

// ── Applications status counts ───────────────────────────────────────────────
// Single grouped query so the Pipeline Board can show per-stage counts without
// firing one count request per stage. Registered before "/:referenceId" so the
// literal path is matched first.
router.get(
  "/admin/applications/status-counts",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;

      const rows = await db
        .select({
          status: applicationsTable.status,
          count: count(),
        })
        .from(applicationsTable)
        .where(eq(applicationsTable.tenantId, tenantId))
        .groupBy(applicationsTable.status);

      const counts: Record<string, number> = {};
      for (const r of rows) {
        if (r.status) counts[r.status] = Number(r.count);
      }
      return res.json({ counts });
    } catch (err) {
      req.log.error({ err }, "Failed to load application status counts");
      return res
        .status(500)
        .json({ error: "Failed to load application status counts" });
    }
  },
);

// ── Applications list ────────────────────────────────────────────────────────
router.get(
  "/admin/applications",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const status =
        typeof req.query.status === "string" ? req.query.status.trim() : "";
      const classApplying =
        typeof req.query.classApplying === "string"
          ? req.query.classApplying.trim()
          : "";
      const examCenter =
        typeof req.query.examCenter === "string"
          ? req.query.examCenter.trim()
          : "";
      const city =
        typeof req.query.city === "string" ? req.query.city.trim() : "";
      const session =
        typeof req.query.session === "string" ? req.query.session.trim() : "";
      const gender =
        typeof req.query.gender === "string" ? req.query.gender.trim().toLowerCase() : "";

      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(
        2000,
        Math.max(1, Number(req.query.pageSize) || 20),
      );
      const sortBy  = typeof req.query.sortBy  === "string" ? req.query.sortBy.trim()  : "";
      const sortDir = req.query.sortDir === "asc" ? "asc" : req.query.sortDir === "desc" ? "desc" : "asc";
      const sortCsv = typeof req.query.sort    === "string" ? req.query.sort.trim()    : "";
      const duplicatesOnly = req.query.duplicatesOnly === "true";

      const conditions = [];
      // Tenant isolation (fail-closed): a resolvable tenant is mandatory; the filter
      // is always applied so a request can never read across tenants.
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      conditions.push(eq(applicationsTable.tenantId, tenantId));
      if (q) {
        const like = `%${q}%`;
        conditions.push(
          or(
            ilike(applicationsTable.fullName, like),
            ilike(applicationsTable.referenceId, like),
            ilike(applicationsTable.rollNumber, like),
          ),
        );
      }
      // Accept comma-separated statuses for multi-status queries (e.g. enrollment tab).
      const statusList = status ? status.split(",").map(s => s.trim()).filter(Boolean) : [];
      if (statusList.length === 1) {
        conditions.push(eq(applicationsTable.status, statusList[0]));
      } else if (statusList.length > 1) {
        conditions.push(inArray(applicationsTable.status, statusList));
      }
      if (classApplying)
        conditions.push(eq(applicationsTable.classApplying, classApplying));
      if (examCenter)
        conditions.push(eq(applicationsTable.examCenter, examCenter));
      if (city) conditions.push(ilike(applicationsTable.city, city));
      if (session) conditions.push(eq(applicationsTable.session, session));
      if (gender) conditions.push(eq(applicationsTable.gender, gender));
      if (duplicatesOnly) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM applications a2
            WHERE a2.id != ${applicationsTable.id}
              AND a2.tenant_id IS NOT DISTINCT FROM ${applicationsTable.tenantId}
              AND a2.session = ${applicationsTable.session}
              AND (
                a2.student_email = ${applicationsTable.studentEmail}
                OR a2.student_mobile = ${applicationsTable.studentMobile}
                OR (${applicationsTable.studentBForm} IS NOT NULL
                    AND a2.student_b_form = ${applicationsTable.studentBForm})
              )
          )`,
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [{ total = 0 } = { total: 0 }] = await db
        .select({ total: count() })
        .from(applicationsTable)
        .where(where);

      const rows = await db
        .select({
          referenceId: applicationsTable.referenceId,
          fullName: applicationsTable.fullName,
          gender: applicationsTable.gender,
          fatherName: applicationsTable.fatherName,
          classApplying: applicationsTable.classApplying,
          session: applicationsTable.session,
          examCenter: applicationsTable.examCenter,
          id: applicationsTable.id,
          city: applicationsTable.city,
          status: applicationsTable.status,
          source: applicationsTable.source,
          rollNumber: applicationsTable.rollNumber,
          testDate: applicationsTable.testDate,
          guardianMobile: applicationsTable.guardianMobile,
          previousMarks: applicationsTable.previousMarks,
          resultMarks: applicationsTable.resultMarks,
          photoFilename: applicationsTable.photoFilename,
          presentAddress: applicationsTable.presentAddress,
          testVenue: applicationsTable.testVenue,
          testCenterAddress: applicationsTable.testCenterAddress,
          testFocalPerson: applicationsTable.testFocalPerson,
          feeStatus: applicationsTable.feeStatus,
          feeBankRef: applicationsTable.feeBankRef,
          feeReceiptUrl: applicationsTable.feeReceiptUrl,
          interviewDate: applicationsTable.interviewDate,
          // Effective interview venue: prefer the explicit interview venue,
          // then the linked interview-venue centre, then the entry-test centre
          // (by id or free-text exam centre). This keeps the Interview grid's
          // Venue column from being blank whenever any centre is on record.
          interviewVenue: sql<string | null>`COALESCE(
            NULLIF(${applicationsTable.interviewVenue}, ''),
            (SELECT name FROM test_centres WHERE id = ${applicationsTable.interviewVenueId} AND tenant_id IS NOT DISTINCT FROM ${applicationsTable.tenantId}),
            (SELECT name FROM test_centres WHERE id = ${applicationsTable.testCentreId} AND tenant_id IS NOT DISTINCT FROM ${applicationsTable.tenantId}),
            NULLIF(${applicationsTable.examCenter}, '')
          )`,
          interviewVenueId: applicationsTable.interviewVenueId,
          testCentreId: applicationsTable.testCentreId,
          interviewMarks: applicationsTable.interviewMarks,
          interviewedBy: applicationsTable.interviewedBy,
          meritScore: applicationsTable.meritScore,
          admissionFeeStatus: applicationsTable.admissionFeeStatus,
          docVerificationStatus: applicationsTable.docVerificationStatus,
          studentEmail: applicationsTable.studentEmail,
          studentMobile: applicationsTable.studentMobile,
          studentBForm: applicationsTable.studentBForm,
          createdAt: applicationsTable.createdAt,
          latestEventDescription: sql<string | null>`(SELECT description FROM application_events WHERE application_id = ${applicationsTable.id} ORDER BY occurred_at DESC LIMIT 1)`,
          // Duplicate detection: other applications in the same tenant+session sharing
          // student email, mobile, or B-form. Parent fields intentionally excluded.
          duplicateRefs: sql<string[]>`COALESCE((
            SELECT json_agg(a2.reference_id)
            FROM applications a2
            WHERE a2.id != ${applicationsTable.id}
              AND a2.tenant_id IS NOT DISTINCT FROM ${applicationsTable.tenantId}
              AND a2.session = ${applicationsTable.session}
              AND (
                a2.student_email = ${applicationsTable.studentEmail}
                OR a2.student_mobile = ${applicationsTable.studentMobile}
                OR (${applicationsTable.studentBForm} IS NOT NULL
                    AND a2.student_b_form = ${applicationsTable.studentBForm})
              )
          ), '[]'::json)`,
          // Used by Bulk Enroll dialog to show section pre-assignment badge.
          sectionAllocId: sql<string | null>`(SELECT id FROM section_allocations WHERE application_id = ${applicationsTable.id} LIMIT 1)`,
          sectionAllocSectionId: sql<string | null>`(SELECT section_id FROM section_allocations WHERE application_id = ${applicationsTable.id} LIMIT 1)`,
          // Authoritative enrolled indicator: a student record for this application.
          // Tenant-scoped join so a record from another tenant can never leak here.
          studentId: studentsTable.id,
          applicantId: studentsTable.applicantId,
        })
        .from(applicationsTable)
        .leftJoin(
          studentsTable,
          and(
            eq(studentsTable.applicationId, applicationsTable.id),
            eq(studentsTable.tenantId, tenantId),
          ),
        )
        .where(where)
        .orderBy(...((): ReturnType<typeof asc>[] => {
          function colClauses(key: string, dir: "asc" | "desc"): ReturnType<typeof asc>[] {
            const fn = dir === "desc" ? desc : asc;
            switch (key) {
              case "referenceId":  return [fn(applicationsTable.referenceId)];
              case "name":         return [fn(applicationsTable.fullName)];
              case "fatherName":   return [fn(applicationsTable.fatherName)];
              case "class":        return [fn(applicationsTable.classApplying)];
              case "createdAt":    return [fn(applicationsTable.createdAt)];
              case "city":         return [fn(applicationsTable.city)];
              case "feeStatus":    return [fn(applicationsTable.feeStatus)];
              case "status":       return [fn(applicationsTable.status)];
              default:             return [];
            }
          }
          if (sortCsv) {
            const clauses = sortCsv.split(",").flatMap(s => {
              const [k, d] = s.trim().split(":");
              return colClauses(k?.trim() ?? "", d === "desc" ? "desc" : "asc");
            });
            return clauses.length ? clauses : [desc(applicationsTable.id)];
          }
          const single = colClauses(sortBy, sortDir as "asc" | "desc");
          return single.length ? single : [desc(applicationsTable.id)];
        })())
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return res.json({
        items: rows.map((r) => ({
          id: r.id,
          referenceId: r.referenceId,
          fullName: r.fullName,
          gender: r.gender ?? null,
          fatherName: r.fatherName,
          classApplying: r.classApplying,
          session: r.session,
          examCenter: r.examCenter,
          city: r.city,
          status: r.status,
          source: r.source,
          rollNumber: r.rollNumber,
          testDate: r.testDate ? r.testDate.toISOString() : null,
          guardianMobile: r.guardianMobile,
          previousMarks: r.previousMarks,
          resultMarks: r.resultMarks,
          photoFilename: resolveUrl(r.photoFilename) ?? null,
          presentAddress: r.presentAddress ?? null,
          testVenue: r.testVenue ?? null,
          testCenterAddress: r.testCenterAddress ?? null,
          testFocalPerson: r.testFocalPerson ?? null,
          feeStatus: r.feeStatus,
          feeBankRef: r.feeBankRef ?? null,
          feeReceiptUrl: r.feeReceiptUrl ?? null,
          paymentMethod: (r as any).paymentMethod ?? null,
          interviewDate: r.interviewDate ? r.interviewDate.toISOString() : null,
          interviewVenue: r.interviewVenue ?? null,
          interviewVenueId: r.interviewVenueId ?? null,
          testCentreId: r.testCentreId ?? null,
          interviewMarks: r.interviewMarks,
          interviewedBy: r.interviewedBy ?? null,
          meritScore: r.meritScore,
          admissionFeeStatus: r.admissionFeeStatus ?? null,
          createdAt: r.createdAt.toISOString(),
          latestEventDescription: r.latestEventDescription ?? null,
          sectionAllocId: r.sectionAllocId ?? null,
          sectionAllocSectionId: r.sectionAllocSectionId ?? null,
          applicantId: r.applicantId ?? null,
          // A student record exists (authoritative) OR status already reads enrolled.
          isEnrolled: r.studentId != null || r.status === "enrolled",
          studentEmail: r.studentEmail ?? null,
          studentMobile: r.studentMobile ?? null,
          studentBForm: r.studentBForm ?? null,
          duplicateRefs: Array.isArray(r.duplicateRefs) ? (r.duplicateRefs as string[]) : [],
        })),
        total: Number(total),
        page,
        pageSize,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to list admin applications");
      return res.status(500).json({ error: "Failed to load applications" });
    }
  },
);

// Build the full detail payload (record + ordered timeline) for an application id.
async function serializeApplicationDetail(
  app: typeof applicationsTable.$inferSelect,
) {
  const [events, sectionAllocRow] = await Promise.all([
    db
      .select()
      .from(applicationEventsTable)
      .where(eq(applicationEventsTable.applicationId, app.id))
      .orderBy(desc(applicationEventsTable.occurredAt)),
    db
      .select({ sectionId: sectionAllocationsTable.sectionId })
      .from(sectionAllocationsTable)
      .where(eq(sectionAllocationsTable.applicationId, app.id))
      .limit(1),
  ]);

  return {
    referenceId: app.referenceId,
    session: app.session,
    classApplying: app.classApplying,
    previousMarks: app.previousMarks,
    fullName: app.fullName,
    gender: app.gender ?? null,
    dateOfBirth: app.dateOfBirth,
    bloodGroup: app.bloodGroup,
    religion: app.religion,
    photoFilename: resolveUrl(app.photoFilename),
    studentMobile: app.studentMobile,
    studentEmail: app.studentEmail,
    presentAddress: app.presentAddress,
    state: app.state,
    city: app.city,
    examCenter: app.examCenter,
    guardianName: app.guardianName,
    relation: app.relation,
    fatherName: app.fatherName,
    occupation: app.occupation,
    guardianMobile: app.guardianMobile,
    parentCnic: app.parentCnic,
    status: app.status,
    rollNumber: app.rollNumber,
    testDate: app.testDate ? app.testDate.toISOString() : null,
    testCentreId: app.testCentreId ?? null,
    testVenue: app.testVenue ?? null,
    testCenterAddress: app.testCenterAddress ?? null,
    resultMarks: app.resultMarks,
    interviewDate: app.interviewDate ? app.interviewDate.toISOString() : null,
    interviewVenueId: app.interviewVenueId ?? null,
    interviewVenue: app.interviewVenue ?? null,
    interviewMarks: app.interviewMarks,
    interviewedBy: app.interviewedBy ?? null,
    meritScore: app.meritScore,
    feeStatus: app.feeStatus,
    feeBankRef: app.feeBankRef,
    feeReceiptUrl: app.feeReceiptUrl ?? null,
    feePaidAmount: app.feePaidAmount ?? null,
    paymentMethod: (app as any).paymentMethod ?? null,
    feeSubmittedAt: app.feeSubmittedAt ? app.feeSubmittedAt.toISOString() : null,
    feeConfirmedAt: app.feeConfirmedAt ? app.feeConfirmedAt.toISOString() : null,
    admissionFeeStatus: app.admissionFeeStatus,
    admissionFeeBankRef: app.admissionFeeBankRef,
    admissionFeeConfirmedAt: app.admissionFeeConfirmedAt ? app.admissionFeeConfirmedAt.toISOString() : null,
    admissionFeeVerifiedById: app.admissionFeeVerifiedById ?? null,
    admissionFeeVerifiedByName: app.admissionFeeVerifiedByName ?? null,
    admissionFeeActionAt: app.admissionFeeActionAt ? app.admissionFeeActionAt.toISOString() : null,
    admissionFeeRejectionReason: app.admissionFeeRejectionReason ?? null,
    admissionFeeVerifiedAmount: app.admissionFeeVerifiedAmount ?? null,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt ? app.updatedAt.toISOString() : null,
    sectionAllocSectionId: sectionAllocRow[0]?.sectionId ?? null,
    events: events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      title: e.title,
      description: e.description,
      occurredAt: e.occurredAt.toISOString(),
    })),
  };
}

// Human-readable labels for lifecycle statuses (kept in sync with the public tracker).
const STATUS_LABELS: Record<string, string> = {
  received: "Application Received",
  under_review: "Under Review",
  pending_verification: "Pending Verification",
  verified: "Documents Verified",
  test_scheduled: "Entry Test Scheduled",
  test_taken: "Entry Test Conducted",
  interview_scheduled: "Interview Scheduled",
  interview_taken: "Interview Completed",
  result_announced: "Result Announced",
  admitted: "Qualified",
  rejected: "Not Selected",
  on_hold: "On Hold / Waitlisted",
  enrolled: "Enrolled",
  cancelled_by_student: "Cancelled by Student",
  rejected_by_admission: "Rejected by Admission",
};

// ── Status transition guard ───────────────────────────────────────────────────

/**
 * Strict sequential transition policy. Each entry lists only the immediately
 * next valid status(es) in the pipeline. Any other move — backward jumps,
 * stage skips, or exiting terminal states — requires force=true.
 *
 * Notable design choices:
 * - `test_scheduled` is absent from all early-stage allowed lists: it must be
 *   set via the schedule endpoint (which assigns date + roll number + centre).
 * - `rejected` and `on_hold` are only allowed without force from post-interview
 *   stages, matching the canonical pipeline escape points.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  received:             ["under_review"],
  under_review:         ["pending_verification"],
  pending_verification: ["verified"],
  verified:             [],                        // → test_scheduled requires force (schedule workflow)
  test_scheduled:       ["test_taken"],
  test_taken:           ["interview_scheduled"],
  interview_scheduled:  ["interview_taken"],
  interview_taken:      ["result_announced", "admitted", "on_hold", "rejected"],
  result_announced:     ["admitted", "on_hold", "rejected"],
  admitted:             ["enrolled", "cancelled_by_student", "rejected_by_admission"],
  on_hold:              ["admitted", "rejected", "cancelled_by_student", "rejected_by_admission"],
  cancelled_by_student:  [],
  rejected_by_admission: [],
  enrolled:             [],
  rejected:             [],
};

/**
 * Returns a human-readable rejection reason, or null if the transition is
 * allowed. Pass force=true to bypass the policy check.
 *
 * Data prerequisites (marks presence) are soft warnings — they can be
 * bypassed with force=true. Marks may be recorded later or via a separate
 * workflow. They may also be satisfied by marks included in the same request
 * via the `proposed` argument.
 */
function checkStatusTransition(
  app: typeof applicationsTable.$inferSelect,
  toStatus: string,
  force: boolean,
  proposed?: { resultMarks?: number; interviewMarks?: number },
): string | null {
  // 1. Soft data prerequisites — bypassable with force=true.
  if (!force) {
    if (toStatus === "test_taken") {
      const hasMarks = app.resultMarks != null || proposed?.resultMarks != null;
      if (!hasMarks) {
        return "Entry test marks have not been recorded yet. Include resultMarks in the request, record marks separately via PATCH /marks, or pass force=true to set the status without marks.";
      }
    }
    if (toStatus === "interview_taken") {
      const hasMarks = app.interviewMarks != null || proposed?.interviewMarks != null;
      if (!hasMarks) {
        return "Interview marks have not been recorded yet. Include interviewMarks in the request, record marks separately via PATCH /marks, or pass force=true to set the status without marks.";
      }
    }
  }

  // No-op: already at target status.
  if (app.status === toStatus) return null;

  // 2. Transition policy — skippable with force=true.
  if (!force) {
    const allowed = ALLOWED_TRANSITIONS[app.status] ?? [];
    if (!allowed.includes(toStatus)) {
      const fromLabel = STATUS_LABELS[app.status] ?? app.status;
      const toLabel   = STATUS_LABELS[toStatus]   ?? toStatus;
      return `Cannot move to "${toLabel}" from "${fromLabel}". Pass force=true to override.`;
    }
  }

  return null;
}

// ── Applications: distinct city values for filter dropdown ───────────────────
router.get(
  "/admin/applications/cities",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const rows = await db
        .selectDistinct({ city: applicationsTable.city })
        .from(applicationsTable)
        .where(
          and(
            eq(applicationsTable.tenantId, tenantId),
            isNotNull(applicationsTable.city),
            ne(applicationsTable.city, ""),
          ),
        )
        .orderBy(asc(applicationsTable.city));
      return res.json(rows.map((r) => r.city).filter((c): c is string => c != null));
    } catch (err) {
      req.log.error({ err }, "Failed to get application cities");
      return res.status(500).json({ error: "Failed to get cities" });
    }
  },
);

// ── Document verification list ────────────────────────────────────────────────
router.get(
  "/admin/applications/document-verification",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const classApplying = typeof req.query.classApplying === "string" ? req.query.classApplying.trim() : "";
      const verificationFilter = typeof req.query.verificationStatus === "string" ? req.query.verificationStatus.trim() : "";
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

      const conditions: any[] = [];
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      conditions.push(eq(applicationsTable.tenantId, tenantId));

      if (classApplying) conditions.push(eq(applicationsTable.classApplying, classApplying));

      if (q) {
        const like = `%${q}%`;
        conditions.push(
          or(
            ilike(applicationsTable.fullName, like),
            ilike(applicationsTable.referenceId, like),
          ),
        );
      }

      const validStatuses = ["not_verified", "partial_verified", "verified"];
      if (validStatuses.includes(verificationFilter)) {
        conditions.push(eq(applicationsTable.docVerificationStatus, verificationFilter));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [counts] = await db
        .select({
          total: count(),
          verifiedCount: sql<number>`COUNT(*) FILTER (WHERE ${applicationsTable.docVerificationStatus} = 'verified')::int`,
          partialCount: sql<number>`COUNT(*) FILTER (WHERE ${applicationsTable.docVerificationStatus} = 'partial_verified')::int`,
        })
        .from(applicationsTable)
        .where(where);

      const total = Number(counts?.total ?? 0);
      const verifiedCount = Number(counts?.verifiedCount ?? 0);
      const partialCount = Number(counts?.partialCount ?? 0);
      const pendingCount = total - verifiedCount - partialCount;

      const rows = await db
        .select({
          referenceId: applicationsTable.referenceId,
          applicantId: studentsTable.applicantId,
          candidateName: applicationsTable.fullName,
          fatherName: applicationsTable.fatherName,
          classApplying: applicationsTable.classApplying,
          lastClass: applicationsTable.lastClass,
          yearOfLastResult: applicationsTable.yearOfLastResult,
          academicScore: applicationsTable.previousMarks,
          docVerificationStatus: applicationsTable.docVerificationStatus,
          status: applicationsTable.status,
          createdAt: applicationsTable.createdAt,
          bFormUrl: sql<string | null>`(SELECT d.stored_name FROM application_documents d WHERE d.application_id = ${applicationsTable.id} AND (d.doc_type ILIKE '%b_form%' OR d.doc_type ILIKE '%bform%' OR d.doc_type ILIKE '%b-form%' OR d.doc_type ILIKE '%birth%') ORDER BY d.uploaded_at DESC LIMIT 1)`,
          degreeUrl: sql<string | null>`(SELECT d.stored_name FROM application_documents d WHERE d.application_id = ${applicationsTable.id} AND (d.doc_type ILIKE '%result%' OR d.doc_type ILIKE '%marksheet%' OR d.doc_type ILIKE '%class_result%' OR d.doc_type ILIKE '%degree%' OR d.doc_type ILIKE '%cert%') ORDER BY d.uploaded_at DESC LIMIT 1)`,
        })
        .from(applicationsTable)
        .leftJoin(
          studentsTable,
          and(
            eq(studentsTable.applicationId, applicationsTable.id),
            eq(studentsTable.tenantId, tenantId),
          ),
        )
        .where(where)
        .orderBy(asc(applicationsTable.createdAt))
        .offset((page - 1) * pageSize)
        .limit(pageSize);

      const { resolvePrivateDownloadUrl } = await import("../lib/storage");
      return res.json({
        data: await Promise.all(rows.map(async (r) => ({
          ...r,
          applicantId: r.applicantId ?? null,
          lastClass: r.lastClass ?? null,
          yearOfLastResult: r.yearOfLastResult ?? null,
          createdAt: r.createdAt.toISOString(),
          bFormUrl: await resolvePrivateDownloadUrl(r.bFormUrl, "", 300),
          degreeUrl: await resolvePrivateDownloadUrl(r.degreeUrl, "", 300),
        }))),
        total,
        verifiedCount,
        partialCount,
        pendingCount,
        page,
        pageSize,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to load document verification list");
      return res.status(500).json({ error: "Failed to load document verification list" });
    }
  },
);

// ── Fee verification list ─────────────────────────────────────────────────────
router.get(
  "/admin/applications/fee-verification",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const q              = typeof req.query.q              === "string" ? req.query.q.trim()              : "";
      const classApplying  = typeof req.query.classApplying  === "string" ? req.query.classApplying.trim()  : "";
      const feeType        = typeof req.query.feeType        === "string" ? req.query.feeType.trim()        : "all";
      const feeStatusFilter= typeof req.query.feeStatus      === "string" ? req.query.feeStatus.trim()      : "all";
      const page           = Math.max(1, Number(req.query.page) || 1);
      const pageSize       = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

      const tenantId = requireTenant(req, res);
      if (!tenantId) return;

      const baseConditions: any[] = [];
      baseConditions.push(eq(applicationsTable.tenantId, tenantId));
      if (classApplying) baseConditions.push(eq(applicationsTable.classApplying, classApplying));
      if (q) {
        const like = `%${q}%`;
        baseConditions.push(
          or(
            ilike(applicationsTable.fullName, like),
            ilike(applicationsTable.referenceId, like),
          ),
        );
      }

      const feeStatusConditions: any[] = [];
      if (feeStatusFilter !== "all") {
        if (feeType === "admission") {
          feeStatusConditions.push(eq(applicationsTable.admissionFeeStatus, feeStatusFilter));
        } else if (feeType === "app") {
          feeStatusConditions.push(eq(applicationsTable.feeStatus, feeStatusFilter));
        } else {
          feeStatusConditions.push(
            or(
              eq(applicationsTable.feeStatus, feeStatusFilter),
              eq(applicationsTable.admissionFeeStatus, feeStatusFilter),
            ),
          );
        }
      }

      const where = and(...baseConditions, ...feeStatusConditions) ?? undefined;

      const [counts] = await db
        .select({
          total: count(),
          appFeePending:    sql<number>`COUNT(*) FILTER (WHERE COALESCE(${applicationsTable.feeStatus}, 'pending') = 'pending')::int`,
          appFeeSubmitted:  sql<number>`COUNT(*) FILTER (WHERE ${applicationsTable.feeStatus} = 'submitted')::int`,
          appFeePaid:       sql<number>`COUNT(*) FILTER (WHERE ${applicationsTable.feeStatus} = 'paid')::int`,
          admFeePending:    sql<number>`COUNT(*) FILTER (WHERE COALESCE(${applicationsTable.admissionFeeStatus}, 'pending') = 'pending')::int`,
          admFeeSubmitted:  sql<number>`COUNT(*) FILTER (WHERE ${applicationsTable.admissionFeeStatus} = 'submitted')::int`,
          admFeePaid:       sql<number>`COUNT(*) FILTER (WHERE ${applicationsTable.admissionFeeStatus} = 'paid')::int`,
        })
        .from(applicationsTable)
        .where(and(...baseConditions) ?? undefined);

      const rows = await db
        .select({
          referenceId:           applicationsTable.referenceId,
          applicantId:              studentsTable.applicantId,
          candidateName:         applicationsTable.fullName,
          fatherName:            applicationsTable.fatherName,
          classApplying:         applicationsTable.classApplying,
          status:                applicationsTable.status,
          feeStatus:             applicationsTable.feeStatus,
          feeBankRef:            applicationsTable.feeBankRef,
          feeSubmittedAt:        applicationsTable.feeSubmittedAt,
          feeConfirmedAt:        applicationsTable.feeConfirmedAt,
          admissionFeeStatus:         applicationsTable.admissionFeeStatus,
          admissionFeeBankRef:        applicationsTable.admissionFeeBankRef,
          admissionFeeConfirmedAt:    applicationsTable.admissionFeeConfirmedAt,
          admissionFeeVerifiedById:   applicationsTable.admissionFeeVerifiedById,
          admissionFeeVerifiedByName: applicationsTable.admissionFeeVerifiedByName,
          admissionFeeActionAt:       applicationsTable.admissionFeeActionAt,
          admissionFeeRejectionReason: applicationsTable.admissionFeeRejectionReason,
          admissionFeeVerifiedAmount: applicationsTable.admissionFeeVerifiedAmount,
          feeReceiptUrl:              applicationsTable.feeReceiptUrl,
          createdAt:                  applicationsTable.createdAt,
          studentId:                 studentsTable.id,
        })
        .from(applicationsTable)
        .leftJoin(
          studentsTable,
          and(
            eq(studentsTable.applicationId, applicationsTable.id),
            eq(studentsTable.tenantId, tenantId),
          ),
        )
        .where(where)
        .orderBy(asc(applicationsTable.createdAt))
        .offset((page - 1) * pageSize)
        .limit(pageSize);

      return res.json({
        data: rows.map((r) => ({
          ...r,
          applicantId:              r.applicantId ?? null,
          feeBankRef:            r.feeBankRef ?? null,
          feeSubmittedAt:        r.feeSubmittedAt ? r.feeSubmittedAt.toISOString() : null,
          feeConfirmedAt:        r.feeConfirmedAt ? r.feeConfirmedAt.toISOString() : null,
          admissionFeeBankRef:        r.admissionFeeBankRef ?? null,
          admissionFeeConfirmedAt:    r.admissionFeeConfirmedAt ? r.admissionFeeConfirmedAt.toISOString() : null,
          admissionFeeVerifiedById:   r.admissionFeeVerifiedById ?? null,
          admissionFeeVerifiedByName: r.admissionFeeVerifiedByName ?? null,
          admissionFeeActionAt:       r.admissionFeeActionAt ? r.admissionFeeActionAt.toISOString() : null,
          admissionFeeRejectionReason: r.admissionFeeRejectionReason ?? null,
          admissionFeeVerifiedAmount: r.admissionFeeVerifiedAmount ?? null,
          feeReceiptUrl:              r.feeReceiptUrl ?? null,
          createdAt:                  r.createdAt.toISOString(),
          isEnrolled:                r.studentId != null || r.status === "enrolled",
        })),
        total:             Number(counts?.total ?? 0),
        appFeePending:     Number(counts?.appFeePending ?? 0),
        appFeeSubmitted:   Number(counts?.appFeeSubmitted ?? 0),
        appFeePaid:        Number(counts?.appFeePaid ?? 0),
        admFeePending:     Number(counts?.admFeePending ?? 0),
        admFeeSubmitted:   Number(counts?.admFeeSubmitted ?? 0),
        admFeePaid:        Number(counts?.admFeePaid ?? 0),
        page,
        pageSize,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to load fee verification list");
      return res.status(500).json({ error: "Failed to load fee verification list" });
    }
  },
);

// ── Set doc verification status (3-way) ──────────────────────────────────────
router.patch(
  "/admin/applications/:referenceId/verify-docs",
  requireRole("admissions", "draft"),
  async (req: Request, res: Response) => {
    const referenceId = String(req.params.referenceId);
    const { docVerificationStatus } = req.body as { docVerificationStatus?: string };
    const valid = ["not_verified", "partial_verified", "verified"];
    if (!docVerificationStatus || !valid.includes(docVerificationStatus)) {
      return res.status(400).json({ error: "docVerificationStatus must be one of: not_verified, partial_verified, verified" });
    }
    try {
      const [app] = await db
        .select({ status: applicationsTable.status })
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);
      if (!app) {
        return res.status(404).json({ error: "Application not found" });
      }
      if (app.status === "enrolled") {
        return res.status(409).json({ error: "Applicant is enrolled — record is locked" });
      }
      await db
        .update(applicationsTable)
        .set({ docVerificationStatus })
        .where(and(appByRef(req, referenceId), ne(applicationsTable.status, "enrolled")));
      return res.json({ success: true, docVerificationStatus });
    } catch (err) {
      req.log.error({ err }, "Doc verify status update failed");
      return res.status(500).json({ error: "Failed to update document verification status" });
    }
  },
);

// ── Shared academic score validation ──────────────────────────────────────────
// Returns null when valid, or an error message string when invalid.
// Blank/empty string is allowed (clears the score). Values must be 0–100.
function validateAcademicScoreField(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const stripped = trimmed.replace(/%$/, "");
  if (!/^-?\d+(\.\d+)?$/.test(stripped)) {
    return "Academic score must be a number between 0 and 100";
  }
  const n = Number(stripped);
  if (n < 0 || n > 100) {
    return "Academic score must be a number between 0 and 100";
  }
  return null;
}

// ── Update academic score (previousMarks) ─────────────────────────────────────
router.patch(
  "/admin/applications/:referenceId/academic-score",
  requireAdmin,
  async (req: Request, res: Response) => {
    const referenceId = String(req.params.referenceId);
    const { academicScore } = req.body as { academicScore?: string };
    if (typeof academicScore !== "string") {
      return res.status(400).json({ error: "academicScore must be a string" });
    }
    const scoreErr = validateAcademicScoreField(academicScore);
    if (scoreErr) {
      return res.status(400).json({ error: scoreErr });
    }
    try {
      const [app] = await db
        .select({ id: applicationsTable.id, status: applicationsTable.status, docVerificationStatus: applicationsTable.docVerificationStatus })
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);
      if (!app) {
        return res.status(404).json({ error: "Application not found" });
      }
      if (app.status === "enrolled") {
        return res.status(409).json({ error: "Applicant is enrolled — record is locked" });
      }
      const alreadyVerified = app.docVerificationStatus === "verified";
      const updateSet: Partial<typeof applicationsTable.$inferInsert> = {
        previousMarks: academicScore.trim(),
        ...(!alreadyVerified ? { docVerificationStatus: "verified" } : {}),
      };
      await db.transaction(async (tx) => {
        await tx
          .update(applicationsTable)
          .set(updateSet)
          .where(and(appByRef(req, referenceId), ne(applicationsTable.status, "enrolled")));
        if (!alreadyVerified) {
          await tx.insert(applicationEventsTable).values({
            applicationId: (app as any).id,
            eventType: "doc_verified",
            title: "Documents Verified",
            description: "Academic marks recorded — documents automatically verified.",
          });
        }
      });
      void syncMeritScore((app as any).id);
      return res.json({ success: true, academicScore: academicScore.trim() });
    } catch (err) {
      req.log.error({ err }, "Academic score update failed");
      return res.status(500).json({ error: "Failed to update academic score" });
    }
  },
);

// ── Bulk update doc verification fields ──────────────────────────────────────
router.patch(
  "/admin/applications/bulk-update-doc-verification",
  requireAdmin,
  async (req: Request, res: Response) => {
    const parsed = BulkUpdateDocVerificationBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    }
    const { entries } = parsed.data;
    if (entries.length === 0) {
      return res.status(400).json({ error: "entries must be a non-empty array" });
    }
    const VALID_DOC_STATUS = ["not_verified", "partial_verified", "verified"];
    const results: { referenceId: string; success: boolean; error?: string }[] = [];
    let updated = 0;
    let failed = 0;
    for (const entry of entries as any[]) {
      if (!entry?.referenceId || typeof entry.referenceId !== "string") continue;
      const refId = entry.referenceId.toUpperCase().trim();
      const updates: Partial<typeof applicationsTable.$inferInsert> = {};
      if (typeof entry.lastClass === "string" || entry.lastClass === null)
        updates.lastClass = entry.lastClass ?? null;
      if (typeof entry.yearOfLastResult === "string" || entry.yearOfLastResult === null)
        updates.yearOfLastResult = entry.yearOfLastResult ?? null;
      if (typeof entry.academicScore === "string") {
        const scoreErr = validateAcademicScoreField(entry.academicScore);
        if (scoreErr) {
          results.push({ referenceId: refId, success: false, error: scoreErr });
          failed++;
          continue;
        }
        updates.previousMarks = entry.academicScore;
        // Auto-verify documents when academic marks are provided (unless caller is explicitly setting a status)
        if (!(typeof entry.docVerificationStatus === "string" && VALID_DOC_STATUS.includes(entry.docVerificationStatus))) {
          updates.docVerificationStatus = "verified";
        }
      }
      if (
        typeof entry.docVerificationStatus === "string" &&
        VALID_DOC_STATUS.includes(entry.docVerificationStatus)
      )
        updates.docVerificationStatus = entry.docVerificationStatus;
      if (Object.keys(updates).length === 0) {
        results.push({ referenceId: refId, success: false, error: "no valid fields to update" });
        failed++;
        continue;
      }
      try {
        const [pre] = await db.select({ id: applicationsTable.id, status: applicationsTable.status }).from(applicationsTable).where(appByRef(req, refId)).limit(1);
        if (!pre) {
          results.push({ referenceId: refId, success: false, error: "not found" });
          failed++;
          continue;
        }
        if (pre.status === "enrolled") {
          results.push({ referenceId: refId, success: false, error: "Applicant is enrolled — record is locked" });
          failed++;
          continue;
        }
        await db
          .update(applicationsTable)
          .set(updates)
          .where(and(appByRef(req, refId), ne(applicationsTable.status, "enrolled")));
        if (updates.previousMarks !== undefined) void syncMeritScore(pre.id);
        results.push({ referenceId: refId, success: true });
        updated++;
      } catch (err: any) {
        req.log.error({ err, refId }, "Bulk doc verification update failed for row");
        results.push({ referenceId: refId, success: false, error: err?.message ?? "update failed" });
        failed++;
      }
    }
    const lockedCount = results.filter(r => !r.success && r.error === "Applicant is enrolled — record is locked").length;
    if (lockedCount > 0 && updated === 0) {
      return res.status(409).json({ error: "All applicants are enrolled — records are locked", updated, failed, results });
    }
    return res.json({ updated, failed, results });
  },
);

// ── Bulk update entry test fields ─────────────────────────────────────────────
router.patch(
  "/admin/applications/bulk-update-entry-test",
  requireAdmin,
  async (req: Request, res: Response) => {
    const parsed = BulkUpdateEntryTestBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    }
    const { entries } = parsed.data;
    if (entries.length === 0) {
      return res.status(400).json({ error: "entries must be a non-empty array" });
    }
    const VALID_ET_STATUS = ["test_scheduled", "test_taken"];
    const results: { referenceId: string; success: boolean; error?: string }[] = [];
    let updated = 0;
    let failed = 0;
    for (const entry of entries as any[]) {
      if (!entry?.referenceId || typeof entry.referenceId !== "string") continue;
      const refId = entry.referenceId.toUpperCase().trim();
      const updates: Partial<typeof applicationsTable.$inferInsert> = {};
      if (typeof entry.status === "string" && VALID_ET_STATUS.includes(entry.status))
        updates.status = entry.status;
      if (typeof entry.testDate === "string" && entry.testDate)
        updates.testDate = new Date(entry.testDate);
      else if (entry.testDate === null) updates.testDate = null;
      if (typeof entry.examCenter === "string") updates.examCenter = entry.examCenter;
      if (
        typeof entry.resultMarks === "number" &&
        Number.isInteger(entry.resultMarks) &&
        entry.resultMarks >= 0 &&
        entry.resultMarks <= 100
      )
        updates.resultMarks = entry.resultMarks;
      if (Object.keys(updates).length === 0) {
        results.push({ referenceId: refId, success: false, error: "no valid fields to update" });
        failed++;
        continue;
      }
      try {
        const [pre] = await db.select({ id: applicationsTable.id, status: applicationsTable.status }).from(applicationsTable).where(appByRef(req, refId)).limit(1);
        if (!pre) {
          results.push({ referenceId: refId, success: false, error: "not found" });
          failed++;
          continue;
        }
        if (pre.status === "enrolled") {
          results.push({ referenceId: refId, success: false, error: "Applicant is enrolled — record is locked" });
          failed++;
          continue;
        }
        // Marks may only be recorded once the entry test has been taken. The
        // effective status is the one set in this same update (if any),
        // otherwise the applicant's current status.
        const BEFORE_TEST_TAKEN_ET = ["received", "under_review", "verified", "test_scheduled"];
        const effectiveStatus = updates.status ?? pre.status;
        if (updates.resultMarks !== undefined && BEFORE_TEST_TAKEN_ET.includes(effectiveStatus)) {
          results.push({ referenceId: refId, success: false, error: "Mark the test as Taken before recording marks" });
          failed++;
          continue;
        }
        await db
          .update(applicationsTable)
          .set(updates)
          .where(and(appByRef(req, refId), ne(applicationsTable.status, "enrolled")));
        if (updates.resultMarks !== undefined) void syncMeritScore(pre.id);
        results.push({ referenceId: refId, success: true });
        updated++;
      } catch (err: any) {
        req.log.error({ err, refId }, "Bulk entry test update failed for row");
        results.push({ referenceId: refId, success: false, error: err?.message ?? "update failed" });
        failed++;
      }
    }
    const lockedCount = results.filter(r => !r.success && r.error === "Applicant is enrolled — record is locked").length;
    if (lockedCount > 0 && updated === 0) {
      return res.status(409).json({ error: "All applicants are enrolled — records are locked", updated, failed, results });
    }
    return res.json({ updated, failed, results });
  },
);

// ── Bulk update interview metadata fields ─────────────────────────────────────
router.patch(
  "/admin/applications/bulk-update-interview",
  requireAdmin,
  async (req: Request, res: Response) => {
    const parsed = BulkUpdateInterviewBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    }
    const { entries } = parsed.data;
    if (entries.length === 0) {
      return res.status(400).json({ error: "entries must be a non-empty array" });
    }
    const INTERVIEW_MAX_MARKS = 30;
    const invalidMarks = (entries as any[]).filter(
      (e) =>
        e?.interviewMarks !== undefined &&
        e?.interviewMarks !== null &&
        (typeof e.interviewMarks !== "number" ||
          !Number.isInteger(e.interviewMarks) ||
          e.interviewMarks < 0 ||
          e.interviewMarks > INTERVIEW_MAX_MARKS),
    );
    if (invalidMarks.length > 0) {
      return res.status(400).json({
        error: `Interview marks must be whole numbers between 0 and ${INTERVIEW_MAX_MARKS}`,
        invalid: invalidMarks.map((e) => e.referenceId),
      });
    }
    const VALID_IV_STATUS = ["interview_scheduled", "interview_taken"];
    const results: { referenceId: string; success: boolean; error?: string }[] = [];
    let updated = 0;
    let failed = 0;
    for (const entry of entries as any[]) {
      if (!entry?.referenceId || typeof entry.referenceId !== "string") continue;
      const refId = entry.referenceId.toUpperCase().trim();
      const updates: Partial<typeof applicationsTable.$inferInsert> = {};
      if (typeof entry.status === "string" && VALID_IV_STATUS.includes(entry.status))
        updates.status = entry.status;
      if (typeof entry.interviewDate === "string" && entry.interviewDate)
        updates.interviewDate = new Date(entry.interviewDate);
      else if (entry.interviewDate === null) updates.interviewDate = null;
      if (typeof entry.interviewVenue === "string") updates.interviewVenue = entry.interviewVenue;
      if (typeof entry.interviewVenueId === "string" && entry.interviewVenueId) {
        updates.interviewVenueId = entry.interviewVenueId;
      } else if (entry.interviewVenueId === null) {
        updates.interviewVenueId = null;
      }
      if (typeof entry.interviewedBy === "string") updates.interviewedBy = entry.interviewedBy;
      else if (entry.interviewedBy === null) updates.interviewedBy = null;
      if (
        typeof entry.interviewMarks === "number" &&
        Number.isInteger(entry.interviewMarks) &&
        entry.interviewMarks >= 0 &&
        entry.interviewMarks <= INTERVIEW_MAX_MARKS
      )
        updates.interviewMarks = entry.interviewMarks;
      const VALID_IV_RESULT = ["pass", "fail", "pending"];
      if (typeof entry.interviewResult === "string" && VALID_IV_RESULT.includes(entry.interviewResult))
        updates.interviewResult = entry.interviewResult;
      else if (entry.interviewResult === null)
        updates.interviewResult = null;
      if (Object.keys(updates).length === 0) {
        results.push({ referenceId: refId, success: false, error: "no valid fields to update" });
        failed++;
        continue;
      }
      try {
        const [pre] = await db.select({ id: applicationsTable.id, status: applicationsTable.status }).from(applicationsTable).where(appByRef(req, refId)).limit(1);
        if (!pre) {
          results.push({ referenceId: refId, success: false, error: "not found" });
          failed++;
          continue;
        }
        if (pre.status === "enrolled") {
          results.push({ referenceId: refId, success: false, error: "Applicant is enrolled — record is locked" });
          failed++;
          continue;
        }
        // Auto-advance to interview_taken when interviewMarks provided and status is before that stage
        const BEFORE_INTERVIEW_TAKEN_IV = ["received", "under_review", "pending_verification", "verified", "test_scheduled", "test_taken", "interview_scheduled"];
        if (updates.interviewMarks !== undefined && !updates.status && BEFORE_INTERVIEW_TAKEN_IV.includes(pre.status)) {
          updates.status = "interview_taken";
        }
        await db
          .update(applicationsTable)
          .set(updates)
          .where(and(appByRef(req, refId), ne(applicationsTable.status, "enrolled")));
        if (updates.interviewMarks !== undefined) void syncMeritScore(pre.id);
        results.push({ referenceId: refId, success: true });
        updated++;
      } catch (err: any) {
        req.log.error({ err, refId }, "Bulk interview update failed for row");
        results.push({ referenceId: refId, success: false, error: err?.message ?? "update failed" });
        failed++;
      }
    }
    const lockedCount = results.filter(r => !r.success && r.error === "Applicant is enrolled — record is locked").length;
    if (lockedCount > 0 && updated === 0) {
      return res.status(409).json({ error: "All applicants are enrolled — records are locked", updated, failed, results });
    }
    return res.json({ updated, failed, results });
  },
);

// ── Application lookup by internal id (for JE drill-through links, where only
// the applications.id uuid — not the human referenceId — is stored as sourceRefId)
router.get(
  "/admin/applications/by-id/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tid = reqTenantId(req);
      if (!tid) return res.status(404).json({ error: "Not found" });
      const [app] = await db
        .select({ referenceId: applicationsTable.referenceId })
        .from(applicationsTable)
        .where(and(eq(applicationsTable.id, String(req.params.id)), eq(applicationsTable.tenantId, tid)))
        .limit(1);
      if (!app) return res.status(404).json({ error: "Not found" });
      return res.json({ referenceId: app.referenceId });
    } catch (err: unknown) {
      req.log.error({ err }, "Failed to look up application by id");
      return res.status(500).json({ error: "Failed to look up application" });
    }
  },
);

// ── Application detail ───────────────────────────────────────────────────────
router.get(
  "/admin/applications/:referenceId",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const referenceId = String(req.params.referenceId).toUpperCase().trim();

      const [app] = await db
        .select()
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);

      if (!app) {
        return res.status(404).json({ error: "Application not found" });
      }

      return res.json(await serializeApplicationDetail(app));
    } catch (err) {
      req.log.error({ err }, "Failed to load admin application detail");
      return res.status(500).json({ error: "Failed to load application" });
    }
  },
);

// ── Edit applicant personal / contact / address info ─────────────────────────
const AdminApplicationInfoUpdate = z.strictObject({
  fullName:       z.string().min(1).max(200).optional(),
  gender:         z.enum(["male", "female", "other"]).optional(),
  dateOfBirth:    z.string().optional(),
  bloodGroup:     z.string().max(10).optional(),
  religion:       z.string().max(100).optional(),
  studentMobile:  z.string().max(20).optional(),
  studentEmail:   z.string().max(200).optional(),
  classApplying:  z.string().max(50).optional(),
  previousMarks:  z.string().max(50).optional(),
  examCenter:     z.string().max(200).optional(),
  fatherName:     z.string().max(200).optional(),
  guardianName:   z.string().max(200).optional(),
  relation:       z.string().max(100).optional(),
  parentCnic:     z.string().max(20).optional(),
  guardianMobile: z.string().max(20).optional(),
  occupation:     z.string().max(200).optional(),
  presentAddress: z.string().max(500).optional(),
  city:           z.string().max(100).optional(),
  state:          z.string().max(100).optional(),
});
router.patch(
  "/admin/applications/:referenceId/info",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const parsed = AdminApplicationInfoUpdate.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid fields", issues: parsed.error.issues });
      }
      const referenceId = String(req.params.referenceId).toUpperCase().trim();
      const [app] = await db
        .select()
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);
      if (!app) return res.status(404).json({ error: "Application not found" });

      const updates: Partial<typeof applicationsTable.$inferInsert> = {};
      const d = parsed.data;
      if (d.fullName       !== undefined) updates.fullName       = d.fullName;
      if (d.gender         !== undefined) updates.gender         = d.gender;
      if (d.dateOfBirth    !== undefined) updates.dateOfBirth    = d.dateOfBirth;
      if (d.bloodGroup     !== undefined) updates.bloodGroup     = d.bloodGroup;
      if (d.religion       !== undefined) updates.religion       = d.religion;
      if (d.studentMobile  !== undefined) updates.studentMobile  = d.studentMobile;
      if (d.studentEmail   !== undefined) updates.studentEmail   = d.studentEmail;
      if (d.classApplying  !== undefined) updates.classApplying  = d.classApplying;
      if (d.previousMarks  !== undefined) updates.previousMarks  = d.previousMarks;
      if (d.examCenter     !== undefined) updates.examCenter     = d.examCenter;
      if (d.fatherName     !== undefined) updates.fatherName     = d.fatherName;
      if (d.guardianName   !== undefined) updates.guardianName   = d.guardianName;
      if (d.relation       !== undefined) updates.relation       = d.relation;
      if (d.parentCnic     !== undefined) {
        updates.parentCnic     = d.parentCnic;
        updates.parentCnicLast4 = d.parentCnic.slice(-4);
      }
      if (d.guardianMobile !== undefined) updates.guardianMobile = d.guardianMobile;
      if (d.occupation     !== undefined) updates.occupation     = d.occupation;
      if (d.presentAddress !== undefined) updates.presentAddress = d.presentAddress;
      if (d.city           !== undefined) updates.city           = d.city;
      if (d.state          !== undefined) updates.state          = d.state;

      if (Object.keys(updates).length === 0) {
        return res.json(await serializeApplicationDetail(app));
      }
      const [updated] = await db
        .update(applicationsTable)
        .set(updates)
        .where(eq(applicationsTable.id, app.id))
        .returning();
      return res.json(await serializeApplicationDetail(updated));
    } catch (err) {
      req.log.error({ err }, "Failed to update application info");
      return res.status(500).json({ error: "Failed to update application" });
    }
  },
);

// ── Duplicate check for a single application ─────────────────────────────────
router.get(
  "/admin/applications/:referenceId/duplicates",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const referenceId = String(req.params.referenceId).toUpperCase().trim();
      const [app] = await db
        .select({
          id: applicationsTable.id,
          tenantId: applicationsTable.tenantId,
          session: applicationsTable.session,
          studentEmail: applicationsTable.studentEmail,
          studentMobile: applicationsTable.studentMobile,
          studentBForm: applicationsTable.studentBForm,
        })
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);

      if (!app) return res.status(404).json({ error: "Application not found" });

      const conditions = [
        app.studentEmail ? eq(applicationsTable.studentEmail, app.studentEmail) : null,
        eq(applicationsTable.studentMobile, app.studentMobile),
        app.studentBForm
          ? and(
              sql`${applicationsTable.studentBForm} IS NOT NULL`,
              eq(applicationsTable.studentBForm, app.studentBForm),
            )
          : null,
      ].filter(Boolean) as ReturnType<typeof eq>[];

      const duplicates = await db
        .select({
          referenceId: applicationsTable.referenceId,
          fullName: applicationsTable.fullName,
          studentEmail: applicationsTable.studentEmail,
          studentMobile: applicationsTable.studentMobile,
          studentBForm: applicationsTable.studentBForm,
        })
        .from(applicationsTable)
        .where(
          and(
            ne(applicationsTable.referenceId, referenceId),
            app.tenantId
              ? eq(applicationsTable.tenantId, app.tenantId)
              : sql`${applicationsTable.tenantId} IS NULL`,
            or(...conditions),
          ),
        );

      return res.json({
        duplicates: duplicates.map((d) => ({
          referenceId: d.referenceId,
          fullName: d.fullName,
          studentEmail: d.studentEmail ?? null,
          studentMobile: d.studentMobile,
          studentBForm: d.studentBForm ?? null,
        })),
      });
    } catch (err) {
      req.log.error({ err }, "Failed to check application duplicates");
      return res.status(500).json({ error: "Failed to check duplicates" });
    }
  },
);

// ── List documents for an application ────────────────────────────────────────
router.get(
  "/admin/applications/:referenceId/documents",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const referenceId = String(req.params.referenceId).toUpperCase().trim();
      const [app] = await db.select({ id: applicationsTable.id, photoFilename: applicationsTable.photoFilename })
        .from(applicationsTable).where(appByRef(req, referenceId)).limit(1);
      if (!app) return res.status(404).json({ error: "Application not found" });
      const docs = await db.select()
        .from(applicationDocumentsTable)
        .where(eq(applicationDocumentsTable.applicationId, app.id))
        .orderBy(desc(applicationDocumentsTable.uploadedAt));
      return res.json({
        photoUrl: resolveUrl(app.photoFilename),
        documents: docs.map(d => ({
          id: d.id,
          docType: d.docType,
          originalName: d.originalName,
          url: d.storedName
            ? `/api/admin/applications/${referenceId}/documents/${d.id}/download`
            : null,
          downloadUrl: d.storedName
            ? `/api/admin/applications/${referenceId}/documents/${d.id}/download`
            : null,
          mimeType: d.mimeType,
          fileSize: d.fileSize,
          status: d.status,
          rejectionReason: d.rejectionReason,
          uploadedAt: d.uploadedAt.toISOString(),
        })),
      });
    } catch (err) {
      req.log.error({ err }, "Failed to list application documents");
      return res.status(500).json({ error: "Failed to load documents" });
    }
  },
);

// ── Download a single application document (auth-gated signed URL redirect) ──
router.get(
  "/admin/applications/:referenceId/documents/:docId/download",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const referenceId = String(req.params.referenceId).toUpperCase().trim();
      const docId = String(req.params.docId);
      const [app] = await db.select({ id: applicationsTable.id })
        .from(applicationsTable).where(appByRef(req, referenceId)).limit(1);
      if (!app) return res.status(404).json({ error: "Application not found" });
      const [doc] = await db.select()
        .from(applicationDocumentsTable)
        .where(and(eq(applicationDocumentsTable.id, docId), eq(applicationDocumentsTable.applicationId, app.id)))
        .limit(1);
      if (!doc?.storedName) return res.status(404).json({ error: "Document not found" });
      const { resolvePrivateDownloadUrl } = await import("../lib/storage");
      // legacyPrefix="" because old app docs lived at /uploads/<filename> (no subdir)
      let url = await resolvePrivateDownloadUrl(doc.storedName, "", 300);
      if (!url) return res.status(404).json({ error: "Document not found" });
      // For local /uploads/ fallback, propagate the token so the /uploads auth middleware accepts it
      if (url.startsWith("/uploads/")) {
        const token = (req.query["token"] as string | undefined) ?? req.headers.authorization?.replace(/^Bearer\s+/i, "");
        if (token) url = `${url}?token=${encodeURIComponent(token)}`;
      }
      return res.redirect(302, url);
    } catch (err) {
      req.log.error({ err }, "Failed to generate document download URL");
      return res.status(500).json({ error: "Failed to generate download URL" });
    }
  },
);

// ── Upload / replace a document for an application ───────────────────────────
router.post(
  "/admin/applications/:referenceId/documents",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const referenceId = String(req.params.referenceId).toUpperCase().trim();
      const { docType, fileBase64, mimeType, originalName } = req.body as {
        docType?: string; fileBase64?: string; mimeType?: string; originalName?: string;
      };
      if (!docType || !fileBase64 || !mimeType || !originalName) {
        return res.status(400).json({ error: "docType, fileBase64, mimeType, and originalName are required" });
      }
      const allowed = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
      if (!allowed.includes(mimeType)) {
        return res.status(400).json({ error: "Only JPG, PNG, and PDF files are accepted" });
      }
      const [app] = await db.select({ id: applicationsTable.id })
        .from(applicationsTable).where(appByRef(req, referenceId)).limit(1);
      if (!app) return res.status(404).json({ error: "Application not found" });

      const buf = Buffer.from(fileBase64, "base64");
      if (buf.length > 8 * 1024 * 1024) return res.status(400).json({ error: "File exceeds 8 MB limit" });

      const ext = originalName.split(".").pop() ?? "bin";
      const key = `docs/adoc-${app.id}-${crypto.randomUUID()}.${ext}`;
      const { putPrivateObject, deleteObject } = await import("../lib/storage");
      const storedName = await putPrivateObject(key, buf, mimeType);

      const [existing] = await db.select({ id: applicationDocumentsTable.id, storedName: applicationDocumentsTable.storedName })
        .from(applicationDocumentsTable)
        .where(and(eq(applicationDocumentsTable.applicationId, app.id), eq(applicationDocumentsTable.docType, docType)))
        .limit(1);

      if (existing) {
        if (existing.storedName) await deleteObject(existing.storedName);
        await db.update(applicationDocumentsTable)
          .set({ originalName, storedName, mimeType, fileSize: buf.length, status: "pending", rejectionReason: null, uploadedAt: new Date() })
          .where(eq(applicationDocumentsTable.id, existing.id));
      } else {
        await db.insert(applicationDocumentsTable).values({
          applicationId: app.id, docType, originalName, storedName, mimeType, fileSize: buf.length, status: "pending",
        });
      }
      return res.json({ success: true, docType });
    } catch (err) {
      req.log.error({ err }, "Failed to upload application document");
      return res.status(500).json({ error: "Failed to upload document" });
    }
  },
);

// ── Replace candidate photo ───────────────────────────────────────────────────
router.patch(
  "/admin/applications/:referenceId/photo",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const referenceId = String(req.params.referenceId).toUpperCase().trim();
      const { fileBase64, mimeType, originalName } = req.body as {
        fileBase64?: string; mimeType?: string; originalName?: string;
      };
      if (!fileBase64 || !mimeType || !originalName) {
        return res.status(400).json({ error: "fileBase64, mimeType, and originalName are required" });
      }
      const imgTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
      if (!imgTypes.includes(mimeType)) return res.status(400).json({ error: "Only JPG, PNG, or WebP images are accepted" });

      const [app] = await db.select({ id: applicationsTable.id, photoFilename: applicationsTable.photoFilename })
        .from(applicationsTable).where(appByRef(req, referenceId)).limit(1);
      if (!app) return res.status(404).json({ error: "Application not found" });

      const buf = Buffer.from(fileBase64, "base64");
      if (buf.length > 4 * 1024 * 1024) return res.status(400).json({ error: "Photo exceeds 4 MB limit" });

      const ext = originalName.split(".").pop() ?? "jpg";
      const key = `photo-${app.id}-${crypto.randomUUID()}.${ext}`;
      const { putObject: put } = await import("../lib/storage");
      const storedName = await put(key, buf, mimeType);

      await db.update(applicationsTable).set({ photoFilename: storedName }).where(eq(applicationsTable.id, app.id));
      return res.json({ success: true, photoUrl: storedName });
    } catch (err) {
      req.log.error({ err }, "Failed to update photo");
      return res.status(500).json({ error: "Failed to update photo" });
    }
  },
);

// ── Change status (+ timeline event) ─────────────────────────────────────────
router.patch(
  "/admin/applications/:referenceId/status",
  requireRole("admissions", "draft"),
  async (req: Request, res: Response) => {
    try {
      const parsed = UpdateAdminApplicationStatusBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid status update" });
      }
      const referenceId = String(req.params.referenceId).toUpperCase().trim();
      const { status, note } = parsed.data;
      const force = Boolean((req.body as any)?.force);
      // Cancellation/rejection after admission requires an explanatory note.
      const REQUIRES_NOTE = ["cancelled_by_student", "rejected_by_admission"];
      if (REQUIRES_NOTE.includes(status) && !note?.trim()) {
        return res.status(400).json({ error: `A reason/note is required when setting status to "${STATUS_LABELS[status] ?? status}".` });
      }
      // "Marks submitted together" — allow including marks in the same status
      // update request; used to transition to test_taken / interview_taken in
      // one call without a separate PATCH /marks request.
      const body = req.body as any;
      let proposedResultMarks: number | undefined;
      let proposedInterviewMarks: number | undefined;

      if (body?.resultMarks !== undefined && body.resultMarks !== null) {
        const v = Number(body.resultMarks);
        if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > 100) {
          return res.status(400).json({ error: "resultMarks must be an integer between 0 and 100" });
        }
        proposedResultMarks = v;
      }
      if (body?.interviewMarks !== undefined && body.interviewMarks !== null) {
        const v = Number(body.interviewMarks);
        if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > 60) {
          return res.status(400).json({ error: "interviewMarks must be an integer between 0 and 60" });
        }
        proposedInterviewMarks = v;
      }

      const [app] = await db
        .select()
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);

      if (!app) {
        return res.status(404).json({ error: "Application not found" });
      }

      // Checker-only terminal transitions
      const CHECKER_ONLY_STATUSES = ["admitted", "enrolled", "rejected_by_admission", "rejected"];
      if (CHECKER_ONLY_STATUSES.includes(status)) {
        const actor = req.adminUser!;
        if (!actor.isSuperAdmin) {
          const PERM_RANK: Record<string, number> = { viewer: 1, maker: 2, checker: 3 };
          const isChecker = actor.roles.some(
            (r) => (r.module === "admissions" || r.module === "*") &&
                   (PERM_RANK[r.permission] ?? 0) >= 3,
          );
          if (!isChecker) {
            return res.status(403).json({ error: 'Requires checker permission in module "admissions"' });
          }
        }
      }

      const transitionError = checkStatusTransition(app, status, force, {
        resultMarks: proposedResultMarks,
        interviewMarks: proposedInterviewMarks,
      });
      if (transitionError) {
        return res.status(409).json({ error: transitionError });
      }

      const label = STATUS_LABELS[status] ?? status;
      await db.transaction(async (tx) => {
        const updateSet: Partial<typeof applicationsTable.$inferInsert> = {};
        if (app.status !== status) updateSet.status = status;
        if (status === "test_taken"      && proposedResultMarks    !== undefined) updateSet.resultMarks    = proposedResultMarks;
        if (status === "interview_taken" && proposedInterviewMarks !== undefined) updateSet.interviewMarks = proposedInterviewMarks;
        if (status === "verified") updateSet.docVerificationStatus = "verified";

        if (Object.keys(updateSet).length > 0) {
          await tx.update(applicationsTable).set(updateSet).where(eq(applicationsTable.id, app.id));
        }

        await tx.insert(applicationEventsTable).values({
          applicationId: app.id,
          eventType: status,
          title: `Status changed to ${label}`,
          description: note?.trim() ? note.trim() : null,
        });
      });

      if (proposedResultMarks !== undefined || proposedInterviewMarks !== undefined) {
        void syncMeritScore(app.id);
      }

      const [updated] = await db
        .select()
        .from(applicationsTable)
        .where(eq(applicationsTable.id, app.id))
        .limit(1);

      return res.json(await serializeApplicationDetail(updated));
    } catch (err) {
      req.log.error({ err }, "Failed to update application status");
      return res.status(500).json({ error: "Failed to update status" });
    }
  },
);

// ── Application timeline events ───────────────────────────────────────────────
router.get(
  "/admin/applications/:referenceId/events",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const referenceId = String(req.params.referenceId).toUpperCase().trim();
      const [app] = await db.select({ id: applicationsTable.id }).from(applicationsTable).where(appByRef(req, referenceId)).limit(1);
      if (!app) return res.status(404).json({ error: "Application not found" });

      const events = await db
        .select({
          id: applicationEventsTable.id,
          eventType: applicationEventsTable.eventType,
          title: applicationEventsTable.title,
          description: applicationEventsTable.description,
          occurredAt: applicationEventsTable.occurredAt,
        })
        .from(applicationEventsTable)
        .where(eq(applicationEventsTable.applicationId, app.id))
        .orderBy(desc(applicationEventsTable.occurredAt));

      return res.json(events);
    } catch (err) {
      req.log.error({ err }, "Failed to get application events");
      return res.status(500).json({ error: "Failed to get events" });
    }
  },
);

// ── Add free-text note to an application (no status change) ───────────────────
router.post(
  "/admin/applications/:referenceId/notes",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const referenceId = String(req.params.referenceId).toUpperCase().trim();
      const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
      if (!description) return res.status(400).json({ error: "Note description is required." });

      const [app] = await db.select({ id: applicationsTable.id }).from(applicationsTable).where(appByRef(req, referenceId)).limit(1);
      if (!app) return res.status(404).json({ error: "Application not found" });

      const [inserted] = await db.insert(applicationEventsTable).values({
        applicationId: app.id,
        eventType: "note",
        title: "Admin Note",
        description,
      }).returning();

      return res.status(201).json(inserted);
    } catch (err) {
      req.log.error({ err }, "Failed to add application note");
      return res.status(500).json({ error: "Failed to add note" });
    }
  },
);

// ── Next sequential Applicant ID for enrollment dialogs ─────────────────────────
router.get("/admin/students/next-gr", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const year = new Date().getFullYear();

    // Load the persisted GR format — this MUST exist before any Applicant ID
    // can be generated.  Query params can supplement format values but they
    // can never bypass the "format configured" gate.
    const [fmtRow] = await db
      .select({ value: admissionsSettingsTable.value })
      .from(admissionsSettingsTable)
      .where(eq(admissionsSettingsTable.key, `gr_format:${tenantId}`))
      .limit(1);

    // Hard gate: DB row must exist regardless of what query params the caller passes.
    if (!fmtRow) {
      return res.status(400).json({
        error: "Applicant ID format is not configured for this tenant. Go to Settings → ID Format and set a prefix before generating Applicant IDs.",
        code: "GR_FORMAT_NOT_CONFIGURED",
      });
    }

    let dbFmt: { prefix?: string; separator?: string; includeYear?: boolean; paddingDigits?: string } = {};
    try { dbFmt = JSON.parse(fmtRow.value); } catch {}

    // Query params are allowed to override individual format values (e.g. for
    // previewing a new format in the settings UI) but the DB row must exist.
    const prefix = (typeof req.query.prefix === "string" && req.query.prefix.trim()
      ? req.query.prefix.trim()
      : null) ?? (typeof dbFmt.prefix === "string" && dbFmt.prefix.trim() ? dbFmt.prefix.trim() : "GR");

    const sep = (typeof req.query.separator === "string" ? req.query.separator : null)
      ?? (typeof dbFmt.separator === "string" ? dbFmt.separator : "-");
    const includeYear = req.query.includeYear !== undefined
      ? req.query.includeYear !== "false"
      : (dbFmt.includeYear !== false);
    const padding = (typeof req.query.paddingDigits === "string" ? (parseInt(req.query.paddingDigits) || null) : null)
      ?? (dbFmt.paddingDigits ? (parseInt(dbFmt.paddingDigits) || 3) : 3);

    // How many consecutive verified Applicant IDs to return (capped at 100).
    const count = Math.min(Math.max(parseInt(String(req.query.count ?? "1")) || 1, 1), 100);

    const seqPosition = includeYear ? 3 : 2;

    let likePattern: string;
    if (includeYear) {
      likePattern = `${prefix}${sep}${year}${sep}%`;
    } else {
      likePattern = `${prefix}${sep}%`;
    }

    // applicant_id is unique per (tenant_id, applicant_id) — scope all checks
    // to the current tenant so each tenant has its own independent sequence.
    const [row] = await db
      .select({
        maxSeq: sql<number | null>`COALESCE(MAX(CAST(SPLIT_PART(${studentsTable.applicantId}, ${sep}, ${seqPosition}) AS INTEGER)), 0)`,
      })
      .from(studentsTable)
      .where(and(
        sql`${studentsTable.applicantId} LIKE ${likePattern}`,
        eq(studentsTable.tenantId, tenantId),
      ));

    let seq = (row?.maxSeq ?? 0) + 1;

    const buildGr = (s: number): string => {
      const parts = [prefix!];
      if (includeYear) parts.push(String(year));
      parts.push(String(s).padStart(padding, "0"));
      return parts.join(sep);
    };

    // Always return server-verified Applicant IDs (skipping gaps and manual entries).
    const applicantIds: string[] = [];
    let firstSeq: number | null = null;
    let attempt = 0;
    const maxAttempts = count * 10 + 200;

    while (applicantIds.length < count && attempt < maxAttempts) {
      attempt++;
      const candidate = buildGr(seq);
      const [existing] = await db
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .where(and(eq(studentsTable.applicantId, candidate), eq(studentsTable.tenantId, tenantId)))
        .limit(1);
      if (!existing) {
        if (firstSeq === null) firstSeq = seq;
        applicantIds.push(candidate);
      }
      seq++;
    }

    if (applicantIds.length < count) {
      return res.status(409).json({
        error: `Could not find ${count} available Applicant ID(s) after ${maxAttempts} attempts. Please check existing Applicant IDs.`,
      });
    }

    // Backward-compat: single-GR callers still get nextSequence + nextGr.
    return res.json({
      nextApplicantId: applicantIds[0],
      nextSequence: firstSeq,   // first sequence number used (backward compat)
      applicantIds,                // full verified list (length === count)
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get next GR sequence");
    return res.status(500).json({ error: "Failed to compute next Applicant ID" });
  }
});

// ── Bulk-enroll multiple admitted applicants ──────────────────────────────────
router.post(
  "/admin/applications/bulk-enroll",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;

      const rawItems = req.body?.items;
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        return res.status(400).json({ error: "items must be a non-empty array" });
      }

      // ── Gate checks (same as single-enroll, applied per-item) ────────────
      // Check academic setup once — if it is incomplete every item will fail,
      // so surface the reason upfront rather than repeating it per row.
      const academicSetup = await checkAcademicSetup(tenantId);

      // Resolve admission fee gate mode once for the tenant.
      const gateKey = `admission_fee_gate:${tenantId}`;
      const [gateSetting] = await db
        .select({ value: admissionsSettingsTable.value })
        .from(admissionsSettingsTable)
        .where(eq(admissionsSettingsTable.key, gateKey))
        .limit(1);
      const feeGateMode = gateSetting?.value ?? "warn"; // "block" | "warn"

      // Fetch active academic year once (shared across all enrollments).
      const [activeYear] = await db
        .select({ id: academicYearsTable.id })
        .from(academicYearsTable)
        .where(and(eq(academicYearsTable.active, true), eq(academicYearsTable.tenantId, tenantId)))
        .limit(1);
      const sharedAcademicYearId: string | null = activeYear?.id ?? null;

      type ResultItem = { referenceId: string; success: boolean; applicantId?: string; error?: string };
      const results: ResultItem[] = [];

      for (const item of rawItems) {
        const referenceId = String(item.referenceId ?? "").toUpperCase().trim();
        const applicantId    = String(item.applicantId    ?? "").trim();
        const enrollmentDate = typeof item.enrollmentDate === "string" && item.enrollmentDate.trim()
          ? item.enrollmentDate.trim()
          : null;

        if (!referenceId || !applicantId) {
          results.push({ referenceId, success: false, error: "referenceId and applicantId are required" });
          continue;
        }

        try {
          const [app] = await db
            .select()
            .from(applicationsTable)
            .where(and(eq(applicationsTable.referenceId, referenceId), eq(applicationsTable.tenantId, tenantId)))
            .limit(1);

          if (!app) {
            results.push({ referenceId, success: false, error: "Application not found" });
            continue;
          }
          if (app.status !== "admitted") {
            results.push({ referenceId, success: false, error: `Applicant must be in 'admitted' status (current: ${app.status})` });
            continue;
          }

          // ── Academic setup gate (same as single-enroll) ─────────────────
          if (!academicSetup.complete) {
            results.push({ referenceId, success: false, error: academicSetupErrorMessage(academicSetup.missing) });
            continue;
          }

          // ── Admission fee gate (same as single-enroll, "block" mode) ────
          if (feeGateMode === "block" && app.admissionFeeStatus !== "paid") {
            results.push({ referenceId, success: false, error: "Enrollment blocked: admission fee must be verified before enrolling this cadet." });
            continue;
          }

          const resolvedClassCode = app.classApplying ?? null;
          if (!resolvedClassCode) {
            results.push({ referenceId, success: false, error: "No class assigned to this application" });
            continue;
          }

          // Prevent double-enrollment
          const [existing] = await db
            .select({ id: studentsTable.id })
            .from(studentsTable)
            .where(eq(studentsTable.applicationId, app.id))
            .limit(1);
          if (existing) {
            results.push({ referenceId, success: false, error: "Applicant is already enrolled as a student" });
            continue;
          }

          // Resolve section allocation (if any).
          const [sectionAlloc] = await db
            .select({ sectionId: sectionAllocationsTable.sectionId, academicYearId: sectionAllocationsTable.academicYearId })
            .from(sectionAllocationsTable)
            .where(eq(sectionAllocationsTable.applicationId, app.id))
            .limit(1);

          const resolvedAcademicYearId = sectionAlloc?.academicYearId ?? sharedAcademicYearId;

          let createdApplicantId: string | undefined;

          await db.transaction(async (tx) => {
            const [student] = await tx
              .insert(studentsTable)
              .values({
                applicantId,
                applicationId:  app.id,
                fullName:       app.fullName,
                dateOfBirth:    app.dateOfBirth    ?? null,
                bloodGroup:     app.bloodGroup     ?? null,
                religion:       app.religion       ?? null,
                mobile:         app.studentMobile  ?? null,
                email:          app.studentEmail   ?? null,
                address:        app.presentAddress ?? null,
                city:           app.city           ?? null,
                province:       app.state          ?? null,
                fatherName:     app.fatherName     ?? null,
                guardianName:   app.guardianName   ?? null,
                relation:       app.relation       ?? null,
                occupation:     app.occupation     ?? null,
                guardianMobile: app.guardianMobile ?? null,
                guardianCnic:   app.parentCnic     ?? null,
                classCode:      resolvedClassCode,
                sectionId:      sectionAlloc?.sectionId ?? null,
                academicYearId: resolvedAcademicYearId,
                enrollmentDate: enrollmentDate,
                status:         "active",
                tenantId:       app.tenantId ?? null,
              })
              .returning();

            createdApplicantId = student.applicantId;

            await tx
              .update(applicationsTable)
              .set({ status: "enrolled" })
              .where(eq(applicationsTable.id, app.id));

            await tx.insert(applicationEventsTable).values({
              applicationId: app.id,
              eventType:     "enrolled",
              title:         "Cadet Enrolled (Bulk)",
              description:   `Student record created with Applicant ID ${applicantId} via bulk enrollment.`,
            });

            await tx.insert(studentEnrollmentsTable).values({
              studentId:      student.id,
              academicYearId: resolvedAcademicYearId,
              classCode:      resolvedClassCode,
              sectionId:      sectionAlloc?.sectionId ?? null,
              startDate:      enrollmentDate ?? new Date().toISOString().slice(0, 10),
              status:         "active",
            });
          });

          results.push({ referenceId, success: true, applicantId: createdApplicantId ?? applicantId });
        } catch (itemErr: any) {
          const cause1 = itemErr?.cause ?? {};
          const cause2 = cause1?.cause ?? {};
          const isDuplicate =
            itemErr?.code === "23505" || cause1?.code === "23505" || cause2?.code === "23505" ||
            String(itemErr?.message ?? "").toLowerCase().includes("duplicate") ||
            String(itemErr?.message ?? "").toLowerCase().includes("unique");
          const errMsg = isDuplicate
            ? `Applicant ID ${applicantId} is already in use`
            : (itemErr?.message ?? "Enrollment failed");
          results.push({ referenceId, success: false, error: errMsg });
        }
      }

      const enrolled = results.filter(r => r.success).length;
      const failed   = results.filter(r => !r.success).length;
      return res.json({ enrolled, failed, results });
    } catch (err) {
      req.log.error({ err }, "Failed to bulk-enroll applicants");
      return res.status(500).json({ error: "Failed to bulk-enroll applicants" });
    }
  },
);

// ── Enroll admitted applicant → create student record ─────────────────────────
router.post(
  "/admin/applications/:referenceId/enroll",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const referenceId = String(req.params.referenceId).toUpperCase().trim();
      const applicantId = String(req.body?.applicantId ?? "").trim();
      const enrollmentDate = req.body?.enrollmentDate?.trim() ?? null;
      // force=true skips soft-gate checks (academic setup, fee gate) so the
      // frontend can let staff enroll after acknowledging the warnings.
      const force = Boolean(req.body?.force);
      // Optional overrides supplied by the enrollment dialog.
      const bodyClassCode = typeof req.body?.classCode === "string" && req.body.classCode.trim() ? req.body.classCode.trim() : null;
      const bodySectionId = typeof req.body?.sectionId === "string" && req.body.sectionId.trim() ? req.body.sectionId.trim() : null;

      if (!applicantId) {
        return res.status(400).json({ error: "applicantId is required" });
      }

      const tenantId = requireTenant(req, res);
      if (!tenantId) return;

      // Hard gate: GR format must be configured before enrollment is permitted.
      // This is a precondition, not a soft gate — not bypassable with force=true.
      const [grFmtRow] = await db
        .select({ value: admissionsSettingsTable.value })
        .from(admissionsSettingsTable)
        .where(eq(admissionsSettingsTable.key, `gr_format:${tenantId}`))
        .limit(1);
      if (!grFmtRow) {
        return res.status(400).json({
          error: "Applicant ID format is not configured. Go to Settings → ID Format and set a prefix before enrolling cadets.",
          code: "GR_FORMAT_NOT_CONFIGURED",
        });
      }

      // Block enrollment unless the mandatory Academic Setup is complete,
      // unless force=true (staff confirmed they want to proceed anyway).
      if (!force) {
        const setup = await checkAcademicSetup(tenantId);
        if (!setup.complete) {
          return res.status(400).json({ error: academicSetupErrorMessage(setup.missing) });
        }
      }

      const [app] = await db
        .select()
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);

      if (!app) return res.status(404).json({ error: "Application not found" });
      if (app.status !== "admitted") {
        return res.status(400).json({ error: "Applicant must be in 'admitted' status to enroll" });
      }
      // Allow staff to supply classCode from the dialog; only block when neither
      // source is available.
      const resolvedClassCode = bodyClassCode ?? app.classApplying ?? null;
      if (!resolvedClassCode) {
        return res.status(400).json({ error: "classCode is required — set 'Class Applying' on the application or select a class in the enrollment dialog" });
      }

      // Check admission fee gate — "block" mode prevents enrollment until fee is
      // verified, unless force=true (staff confirmed they want to proceed anyway).
      if (!force) {
        const gateKey = `admission_fee_gate:${tenantId}`;
        const [gateSetting] = await db
          .select()
          .from(admissionsSettingsTable)
          .where(eq(admissionsSettingsTable.key, gateKey))
          .limit(1);
        if ((gateSetting?.value ?? "warn") === "block" && app.admissionFeeStatus !== "paid") {
          return res.status(400).json({
            error: "Enrollment blocked: the admission fee must be verified before enrolling this cadet. Go to Fee Verification to verify the payment first.",
          });
        }
      }

      // Prevent double-enrollment
      const [existing] = await db
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .where(eq(studentsTable.applicationId, app.id))
        .limit(1);
      if (existing) {
        return res.status(409).json({ error: "This applicant has already been enrolled as a student" });
      }

      let createdStudent: typeof studentsTable.$inferSelect | undefined;

      // Look up section allocation so sectionId + academicYearId carry over to the student record.
      // When the dialog supplied an explicit sectionId we still fetch the allocation for
      // its academicYearId (we only override sectionId, not the academic year).
      const [sectionAlloc] = await db
        .select({ sectionId: sectionAllocationsTable.sectionId, academicYearId: sectionAllocationsTable.academicYearId })
        .from(sectionAllocationsTable)
        .where(eq(sectionAllocationsTable.applicationId, app.id))
        .limit(1);

      // When there is no section allocation (or it has no academicYearId), fall back to the
      // tenant's current active academic year so we never silently insert null — which would
      // allow duplicate enrollment rows due to Postgres treating NULL ≠ NULL in unique indexes.
      let resolvedAcademicYearId: string | null = sectionAlloc?.academicYearId ?? null;
      if (!resolvedAcademicYearId) {
        const activeYearConds: any[] = [eq(academicYearsTable.active, true)];
        if (tenantId) activeYearConds.push(eq(academicYearsTable.tenantId, tenantId));
        const [activeYear] = await db
          .select({ id: academicYearsTable.id })
          .from(academicYearsTable)
          .where(and(...activeYearConds))
          .limit(1);
        resolvedAcademicYearId = activeYear?.id ?? null;
        if (!resolvedAcademicYearId && !force) {
          return res.status(400).json({ error: "No active Academic Year is configured. Set one up in Academic Setup before enrolling, or use 'Enroll Anyway' to proceed without one." });
        }
      }

      // ── Guardian auto-link ──────────────────────────────────────────────────
      // Try to find an existing guardian by CNIC → phone → email, then create
      // one from the application's parent details if none is found.
      let resolvedGuardianId: string | null = null;
      try {
        const rawCnic  = app.parentCnic?.trim() || null;
        const rawPhone = app.guardianMobile?.trim() || null;
        const rawEmail = (app as any).guardianEmail?.trim() || null;
        const canonCnic  = rawCnic  ? canonicalizeCnic(rawCnic)   : null;
        const canonPhone = rawPhone ? canonicalizePhone(rawPhone)  : null;
        const canonEmail = rawEmail ? rawEmail.toLowerCase() : null;

        let matchedId: string | null = null;
        if (canonCnic) {
          const [r] = await db.select({ id: guardiansTable.id }).from(guardiansTable).where(eq(guardiansTable.cnic, canonCnic)).limit(1);
          if (r) matchedId = r.id;
        }
        if (!matchedId && canonPhone) {
          const [r] = await db.select({ id: guardiansTable.id }).from(guardiansTable).where(eq(guardiansTable.phone, canonPhone)).limit(1);
          if (r) matchedId = r.id;
        }
        if (!matchedId && canonEmail) {
          const [r] = await db.select({ id: guardiansTable.id }).from(guardiansTable).where(sql`lower(${guardiansTable.email}) = ${canonEmail}`).limit(1);
          if (r) matchedId = r.id;
        }

        if (matchedId) {
          resolvedGuardianId = matchedId;
        } else {
          const guardianName = (app.guardianName?.trim() || app.fatherName?.trim() || "").trim();
          if (guardianName) {
            const [newG] = await db.insert(guardiansTable).values({
              name:     guardianName,
              cnic:     canonCnic,
              phone:    canonPhone,
              email:    canonEmail,
              tenantId: app.tenantId ?? null,
            }).returning();
            if (newG) resolvedGuardianId = newG.id;
          }
        }
      } catch (guardianErr) {
        // Non-fatal: if guardian lookup/create fails we still enroll the student,
        // admin can link the guardian later via the student profile.
        req.log.warn({ err: guardianErr }, "Guardian auto-link failed during enroll — proceeding without guardian");
      }

      await db.transaction(async (tx) => {
        const [student] = await tx
          .insert(studentsTable)
          .values({
            applicantId,
            applicationId: app.id,
            fullName:      app.fullName,
            dateOfBirth:   app.dateOfBirth ?? null,
            bloodGroup:    app.bloodGroup ?? null,
            religion:      app.religion ?? null,
            mobile:        app.studentMobile ?? null,
            email:         app.studentEmail ?? null,
            address:       app.presentAddress ?? null,
            city:          app.city ?? null,
            province:      app.state ?? null,
            fatherName:    app.fatherName ?? null,
            guardianName:  app.guardianName ?? null,
            relation:      app.relation ?? null,
            occupation:    app.occupation ?? null,
            guardianMobile: app.guardianMobile ?? null,
            guardianCnic:  app.parentCnic ?? null,
            guardianId:    resolvedGuardianId,
            classCode:     resolvedClassCode,
            sectionId:     bodySectionId ?? sectionAlloc?.sectionId ?? null,
            academicYearId: resolvedAcademicYearId,
            enrollmentDate: enrollmentDate,
            status:        "active",
            tenantId:      app.tenantId ?? null,
          })
          .returning();
        createdStudent = student;

        await tx
          .update(applicationsTable)
          .set({ status: "enrolled" })
          .where(eq(applicationsTable.id, app.id));

        await tx.insert(applicationEventsTable).values({
          applicationId: app.id,
          eventType:     "enrolled",
          title:         "Cadet Enrolled",
          description:   `Student record created with Applicant ID ${applicantId}.`,
        });

        // Create initial enrollment history row
        await tx
          .insert(studentEnrollmentsTable)
          .values({
            studentId:      createdStudent!.id,
            academicYearId: resolvedAcademicYearId,
            classCode:      resolvedClassCode,
            sectionId:      bodySectionId ?? sectionAlloc?.sectionId ?? null,
            startDate:      enrollmentDate ?? new Date().toISOString().slice(0, 10),
            status:         "active",
          });
      });

      return res.status(201).json({ student: createdStudent, applicantId: createdStudent!.applicantId });
    } catch (err: any) {
      // Drizzle wraps Postgres errors: the real pg code lives on err.cause.code
      // (or err.cause.cause.code for nested transaction wrappers).
      const cause1 = err?.cause ?? {};
      const cause2 = cause1?.cause ?? {};
      const isDuplicate =
        err?.code === "23505" ||
        cause1?.code === "23505" ||
        cause2?.code === "23505" ||
        String(err?.message ?? "").toLowerCase().includes("duplicate") ||
        String(err?.message ?? "").toLowerCase().includes("unique") ||
        String(cause1?.message ?? "").toLowerCase().includes("duplicate") ||
        String(cause1?.message ?? "").toLowerCase().includes("unique");
      if (isDuplicate) {
        const grNum = typeof err?.body?.applicantId === "string" ? err.body.applicantId : (req.body?.applicantId ?? "");
        return res.status(409).json({
          error: `Applicant ID ${grNum || "(unknown)"} is already in use — click Auto to get the next available number.`,
        });
      }
      req.log.error({ err }, "Failed to enroll applicant");
      return res.status(500).json({ error: "Failed to enroll applicant" });
    }
  },
);

// ── Assign roll number + test date (→ Entry Test Scheduled) ───────────────────
router.patch(
  "/admin/applications/:referenceId/test",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const parsed = AssignAdminApplicationTestBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid test assignment" });
      }
      const referenceId = String(req.params.referenceId).toUpperCase().trim();
      const { rollNumber, testDate, examCenter, centreId, note } = parsed.data;

      const parsedDate = new Date(testDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: "Invalid test date" });
      }

      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const [app] = await db
        .select()
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);

      if (!app) {
        return res.status(404).json({ error: "Application not found" });
      }

      let centreRecord: typeof testCentresTable.$inferSelect | undefined;
      if (centreId) {
        const [c] = await db.select().from(testCentresTable).where(and(eq(testCentresTable.id, centreId), eq(testCentresTable.tenantId, tenantId))).limit(1);
        centreRecord = c;
      }
      const centre = centreRecord?.name ?? (examCenter?.trim() ? examCenter.trim() : app.examCenter);
      const detailParts = [
        `Roll number ${rollNumber.trim()} issued`,
        `centre: ${centre}`,
        `test on ${parsedDate.toISOString()}`,
      ];
      const description = note?.trim()
        ? note.trim()
        : `${detailParts.join(" · ")}.`;

      await db.transaction(async (tx) => {
        await tx
          .update(applicationsTable)
          .set({
            rollNumber: rollNumber.trim(),
            testDate: parsedDate,
            examCenter: centre,
            testCentreId: centreRecord?.id ?? null,
            testVenue: centreRecord?.name ?? null,
            testCenterAddress: centreRecord?.address ?? null,
            testFocalPerson: centreRecord?.focalPerson ?? null,
            status: "test_scheduled",
          })
          .where(eq(applicationsTable.id, app.id));

        await tx.insert(applicationEventsTable).values({
          applicationId: app.id,
          eventType: "test_scheduled",
          title: STATUS_LABELS.test_scheduled,
          description,
        });
      });

      const [updated] = await db
        .select()
        .from(applicationsTable)
        .where(eq(applicationsTable.id, app.id))
        .limit(1);

      return res.json(await serializeApplicationDetail(updated));
    } catch (err) {
      req.log.error({ err }, "Failed to assign test details");
      return res.status(500).json({ error: "Failed to assign test details" });
    }
  },
);

// ── Record marks + publish result/decision ───────────────────────────────────
router.patch(
  "/admin/applications/:referenceId/result",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const parsed = RecordAdminApplicationResultBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid result entry" });
      }
      const referenceId = String(req.params.referenceId).toUpperCase().trim();
      const { resultMarks, status, note } = parsed.data;

      if (!Number.isInteger(resultMarks)) {
        return res.status(400).json({ error: "Marks must be a whole number between 0 and 100" });
      }

      const [app] = await db
        .select()
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);

      if (!app) {
        return res.status(404).json({ error: "Application not found" });
      }
      if (app.status === "enrolled") {
        return res.status(409).json({ error: "Applicant is enrolled — record is locked" });
      }

      const label = STATUS_LABELS[status] ?? status;
      const description = note?.trim()
        ? note.trim()
        : `Marks recorded: ${resultMarks}/100.`;

      await db.transaction(async (tx) => {
        await tx
          .update(applicationsTable)
          .set({ resultMarks, status })
          .where(eq(applicationsTable.id, app.id));

        await tx.insert(applicationEventsTable).values({
          applicationId: app.id,
          eventType: status,
          title: label,
          description,
        });
      });

      void syncMeritScore(app.id);

      const [updated] = await db
        .select()
        .from(applicationsTable)
        .where(eq(applicationsTable.id, app.id))
        .limit(1);

      return res.json(await serializeApplicationDetail(updated));
    } catch (err) {
      req.log.error({ err }, "Failed to record result");
      return res.status(500).json({ error: "Failed to record result" });
    }
  },
);

// ── Bulk: update marks (academic %, entry-test, interview) ───────────────────

router.patch(
  "/admin/applications/bulk/marks",
  requireAdmin,
  async (req: Request, res: Response) => {
    const parsed = BulkUpdateAdminApplicationMarksBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid bulk marks request", issues: parsed.error.issues });
    }
    const { entries } = parsed.data;

    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const refIds = [...new Set(entries.map(e => e.referenceId.toUpperCase().trim()))];
      const apps = await db
        .select({ id: applicationsTable.id, referenceId: applicationsTable.referenceId, status: applicationsTable.status })
        .from(applicationsTable)
        .where(and(inArray(applicationsTable.referenceId, refIds), eq(applicationsTable.tenantId, tenantId)));

      const byRefId = new Map(apps.map(a => [a.referenceId.toUpperCase(), a]));

      let updated = 0;
      let statusAdvanced = 0;
      const skipped: { referenceId: string; reason: string }[] = [];
      const syncIds: string[] = [];

      await db.transaction(async (tx) => {
        for (const entry of entries) {
          const app = byRefId.get(entry.referenceId.toUpperCase().trim());
          if (!app) continue;
          if (app.status === "enrolled") {
            skipped.push({ referenceId: app.referenceId, reason: "enrolled — record is locked" });
            continue;
          }

          const updates: Partial<typeof applicationsTable.$inferInsert> = {};
          if (entry.previousMarks !== undefined) {
            const scoreErr = validateAcademicScoreField(String(entry.previousMarks));
            if (scoreErr) {
              skipped.push({ referenceId: app.referenceId, reason: scoreErr });
              continue;
            }
            updates.previousMarks = entry.previousMarks;
            // Auto-verify docs when academic marks are provided
            updates.docVerificationStatus = "verified";
          }

          const BEFORE_TEST_TAKEN_BULK = ["received", "under_review", "verified", "test_scheduled"];
          const BEFORE_INTERVIEW_TAKEN_BULK = ["received", "under_review", "pending_verification", "verified", "test_scheduled", "test_taken", "interview_scheduled"];

          if (entry.resultMarks !== undefined) {
            // Entry test marks may only be recorded once the test has been taken.
            if (BEFORE_TEST_TAKEN_BULK.includes(app.status)) {
              skipped.push({ referenceId: app.referenceId, reason: "Mark the test as Taken before recording marks" });
              continue;
            }
            updates.resultMarks = entry.resultMarks;
          }

          if (entry.interviewMarks !== undefined) {
            updates.interviewMarks = entry.interviewMarks;
          }

          if (Object.keys(updates).length === 0) continue;

          // Auto-advance status when interview marks move the pipeline forward
          if (entry.interviewMarks !== undefined && BEFORE_INTERVIEW_TAKEN_BULK.includes(app.status)) {
            updates.status = "interview_taken";
            statusAdvanced++;
          }

          await tx.update(applicationsTable).set(updates).where(eq(applicationsTable.id, app.id));
          updated++;
          syncIds.push(app.id);

          if (updates.status) {
            await tx.insert(applicationEventsTable).values({
              applicationId: app.id,
              eventType: updates.status,
              title: STATUS_LABELS[updates.status] ?? updates.status,
              description: "Status auto-advanced during bulk marks entry.",
            });
          }
        }
      });

      void syncMeritScores(syncIds);
      return res.json({ updated, statusAdvanced, skipped });
    } catch (err) {
      req.log.error({ err }, "Failed bulk marks update");
      return res.status(500).json({ error: "Failed to update marks" });
    }
  },
);

// ── Inline marks save (single record) ────────────────────────────────────────
router.patch(
  "/admin/applications/:referenceId/marks",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const referenceId = String(req.params.referenceId).toUpperCase().trim();
      const { previousMarks, resultMarks, interviewMarks } = req.body ?? {};

      if (previousMarks === undefined && resultMarks === undefined && interviewMarks === undefined) {
        return res.status(400).json({ error: "At least one of previousMarks, resultMarks, interviewMarks is required" });
      }

      const [app] = await db
        .select()
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);

      if (!app) return res.status(404).json({ error: "Application not found" });
      if (app.status === "enrolled") {
        return res.status(409).json({ error: "Applicant is enrolled — their record is locked and cannot be edited." });
      }

      const updates: Partial<typeof applicationsTable.$inferInsert> = {};
      const events: { eventType: string; title: string; description: string }[] = [];

      if (previousMarks !== undefined) {
        const raw = String(previousMarks).replace("%", "").trim();
        const scoreErr = validateAcademicScoreField(raw);
        if (scoreErr) {
          return res.status(400).json({ error: scoreErr });
        }
        updates.previousMarks = raw;
      }

      const BEFORE_TEST_TAKEN = ["received", "under_review", "verified", "test_scheduled"];
      const BEFORE_INTERVIEW_TAKEN = ["received", "under_review", "pending_verification", "verified", "test_scheduled", "test_taken", "interview_scheduled"];

      if (resultMarks !== undefined) {
        const n = Number(resultMarks);
        if (!Number.isInteger(n) || n < 0 || n > 100) {
          return res.status(400).json({ error: "resultMarks must be an integer 0–100" });
        }
        // Marks may only be recorded once the entry test has been taken.
        if (BEFORE_TEST_TAKEN.includes(app.status)) {
          return res.status(409).json({ error: "Mark the entry test as Taken before recording marks." });
        }
        updates.resultMarks = n;
      }

      if (interviewMarks !== undefined) {
        const n = Number(interviewMarks);
        if (!Number.isInteger(n) || n < 0 || n > 30) {
          return res.status(400).json({ error: "interviewMarks must be an integer 0–30" });
        }
        updates.interviewMarks = n;
        // Auto-advance to interview_taken whenever current status is still before that stage
        if (BEFORE_INTERVIEW_TAKEN.includes(app.status)) {
          updates.status = "interview_taken";
          events.push({ eventType: "interview_taken", title: "Interview Completed", description: `Interview marks recorded: ${n}/30.` });
        }
      }

      await db.transaction(async (tx) => {
        await tx.update(applicationsTable).set(updates).where(eq(applicationsTable.id, app.id));
        for (const ev of events) {
          await tx.insert(applicationEventsTable).values({ applicationId: app.id, ...ev });
        }
      });

      void syncMeritScore(app.id);
      return res.json({ ok: true, status: updates.status ?? app.status });
    } catch (err) {
      req.log.error({ err }, "Failed to save inline marks");
      return res.status(500).json({ error: "Failed to save marks" });
    }
  },
);

// ── PATCH: set interviewed-by on an application ───────────────────────────────
router.patch(
  "/admin/applications/:referenceId/interviewed-by",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const referenceId = String(req.params.referenceId).toUpperCase().trim();
      const { interviewedBy } = req.body ?? {};

      const [app] = await db
        .select({ id: applicationsTable.id })
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);

      if (!app) return res.status(404).json({ error: "Application not found" });

      await db
        .update(applicationsTable)
        .set({ interviewedBy: interviewedBy ?? null })
        .where(eq(applicationsTable.id, app.id));

      return res.json({ ok: true });
    } catch (err) {
      req.log.error({ err }, "Failed to save interviewed-by");
      return res.status(500).json({ error: "Failed to save" });
    }
  },
);

// ── Bulk: change status of many applications ─────────────────────────────────
router.post(
  "/admin/applications/bulk/status",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const parsed = BulkUpdateAdminApplicationStatusBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid bulk status update" });
      }
      const { referenceIds, status, note } = parsed.data;
      const force = Boolean((req.body as any)?.force);
      const ids = [...new Set(referenceIds.map((r) => r.toUpperCase().trim()))];

      const apps = await db
        .select()
        .from(applicationsTable)
        .where(and(inArray(applicationsTable.referenceId, ids), eq(applicationsTable.tenantId, tenantId)));

      const foundRefs = new Set(apps.map((a) => a.referenceId));
      const notFound = ids.filter((id) => !foundRefs.has(id));
      const label = STATUS_LABELS[status] ?? status;

      let updated = 0;
      const skipped: { referenceId: string; reason: string }[] = [];

      await db.transaction(async (tx) => {
        for (const app of apps) {
          const transitionError = checkStatusTransition(app, status, force);
          if (transitionError) {
            skipped.push({ referenceId: app.referenceId, reason: transitionError });
            continue;
          }
          updated++;
          if (app.status !== status) {
            await tx
              .update(applicationsTable)
              .set({ status })
              .where(eq(applicationsTable.id, app.id));
          }
          await tx.insert(applicationEventsTable).values({
            applicationId: app.id,
            eventType: status,
            title: `Status changed to ${label}`,
            description: note?.trim() ? note.trim() : null,
          });
        }
      });

      return res.json({ updated, notFound, skipped });
    } catch (err) {
      req.log.error({ err }, "Failed bulk status update");
      return res.status(500).json({ error: "Failed to update applications" });
    }
  },
);

// ── Bulk: schedule test + auto-assign sequential roll numbers ────────────────
router.post(
  "/admin/applications/bulk/schedule",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const parsed = BulkScheduleAdminApplicationTestBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid bulk schedule request" });
      }
      const { referenceIds, testDate, examCenter, centreId, rollNumberPrefix, startNumber, padding } =
        parsed.data;

      const parsedDate = new Date(testDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: "Invalid test date" });
      }
      if (startNumber !== undefined && !Number.isInteger(startNumber)) {
        return res.status(400).json({ error: "Start number must be a whole number" });
      }
      if (padding !== undefined && !Number.isInteger(padding)) {
        return res.status(400).json({ error: "Padding must be a whole number" });
      }
      const pad = padding ?? 4;
      const prefix = rollNumberPrefix.trim();
      const ids = [...new Set(referenceIds.map((r) => r.toUpperCase().trim()))];

      // Stable order (oldest first) so roll numbers are assigned deterministically.
      const apps = await db
        .select()
        .from(applicationsTable)
        .where(and(inArray(applicationsTable.referenceId, ids), eq(applicationsTable.tenantId, tenantId)))
        .orderBy(asc(applicationsTable.createdAt));

      const foundRefs = new Set(apps.map((a) => a.referenceId));
      const notFound = ids.filter((id) => !foundRefs.has(id));
      if (apps.length === 0) {
        return res.status(400).json({ error: "No matching applications" });
      }

      // Determine the first sequence number.
      let start = startNumber ?? 1;
      if (startNumber === undefined) {
        // Continue from the highest existing roll number that shares this prefix.
        const existing = await db
          .select({ rollNumber: applicationsTable.rollNumber })
          .from(applicationsTable)
          .where(and(ilike(applicationsTable.rollNumber, `${prefix}%`), eq(applicationsTable.tenantId, tenantId)));
        let max = 0;
        for (const row of existing) {
          const rn = row.rollNumber;
          if (!rn || !rn.startsWith(prefix)) continue;
          const n = parseInt(rn.slice(prefix.length), 10);
          if (Number.isFinite(n) && n > max) max = n;
        }
        start = max + 1;
      }

      const assignments = apps.map((app, i) => ({
        referenceId: app.referenceId,
        rollNumber: `${prefix}${String(start + i).padStart(pad, "0")}`,
      }));

      // Guard against collisions with roll numbers already used by OTHER applications.
      const newRolls = assignments.map((a) => a.rollNumber);
      const collisions = await db
        .select({
          rollNumber: applicationsTable.rollNumber,
          referenceId: applicationsTable.referenceId,
        })
        .from(applicationsTable)
        .where(and(inArray(applicationsTable.rollNumber, newRolls), eq(applicationsTable.tenantId, tenantId)));
      const blocking = collisions.filter((c) => !foundRefs.has(c.referenceId));
      if (blocking.length > 0) {
        return res.status(400).json({
          error: `Roll number(s) already in use: ${blocking
            .map((c) => c.rollNumber)
            .join(", ")}. Choose a different start number or prefix.`,
        });
      }

      let centreRecord: typeof testCentresTable.$inferSelect | undefined;
      if (centreId) {
        const [c] = await db.select().from(testCentresTable).where(and(eq(testCentresTable.id, centreId), eq(testCentresTable.tenantId, tenantId))).limit(1);
        centreRecord = c;
      }

      const refToRoll = new Map(assignments.map((a) => [a.referenceId, a.rollNumber]));
      await db.transaction(async (tx) => {
        for (const app of apps) {
          const rollNumber = refToRoll.get(app.referenceId)!;
          const centre = centreRecord?.name ?? (examCenter?.trim() ? examCenter.trim() : app.examCenter);
          await tx
            .update(applicationsTable)
            .set({
              rollNumber,
              testDate: parsedDate,
              examCenter: centre,
              testCentreId: centreRecord?.id ?? null,
              testVenue: centreRecord?.name ?? null,
              testCenterAddress: centreRecord?.address ?? null,
              testFocalPerson: centreRecord?.focalPerson ?? null,
              status: "test_scheduled",
            })
            .where(eq(applicationsTable.id, app.id));

          await tx.insert(applicationEventsTable).values({
            applicationId: app.id,
            eventType: "test_scheduled",
            title: STATUS_LABELS.test_scheduled,
            description: `Roll number ${rollNumber} issued · centre: ${centre} · test on ${parsedDate.toISOString()}.`,
          });
        }
      });

      return res.json({ updated: apps.length, assignments, notFound });
    } catch (err) {
      req.log.error({ err }, "Failed bulk schedule");
      return res.status(500).json({ error: "Failed to schedule tests" });
    }
  },
);

// ── Schedule-all: server-side pool resolution + schedule ─────────────────────
const ENTRY_TEST_PIPELINE_STATUSES = [
  "received", "under_review", "pending_verification",
  "verified", "test_scheduled", "test_taken",
];

router.post(
  "/admin/applications/schedule-all",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const parsed = ScheduleAllAdminApplicationsBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid schedule-all request" });
      }
      const { filter, testDate, centreId, rollNumberPrefix, startNumber, padding } = parsed.data;

      const parsedDate = new Date(testDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: "Invalid test date" });
      }
      const pad    = padding ?? 4;
      const prefix = rollNumberPrefix.trim();

      // ── Build WHERE condition for the applicant pool ─────────────────────
      let poolCondition;
      switch (filter) {
        case "all":
          poolCondition = inArray(applicationsTable.status, ENTRY_TEST_PIPELINE_STATUSES);
          break;
        case "received":
        case "under_review":
        case "pending_verification":
        case "verified":
          poolCondition = eq(applicationsTable.status, filter);
          break;
        case "fee_submitted":
          poolCondition = and(
            inArray(applicationsTable.status, ENTRY_TEST_PIPELINE_STATUSES),
            isNotNull(applicationsTable.feeSubmittedAt),
          );
          break;
        case "fee_confirmed":
          poolCondition = and(
            inArray(applicationsTable.status, ENTRY_TEST_PIPELINE_STATUSES),
            isNotNull(applicationsTable.feeConfirmedAt),
          );
          break;
        case "docs_all_verified":
          poolCondition = and(
            inArray(applicationsTable.status, ENTRY_TEST_PIPELINE_STATUSES),
            sql`EXISTS (SELECT 1 FROM application_documents WHERE application_id = ${applicationsTable.id})`,
            sql`NOT EXISTS (SELECT 1 FROM application_documents WHERE application_id = ${applicationsTable.id} AND status <> 'verified')`,
          );
          break;
        case "docs_any_pending":
          poolCondition = and(
            inArray(applicationsTable.status, ENTRY_TEST_PIPELINE_STATUSES),
            sql`EXISTS (SELECT 1 FROM application_documents WHERE application_id = ${applicationsTable.id} AND status = 'pending')`,
          );
          break;
        default:
          return res.status(400).json({ error: "Unknown filter value" });
      }

      const apps = await db
        .select()
        .from(applicationsTable)
        .where(and(poolCondition, eq(applicationsTable.tenantId, tenantId)))
        .orderBy(asc(applicationsTable.createdAt));

      if (apps.length === 0) {
        return res.json({ scheduled: 0 });
      }

      // ── Determine starting roll number ───────────────────────────────────
      let start = startNumber ?? undefined;
      if (start === undefined) {
        const existing = await db
          .select({ rollNumber: applicationsTable.rollNumber })
          .from(applicationsTable)
          .where(and(ilike(applicationsTable.rollNumber, `${prefix}%`), eq(applicationsTable.tenantId, tenantId)));
        let max = 0;
        for (const row of existing) {
          const rn = row.rollNumber;
          if (!rn || !rn.startsWith(prefix)) continue;
          const n = parseInt(rn.slice(prefix.length), 10);
          if (Number.isFinite(n) && n > max) max = n;
        }
        start = max + 1;
      }

      const assignments = apps.map((app, i) => ({
        referenceId: app.referenceId,
        rollNumber: `${prefix}${String((start as number) + i).padStart(pad, "0")}`,
      }));

      // Guard against collisions with roll numbers already used by OTHER apps.
      const newRolls = assignments.map((a) => a.rollNumber);
      const appIds   = new Set(apps.map((a) => a.referenceId));
      const collisions = await db
        .select({ rollNumber: applicationsTable.rollNumber, referenceId: applicationsTable.referenceId })
        .from(applicationsTable)
        .where(and(inArray(applicationsTable.rollNumber, newRolls), eq(applicationsTable.tenantId, tenantId)));
      const blocking = collisions.filter((c) => !appIds.has(c.referenceId));
      if (blocking.length > 0) {
        return res.status(400).json({
          error: `Roll number(s) already in use: ${blocking.map((c) => c.rollNumber).join(", ")}. Choose a different start number or prefix.`,
        });
      }

      let centreRecordAll: typeof testCentresTable.$inferSelect | undefined;
      if (centreId) {
        const [c] = await db.select().from(testCentresTable).where(and(eq(testCentresTable.id, centreId), eq(testCentresTable.tenantId, tenantId))).limit(1);
        centreRecordAll = c;
      }

      const refToRoll = new Map(assignments.map((a) => [a.referenceId, a.rollNumber]));
      await db.transaction(async (tx) => {
        for (const app of apps) {
          const rollNumber = refToRoll.get(app.referenceId)!;
          const centre = centreRecordAll?.name ?? app.examCenter;
          await tx
            .update(applicationsTable)
            .set({
              rollNumber,
              testDate: parsedDate,
              examCenter: centre,
              testCentreId: centreRecordAll?.id ?? null,
              testVenue: centreRecordAll?.name ?? null,
              testCenterAddress: centreRecordAll?.address ?? null,
              testFocalPerson: centreRecordAll?.focalPerson ?? null,
              status: "test_scheduled",
            })
            .where(eq(applicationsTable.id, app.id));
          await tx.insert(applicationEventsTable).values({
            applicationId: app.id,
            eventType: "test_scheduled",
            title: STATUS_LABELS.test_scheduled,
            description: `Roll number ${rollNumber} issued · centre: ${centre} · test on ${parsedDate.toISOString()}.`,
          });
        }
      });

      return res.json({ scheduled: apps.length });
    } catch (err) {
      req.log.error({ err }, "Failed schedule-all");
      return res.status(500).json({ error: "Failed to schedule tests" });
    }
  },
);

// ── Bulk: record marks for many applications ─────────────────────────────────
router.post(
  "/admin/applications/bulk/result",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const parsed = BulkRecordAdminApplicationResultBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid bulk result request" });
      }
      const { entries, status } = parsed.data;
      if (entries.some((e) => !Number.isInteger(e.marks))) {
        return res.status(400).json({ error: "Marks must be whole numbers" });
      }
      const label = STATUS_LABELS[status] ?? status;

      // Roll numbers and reference IDs are stored upper-case; normalise keys to match.
      const keys = [...new Set(entries.map((e) => e.key.toUpperCase().trim()))];
      const apps = await db
        .select()
        .from(applicationsTable)
        .where(
          and(
            or(
              inArray(applicationsTable.referenceId, keys),
              inArray(applicationsTable.rollNumber, keys),
            ),
            eq(applicationsTable.tenantId, tenantId),
          ),
        );

      const byKey = new Map<string, (typeof apps)[number]>();
      for (const app of apps) {
        byKey.set(app.referenceId.toUpperCase(), app);
        if (app.rollNumber) byKey.set(app.rollNumber.toUpperCase(), app);
      }

      const notFound: string[] = [];
      const locked: string[] = [];
      const skipped: string[] = [];
      const toUpdate: { app: (typeof apps)[number]; marks: number }[] = [];
      const seen = new Set<string>();
      for (const e of entries) {
        const app = byKey.get(e.key.toUpperCase().trim());
        if (!app) {
          notFound.push(e.key);
          continue;
        }
        if (seen.has(app.id)) continue; // first entry wins on duplicate keys
        seen.add(app.id);
        if (app.status === "enrolled") {
          locked.push(e.key);
          continue;
        }
        if (!["test_scheduled", "test_taken"].includes(app.status)) {
          skipped.push(e.key);
          continue;
        }
        toUpdate.push({ app, marks: e.marks });
      }
      if (locked.length > 0 && toUpdate.length === 0) {
        return res.status(409).json({ error: "All applicants are enrolled — records are locked", locked, notFound, skipped });
      }

      await db.transaction(async (tx) => {
        for (const { app, marks } of toUpdate) {
          await tx
            .update(applicationsTable)
            .set({ resultMarks: marks, status })
            .where(eq(applicationsTable.id, app.id));
          await tx.insert(applicationEventsTable).values({
            applicationId: app.id,
            eventType: status,
            title: label,
            description: `Marks recorded: ${marks}/100.`,
          });
        }
      });

      void syncMeritScores(toUpdate.map(({ app }) => app.id));
      return res.json({ updated: toUpdate.length, notFound, locked, skipped });
    } catch (err) {
      req.log.error({ err }, "Failed bulk result");
      return res.status(500).json({ error: "Failed to record results" });
    }
  },
);

// ── Bulk: record interview marks ──────────────────────────────────────────────
router.post(
  "/admin/applications/bulk/interview",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const parsed = BulkRecordAdminApplicationInterviewBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid bulk interview request" });
      }
      const { entries, interviewDate } = parsed.data;
      if (entries.some((e) => !Number.isInteger(e.marks))) {
        return res.status(400).json({ error: "Interview marks must be whole numbers" });
      }

      const refIds = [...new Set(entries.map((e) => e.referenceId.toUpperCase().trim()))];
      const apps = await db
        .select()
        .from(applicationsTable)
        .where(and(inArray(applicationsTable.referenceId, refIds), eq(applicationsTable.tenantId, tenantId)));

      const byRef = new Map<string, (typeof apps)[number]>();
      for (const app of apps) byRef.set(app.referenceId.toUpperCase(), app);

      const notFound: string[] = [];
      const locked: string[] = [];
      const skippedInterview: string[] = [];
      const toUpdate: { app: (typeof apps)[number]; marks: number }[] = [];
      const seen = new Set<string>();
      for (const e of entries) {
        const app = byRef.get(e.referenceId.toUpperCase().trim());
        if (!app) { notFound.push(e.referenceId); continue; }
        if (seen.has(app.id)) continue;
        seen.add(app.id);
        if (app.status === "enrolled") {
          locked.push(e.referenceId);
          continue;
        }
        if (!["test_taken", "interview_scheduled", "interview_taken"].includes(app.status)) {
          skippedInterview.push(e.referenceId);
          continue;
        }
        toUpdate.push({ app, marks: e.marks });
      }
      if (locked.length > 0 && toUpdate.length === 0) {
        return res.status(409).json({ error: "All applicants are enrolled — records are locked", locked, notFound, skipped: skippedInterview });
      }

      let passed = 0;
      let failed = 0;
      const iDate = interviewDate ? new Date(interviewDate) : new Date();

      await db.transaction(async (tx) => {
        for (const { app, marks } of toUpdate) {
          const passGate = marks >= 12;
          const newStatus = passGate ? "interview_taken" : "rejected";
          if (passGate) passed++; else failed++;

          await tx
            .update(applicationsTable)
            .set({ interviewMarks: marks, interviewDate: iDate, status: newStatus })
            .where(eq(applicationsTable.id, app.id));
          await tx.insert(applicationEventsTable).values({
            applicationId: app.id,
            eventType: newStatus,
            title: STATUS_LABELS[newStatus] ?? newStatus,
            description: passGate
              ? `Interview marks recorded: ${marks}/30. Cleared minimum threshold.`
              : `Interview marks recorded: ${marks}/30. Below minimum threshold (12/30) — not eligible.`,
          });
        }
      });

      void syncMeritScores(toUpdate.map(({ app }) => app.id));
      return res.json({ updated: toUpdate.length, passed, failed, notFound, locked, skipped: skippedInterview });
    } catch (err) {
      req.log.error({ err }, "Failed bulk interview");
      return res.status(500).json({ error: "Failed to record interview results" });
    }
  },
);

// ── Bulk: schedule interviews (assign date + venue, advance to interview_scheduled) ──

router.post(
  "/admin/applications/bulk/schedule-interview",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const parsed = BulkScheduleAdminApplicationInterviewBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid interview schedule request" });
      }
      const { referenceIds, interviewDate, venue, venueId } = parsed.data;

      const parsedDate = new Date(interviewDate);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: "Invalid interview date" });
      }

      const ids = [...new Set(referenceIds.map(r => r.toUpperCase().trim()))];
      const apps = await db
        .select({ id: applicationsTable.id, referenceId: applicationsTable.referenceId, status: applicationsTable.status })
        .from(applicationsTable)
        .where(and(inArray(applicationsTable.referenceId, ids), eq(applicationsTable.tenantId, tenantId)))
        .orderBy(asc(applicationsTable.createdAt));

      const foundRefs = new Set(apps.map(a => a.referenceId.toUpperCase()));
      const notFound  = ids.filter(id => !foundRefs.has(id));

      // Guard: only schedule applications that have completed the entry test
      const eligible = apps.filter(a => a.status === "test_taken");
      const skipped  = apps.filter(a => a.status !== "test_taken").map(a => ({ referenceId: a.referenceId, status: a.status }));

      let venueRecord: typeof testCentresTable.$inferSelect | undefined;
      if (venueId) {
        const [v] = await db.select().from(testCentresTable).where(and(eq(testCentresTable.id, venueId), eq(testCentresTable.tenantId, tenantId))).limit(1);
        venueRecord = v;
      }
      const venueText = venueRecord?.name ?? venue?.trim() ?? null;

      await db.transaction(async (tx) => {
        for (const app of eligible) {
          await tx
            .update(applicationsTable)
            .set({
              interviewDate: parsedDate,
              interviewVenue: venueText,
              interviewVenueId: venueRecord?.id ?? null,
              status: "interview_scheduled",
            })
            .where(eq(applicationsTable.id, app.id));

          await tx.insert(applicationEventsTable).values({
            applicationId: app.id,
            eventType: "interview_scheduled",
            title: STATUS_LABELS.interview_scheduled ?? "Interview Scheduled",
            description: `Interview scheduled for ${parsedDate.toLocaleDateString("en-GB")}${venueText ? ` at ${venueText}` : ""}.`,
          });
        }
      });

      return res.json({ updated: eligible.length, notFound, skipped });
    } catch (err) {
      req.log.error({ err }, "Failed bulk interview schedule");
      return res.status(500).json({ error: "Failed to schedule interviews" });
    }
  },
);

// ── Merit: weighted formula helpers ──────────────────────────────────────────

function parseAcademicPct(previousMarks: string): number {
  const pct = parseFloat(previousMarks.replace("%", "").trim());
  return isNaN(pct) || pct < 0 ? 0 : Math.min(pct, 100);
}

// ── Merit formula config defaults ─────────────────────────────────────────────
type MeritCfg = {
  academicWeight:    number;
  testWeight:        number;
  interviewWeight:   number;
  minMeritScore:     number;
};

const DEFAULT_MERIT_CFG: MeritCfg = {
  academicWeight:    20,
  testWeight:        50,
  interviewWeight:   30,
  minMeritScore:     50,
};

// Resolve config using fallback chain: (year+class) → (year) → (class) → (global) → hardcoded
async function resolveMeritConfig(classCode?: string, session?: string, tenantId?: string): Promise<MeritCfg> {
  // Look up academic year ID from session name
  let yearId: string | null = null;
  if (session?.trim()) {
    const yr = await db
      .select({ id: academicYearsTable.id })
      .from(academicYearsTable)
      .where(eq(academicYearsTable.name, session.trim()))
      .limit(1);
    if (yr.length > 0) yearId = yr[0].id;
  }

  // Tenant-scope the config lookup (fail-closed: no tenant → no custom config, use defaults).
  const all = tenantId
    ? await db.select().from(meritConfigTable).where(eq(meritConfigTable.tenantId, tenantId))
    : [];

  function pick(yearMatch: string | null, classMatch: string | null) {
    return all.find((c) => {
      const yOk = yearMatch === null ? c.academicYearId === null : c.academicYearId === yearMatch;
      const cOk = classMatch === null ? c.classCode === null : c.classCode === classMatch;
      return yOk && cOk;
    });
  }

  const cls = classCode?.trim() ?? null;
  const found =
    (yearId && cls ? pick(yearId, cls)    : undefined) ??
    (yearId        ? pick(yearId, null)   : undefined) ??
    (cls           ? pick(null, cls)      : undefined) ??
    pick(null, null);

  if (!found) return { ...DEFAULT_MERIT_CFG };
  return {
    academicWeight:    found.academicWeight,
    testWeight:        found.testWeight,
    interviewWeight:   found.interviewWeight,
    minMeritScore:     found.minMeritScore,
  };
}

function computeScores(app: typeof applicationsTable.$inferSelect, cfg: MeritCfg = DEFAULT_MERIT_CFG) {
  const academicScore = Math.round((parseAcademicPct(app.previousMarks) / 100) * cfg.academicWeight * 10) / 10;
  const testScore     = app.resultMarks !== null && app.resultMarks !== undefined
    ? Math.round((app.resultMarks / 100) * cfg.testWeight * 10) / 10
    : null;
  const interviewScore = app.interviewMarks ?? null;
  const meritScore = Math.round((academicScore + (testScore ?? 0) + (interviewScore ?? 0)) * 10) / 10;
  const eligible = meritScore >= cfg.minMeritScore;
  return { academicScore, testScore, interviewScore, meritScore, eligible };
}

// Re-computes meritScore from the latest DB values and persists it back.
// Fire-and-forget: call with `void syncMeritScore(id)` — all errors are logged and swallowed.
async function syncMeritScore(appId: string): Promise<void> {
  try {
    const [app] = await db
      .select({
        previousMarks:  applicationsTable.previousMarks,
        resultMarks:    applicationsTable.resultMarks,
        interviewMarks: applicationsTable.interviewMarks,
        classApplying:  applicationsTable.classApplying,
        session:        applicationsTable.session,
        tenantId:       applicationsTable.tenantId,
      })
      .from(applicationsTable)
      .where(eq(applicationsTable.id, appId))
      .limit(1);
    if (!app) return;

    const cfg = await resolveMeritConfig(
      app.classApplying ?? undefined,
      app.session ?? undefined,
      app.tenantId ?? undefined,
    );
    const { meritScore } = computeScores(app as typeof applicationsTable.$inferSelect, cfg);

    await db
      .update(applicationsTable)
      .set({ meritScore })
      .where(eq(applicationsTable.id, appId));
  } catch (err) {
    logger.error({ err, appId }, "syncMeritScore failed");
  }
}

// Batch variant with limited concurrency. A naive Promise.all over hundreds of
// applications fires 2-3 queries each simultaneously, saturating the DB pool
// and stalling every other request. Fire-and-forget: call with `void syncMeritScores(ids)`.
async function syncMeritScores(appIds: string[], concurrency = 3): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, appIds.length) }, async () => {
    while (i < appIds.length) {
      const id = appIds[i++];
      await syncMeritScore(id);
    }
  });
  await Promise.all(workers);
}

// Bulk-recalculate and persist merit scores for every application in the tenant.
// Idempotent — safe to call repeatedly. Returns immediately; syncs run concurrently.
router.post("/admin/applications/recalculate-merit", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const apps = await db
      .select({ id: applicationsTable.id })
      .from(applicationsTable)
      .where(eq(applicationsTable.tenantId, tenantId));
    void syncMeritScores(apps.map(a => a.id));
    return res.json({ recalculating: apps.length });
  } catch (err) {
    req.log.error({ err }, "recalculate-merit failed");
    return res.status(500).json({ error: "Failed to recalculate merit scores" });
  }
});

// ── Merit: rank candidates by weighted score against seat capacity ────────────
async function rankMeritCandidates(
  seats: number,
  classApplying: string | undefined,
  session: string | undefined,
  tenantId: string,
) {
  const cfg = await resolveMeritConfig(classApplying, session, tenantId);

  // tenantId is mandatory: the pool is ALWAYS scoped to one tenant (fail-closed).
  // Partial candidates (missing test/interview marks) are included; computeScores treats them as 0.
  const conds = [
    eq(applicationsTable.tenantId, tenantId),
  ];
  if (classApplying?.trim())
    conds.push(eq(applicationsTable.classApplying, classApplying.trim()));
  if (session?.trim()) conds.push(eq(applicationsTable.session, session.trim()));

  const apps = await db
    .select()
    .from(applicationsTable)
    .where(and(...conds))
    .orderBy(asc(applicationsTable.createdAt));

  // Compute scores, separate eligible from ineligible
  const scored = apps.map((a) => ({ app: a, ...computeScores(a, cfg) }));
  const eligible   = scored.filter((s) => s.eligible);
  const ineligible = scored.filter((s) => !s.eligible);

  // Sort eligible by merit score desc, then earliest application first (tie-break)
  eligible.sort((a, b) => (b.meritScore - a.meritScore) || (a.app.createdAt.getTime() - b.app.createdAt.getTime()));
  // Sort ineligible the same way so partial candidates rank among themselves
  ineligible.sort((a, b) => (b.meritScore - a.meritScore) || (a.app.createdAt.getTime() - b.app.createdAt.getTime()));

  const ranked = [
    ...eligible.map((s, i) => ({
      app: s.app,
      rank: i + 1,
      decision: (i < seats ? "admitted" : "waitlisted") as "admitted" | "waitlisted" | "rejected",
      academicScore: s.academicScore,
      testScore: s.testScore ?? 0,
      interviewScore: s.interviewScore ?? 0,
      meritScore: s.meritScore,
      eligible: true,
      cfg,
    })),
    ...ineligible.map((s, i) => ({
      app: s.app,
      rank: eligible.length + i + 1,
      decision: "rejected" as "admitted" | "waitlisted" | "rejected",
      academicScore: s.academicScore,
      testScore: s.testScore ?? 0,
      interviewScore: s.interviewScore ?? 0,
      meritScore: s.meritScore,
      eligible: false,
      cfg,
    })),
  ];

  return ranked;
}

// ── Merit Config CRUD ─────────────────────────────────────────────────────────

router.get("/admin/merit-config", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const configs = await db
      .select({
        id: meritConfigTable.id,
        academicYearId: meritConfigTable.academicYearId,
        academicYearName: academicYearsTable.name,
        classCode: meritConfigTable.classCode,
        academicWeight: meritConfigTable.academicWeight,
        testWeight: meritConfigTable.testWeight,
        interviewWeight: meritConfigTable.interviewWeight,
        minMeritScore: meritConfigTable.minMeritScore,
        notes: meritConfigTable.notes,
        createdAt: meritConfigTable.createdAt,
        updatedAt: meritConfigTable.updatedAt,
      })
      .from(meritConfigTable)
      .leftJoin(academicYearsTable, eq(meritConfigTable.academicYearId, academicYearsTable.id))
      .where(eq(meritConfigTable.tenantId, tenantId))
      .orderBy(asc(meritConfigTable.createdAt));
    return res.json(configs.map(c => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list merit configs");
    return res.status(500).json({ error: "Failed to list merit configs" });
  }
});

router.post("/admin/merit-config", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const parsed = CreateAdminMeritConfigBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid merit config" });
    const { academicYearId, classCode, academicWeight, testWeight, interviewWeight,
            minMeritScore, notes } = parsed.data;
    if (academicWeight + testWeight + interviewWeight !== 100) {
      return res.status(400).json({ error: "Weights must sum to 100" });
    }
    const [row] = await db
      .insert(meritConfigTable)
      .values({ tenantId, academicYearId: academicYearId ?? null, classCode: classCode ?? null,
                academicWeight: Number(academicWeight), testWeight: Number(testWeight), interviewWeight: Number(interviewWeight),
                minMeritScore: Number(minMeritScore), notes: notes ?? null } as any)
      .returning();
    // Fetch with year name
    const [full] = await db
      .select({
        id: meritConfigTable.id,
        academicYearId: meritConfigTable.academicYearId,
        academicYearName: academicYearsTable.name,
        classCode: meritConfigTable.classCode,
        academicWeight: meritConfigTable.academicWeight,
        testWeight: meritConfigTable.testWeight,
        interviewWeight: meritConfigTable.interviewWeight,
        minMeritScore: meritConfigTable.minMeritScore,
        notes: meritConfigTable.notes,
        createdAt: meritConfigTable.createdAt,
        updatedAt: meritConfigTable.updatedAt,
      })
      .from(meritConfigTable)
      .leftJoin(academicYearsTable, eq(meritConfigTable.academicYearId, academicYearsTable.id))
      .where(eq(meritConfigTable.id, row.id));
    return res.status(201).json({ ...full, createdAt: full.createdAt.toISOString(), updatedAt: full.updatedAt.toISOString() });
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "A config already exists for that year + class combination" });
    req.log.error({ err }, "Failed to create merit config");
    return res.status(500).json({ error: "Failed to create merit config" });
  }
});

router.put("/admin/merit-config/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const parsed = UpdateAdminMeritConfigBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid merit config" });
    const { academicYearId, classCode, academicWeight, testWeight, interviewWeight,
            minMeritScore, notes } = parsed.data;
    if (academicWeight + testWeight + interviewWeight !== 100) {
      return res.status(400).json({ error: "Weights must sum to 100" });
    }
    const [row] = await db
      .update(meritConfigTable)
      .set({ academicYearId: academicYearId ?? null, classCode: classCode ?? null,
             academicWeight: Number(academicWeight), testWeight: Number(testWeight), interviewWeight: Number(interviewWeight),
             minMeritScore: Number(minMeritScore), notes: notes ?? null } as any)
      .where(and(eq(meritConfigTable.id, String(req.params.id)), eq(meritConfigTable.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Merit config not found" });
    const [full] = await db
      .select({
        id: meritConfigTable.id,
        academicYearId: meritConfigTable.academicYearId,
        academicYearName: academicYearsTable.name,
        classCode: meritConfigTable.classCode,
        academicWeight: meritConfigTable.academicWeight,
        testWeight: meritConfigTable.testWeight,
        interviewWeight: meritConfigTable.interviewWeight,
        minMeritScore: meritConfigTable.minMeritScore,
        notes: meritConfigTable.notes,
        createdAt: meritConfigTable.createdAt,
        updatedAt: meritConfigTable.updatedAt,
      })
      .from(meritConfigTable)
      .leftJoin(academicYearsTable, eq(meritConfigTable.academicYearId, academicYearsTable.id))
      .where(eq(meritConfigTable.id, row.id));
    return res.json({ ...full, createdAt: full.createdAt.toISOString(), updatedAt: full.updatedAt.toISOString() });
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "A config already exists for that year + class combination" });
    req.log.error({ err }, "Failed to update merit config");
    return res.status(500).json({ error: "Failed to update merit config" });
  }
});

router.delete("/admin/merit-config/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const [row] = await db
      .delete(meritConfigTable)
      .where(and(eq(meritConfigTable.id, String(req.params.id)), eq(meritConfigTable.tenantId, tenantId)))
      .returning({ id: meritConfigTable.id });
    if (!row) return res.status(404).json({ error: "Merit config not found" });
    return res.json({ deleted: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete merit config");
    return res.status(500).json({ error: "Failed to delete merit config" });
  }
});

router.post(
  "/admin/applications/merit/preview",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const parsed = PreviewAdminMeritListBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid merit request" });
      }
      const { seats, classApplying, session, mode = "formula" } = parsed.data;
      if (!Number.isInteger(seats)) {
        return res.status(400).json({ error: "Seats must be a whole number" });
      }
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;

      if (mode === "all") {
        const conds = [eq(applicationsTable.tenantId, tenantId)];
        if (classApplying?.trim()) conds.push(eq(applicationsTable.classApplying, classApplying.trim()));
        if (session?.trim()) conds.push(eq(applicationsTable.session, session.trim()));
        const apps = await db
          .select()
          .from(applicationsTable)
          .where(and(...conds))
          .orderBy(asc(applicationsTable.createdAt));
        const candidates = apps.map((app, i) => ({
          referenceId: app.referenceId,
          rollNumber: app.rollNumber,
          name: app.fullName,
          classApplying: app.classApplying,
          resultMarks: app.resultMarks,
          rank: i + 1,
        }));
        return res.json({ seats, totalRanked: candidates.length, admitted: candidates.length, waitlisted: 0, candidates });
      }

      const ranked = await rankMeritCandidates(seats, classApplying, session, tenantId);
      const candidates = ranked.map(({ app, rank, decision, academicScore, testScore, interviewScore, meritScore, eligible }) => ({
        referenceId: app.referenceId,
        rollNumber: app.rollNumber,
        name: app.fullName,
        classApplying: app.classApplying,
        resultMarks: app.resultMarks,
        academicScore,
        testScore,
        interviewScore,
        meritScore,
        rank,
        eligible,
        decision,
      }));
      const admittedCount  = candidates.filter((c) => c.decision === "admitted").length;
      const waitlistedCount = candidates.filter((c) => c.decision === "waitlisted").length;
      return res.json({ seats, totalRanked: candidates.length, admitted: admittedCount, waitlisted: waitlistedCount, candidates });
    } catch (err) {
      req.log.error({ err }, "Failed merit preview");
      return res.status(500).json({ error: "Failed to build merit list" });
    }
  },
);

router.post(
  "/admin/applications/merit/commit",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const parsed = CommitAdminMeritListBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid merit request" });
      }
      const { seats, classApplying, session, rejectRemaining, mode = "formula" } = parsed.data;
      if (!Number.isInteger(seats)) {
        return res.status(400).json({ error: "Seats must be a whole number" });
      }
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;

      if (mode === "all") {
        const conds = [eq(applicationsTable.tenantId, tenantId)];
        if (classApplying?.trim()) conds.push(eq(applicationsTable.classApplying, classApplying.trim()));
        if (session?.trim()) conds.push(eq(applicationsTable.session, session.trim()));
        const apps = await db
          .select()
          .from(applicationsTable)
          .where(and(...conds))
          .orderBy(asc(applicationsTable.createdAt));
        let admittedCount = 0;
        await db.transaction(async (tx) => {
          for (const app of apps) {
            if (app.status !== "admitted") {
              admittedCount++;
              await tx
                .update(applicationsTable)
                .set({ status: "admitted" })
                .where(eq(applicationsTable.id, app.id));
              await tx.insert(applicationEventsTable).values({
                applicationId: app.id,
                eventType: "admitted",
                title: STATUS_LABELS.admitted,
                description: "Qualified via All Candidates merit list.",
              });
            }
          }
        });
        return res.json({ admitted: admittedCount, rejected: 0 });
      }

      const ranked = await rankMeritCandidates(seats, classApplying, session, tenantId);

      let admittedCount = 0;
      let rejectedCount = 0;
      await db.transaction(async (tx) => {
        for (const { app, rank, decision, meritScore } of ranked) {
          if (decision === "admitted") {
            admittedCount++;
            if (app.status !== "admitted") {
              await tx
                .update(applicationsTable)
                .set({ status: "admitted", meritScore: Math.round(meritScore) })
                .where(eq(applicationsTable.id, app.id));
              await tx.insert(applicationEventsTable).values({
                applicationId: app.id,
                eventType: "admitted",
                title: STATUS_LABELS.admitted,
                description: `Selected on merit (rank ${rank}, merit score ${meritScore}/100).`,
              });
            }
          } else if (decision === "waitlisted") {
            if (app.status !== "on_hold") {
              await tx
                .update(applicationsTable)
                .set({ status: "on_hold", meritScore: Math.round(meritScore) })
                .where(eq(applicationsTable.id, app.id));
              await tx.insert(applicationEventsTable).values({
                applicationId: app.id,
                eventType: "on_hold",
                title: STATUS_LABELS.on_hold,
                description: `Waitlisted on merit (rank ${rank}, merit score ${meritScore}/100).`,
              });
            }
          } else if (rejectRemaining) {
            rejectedCount++;
            if (app.status !== "rejected") {
              await tx
                .update(applicationsTable)
                .set({ status: "rejected", meritScore: Math.round(meritScore) })
                .where(eq(applicationsTable.id, app.id));
              await tx.insert(applicationEventsTable).values({
                applicationId: app.id,
                eventType: "rejected",
                title: STATUS_LABELS.rejected,
                description: `Not selected on merit (rank ${rank}, merit score ${meritScore}/100).`,
              });
            }
          }
        }
      });

      return res.json({ admitted: admittedCount, rejected: rejectedCount });
    } catch (err) {
      req.log.error({ err }, "Failed merit commit");
      return res.status(500).json({ error: "Failed to apply merit list" });
    }
  },
);

// ── Merit: announce results (interview_taken → result_announced) ──────────────

router.post(
  "/admin/applications/merit/announce",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { classApplying, session } = req.body as { classApplying?: string; session?: string };

      const announceTenantId = requireTenant(req, res);
      if (!announceTenantId) return;
      const conds: ReturnType<typeof eq>[] = [
        eq(applicationsTable.status, "interview_taken"),
        eq(applicationsTable.tenantId, announceTenantId),
      ];
      if (classApplying?.trim()) conds.push(eq(applicationsTable.classApplying, classApplying.trim()));
      if (session?.trim())       conds.push(eq(applicationsTable.session, session.trim()));

      const apps = await db
        .select({ id: applicationsTable.id, referenceId: applicationsTable.referenceId })
        .from(applicationsTable)
        .where(and(...conds));

      if (apps.length === 0) return res.json({ announced: 0 });

      await db.transaction(async (tx) => {
        for (const app of apps) {
          await tx
            .update(applicationsTable)
            .set({ status: "result_announced" })
            .where(eq(applicationsTable.id, app.id));
          await tx.insert(applicationEventsTable).values({
            applicationId: app.id,
            eventType: "result_announced",
            title: STATUS_LABELS.result_announced ?? "Result Announced",
            description: "Admission results have been announced. Please log in to the candidate portal to view your status.",
          });
        }
      });

      return res.json({ announced: apps.length });
    } catch (err) {
      req.log.error({ err }, "Failed merit announce");
      return res.status(500).json({ error: "Failed to announce results" });
    }
  },
);

// ── Append a timeline note/event ─────────────────────────────────────────────
router.post(
  "/admin/applications/:referenceId/events",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const parsed = AddAdminApplicationEventBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid event" });
      }
      const referenceId = String(req.params.referenceId).toUpperCase().trim();
      const { title, description } = parsed.data;

      const [app] = await db
        .select()
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);

      if (!app) {
        return res.status(404).json({ error: "Application not found" });
      }

      await db.insert(applicationEventsTable).values({
        applicationId: app.id,
        eventType: "note",
        title: title.trim(),
        description: description?.trim() ? description.trim() : null,
      });

      return res.json(await serializeApplicationDetail(app));
    } catch (err) {
      req.log.error({ err }, "Failed to add application event");
      return res.status(500).json({ error: "Failed to add event" });
    }
  },
);

// ── Shared helpers for purpose-tagged template rendering ─────────────────────

/**
 * Returns the active custom template for a purpose slug, or — if no template is
 * assigned to that purpose — the first fallback template type that has saved
 * (non-empty) content. Returns null when neither exists.
 */
async function resolveTemplateByPurpose(
  tenantId: string,
  purpose: string,
  fallbackTypes: string[] = [],
): Promise<typeof printTemplatesTable.$inferSelect | null> {
  const [tpl] = await db
    .select()
    .from(printTemplatesTable)
    .where(and(
      eq(printTemplatesTable.tenantId, tenantId),
      eq(printTemplatesTable.purpose, purpose),
      ne(printTemplatesTable.content, ""),
    ))
    .limit(1);
  if (tpl) return tpl;
  for (const type of fallbackTypes) {
    const [fallback] = await db
      .select()
      .from(printTemplatesTable)
      .where(and(
        eq(printTemplatesTable.tenantId, tenantId),
        eq(printTemplatesTable.type, type),
        ne(printTemplatesTable.content, ""),
      ))
      .limit(1);
    if (fallback) return fallback;
  }
  return null;
}
/** Escape HTML special characters so user-provided data cannot inject markup. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Tags whose values are intentionally raw HTML (built server-side from escaped parts). */
const RAW_HTML_TAG_KEYS = new Set(["student_photo", "signature", "stamp"]);

/** True when a tag's value is trusted raw HTML built server-side. */
function isRawHtmlTag(key: string): boolean {
  return RAW_HTML_TAG_KEYS.has(key) || key.startsWith("sig_") || key.startsWith("stamp_");
}

/**
 * Renders a student/employee photo tag as a fixed-size box (passport-photo
 * proportions) with the image cropped-to-fit inside it via `object-fit:
 * cover`. Wrapping in a fixed-dimension container (rather than `width:100%;
 * height:100%` directly on the <img>) is required — without it the image's
 * percentage sizing resolves against whatever ambient block width surrounds
 * the merged tag (often the full page/table-cell width), which is what
 * caused photos to render hugely stretched/distorted in printed documents.
 */
function photoImgTag(url: string | null | undefined): string {
  if (!url) return "";
  return `<span style="display:inline-block;width:110px;height:140px;overflow:hidden;vertical-align:middle;line-height:0;"><img src="${escapeHtml(url)}" style="width:100%;height:100%;object-fit:cover;display:block;" /></span>`;
}

/**
 * Builds the signature/stamp tag map for a tenant, mirroring the Printing
 * module's convention: {{sig_<name>}} / {{stamp_<name>}} per uploaded entry,
 * plus generic {{signature}} / {{stamp}} aliases resolving to the first entry
 * of each type (empty string when none exist, so the tag disappears cleanly).
 */
async function buildSignatureTags(tenantId: string): Promise<Record<string, string>> {
  const rows = await db
    .select()
    .from(printSignaturesTable)
    .where(eq(printSignaturesTable.tenantId, tenantId))
    .orderBy(printSignaturesTable.createdAt);
  const tags: Record<string, string> = { signature: "", stamp: "" };
  for (const s of rows) {
    const isStamp = s.type === "stamp";
    const img = `<img src="${escapeHtml(s.url)}" style="max-height:${isStamp ? "70px" : "50px"};vertical-align:middle;display:inline-block;" alt="${escapeHtml(s.label)}" />`;
    tags[`${isStamp ? "stamp" : "sig"}_${s.name}`] = img;
    const alias = isStamp ? "stamp" : "signature";
    if (!tags[alias]) tags[alias] = img;
  }
  return tags;
}

/** Renders one page of a custom template with the given tag values. */
function renderTemplatePage(tpl: typeof printTemplatesTable.$inferSelect, values: Record<string, string>): string {
  const PAGE_PX: Record<string, { w: number; h: number }> = {
    A4: { w: 794, h: 1123 }, A5: { w: 559, h: 794 },
    Letter: { w: 816, h: 1056 }, A3: { w: 1123, h: 1587 },
  };
  const dims = PAGE_PX[tpl.pageSize] ?? { w: 794, h: 1123 };
  const isL = tpl.orientation === "landscape";
  const pw = isL ? dims.h : dims.w;
  const ptop = Math.round(tpl.marginTop    * 3.78);
  const prt  = Math.round(tpl.marginRight  * 3.78);
  const pbot = Math.round(tpl.marginBottom * 3.78);
  const plt  = Math.round(tpl.marginLeft   * 3.78);
  // Rendered as a separate layer BEHIND the content (not as the page's own
  // `background-image`, so it stacks cleanly under the text instead of
  // competing with the page's own background color/paint order).
  const bgLayer = tpl.bgImageUrl
    ? `<div style="position:absolute;inset:0;background-image:url('${escapeHtml(tpl.bgImageUrl)}');background-size:cover;background-position:center;pointer-events:none;"></div>`
    : "";
  let body = tpl.content;
  // Escape every merged value (applicant data is user-controlled) except the
  // explicit raw-HTML allowlist (e.g. the photo <img> tag, which is built
  // server-side with an escaped URL).
  const safeValues: Array<[string, string]> = Object.entries(values).map(
    ([k, v]) => [k, isRawHtmlTag(k) ? v : escapeHtml(v)],
  );
  for (const [k, v] of safeValues) {
    body = body.split(`{{${k}}}`).join(v);
  }
  // Some hand-authored templates use single-brace tags ({name} instead of
  // {{name}}). Fill those too, but only for known tag names — never strip
  // unknown single-brace text, since braces can appear in ordinary content.
  for (const [k, v] of safeValues) {
    body = body.split(`{${k}}`).join(v);
  }
  body = body.replace(/\{\{[^}]+\}\}/g, "");
  return `<div class="page" style="width:${pw}px;padding:${ptop}px ${prt}px ${pbot}px ${plt}px;box-sizing:border-box;page-break-after:always;position:relative;">${bgLayer}<div style="position:relative;">${body}</div></div>`;
}

/** Wraps rendered pages in a complete HTML document with auto-print. */
function buildHtmlDocument(tpl: typeof printTemplatesTable.$inferSelect, pages: string[]): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@media print{@page{margin:0;size:${tpl.pageSize} ${tpl.orientation}}body{margin:0}.page{page-break-after:always}}
body{font-family:Arial,sans-serif;margin:0}table{border-collapse:collapse}
</style></head><body>${pages.join("")}<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};</script></body></html>`;
}

// ── Bulk admit-card PDF ──────────────────────────────────────────────────────
// Generates a single PDF with one admit card per page for every applicant that
// matches the given filters AND has a roll number assigned. Filters mirror the
// applications list (status, classApplying, session, examCenter).
router.get(
  "/admin/admit-cards.pdf",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const status =
        typeof req.query.status === "string" ? req.query.status.trim() : "";
      const classApplying =
        typeof req.query.classApplying === "string"
          ? req.query.classApplying.trim()
          : "";
      const session =
        typeof req.query.session === "string" ? req.query.session.trim() : "";
      const examCenter =
        typeof req.query.examCenter === "string"
          ? req.query.examCenter.trim()
          : "";

      const admitCardTenantId = requireTenant(req, res);
      if (!admitCardTenantId) return;
      const conditions = [
        sql`${applicationsTable.rollNumber} IS NOT NULL`,
        eq(applicationsTable.tenantId, admitCardTenantId),
      ];
      if (status) conditions.push(eq(applicationsTable.status, status));
      if (classApplying)
        conditions.push(eq(applicationsTable.classApplying, classApplying));
      if (session) conditions.push(eq(applicationsTable.session, session));
      if (examCenter)
        conditions.push(eq(applicationsTable.examCenter, examCenter));

      const rows = await db
        .select()
        .from(applicationsTable)
        .where(and(...conditions))
        .orderBy(asc(applicationsTable.rollNumber));

      if (rows.length === 0) {
        return res.status(404).json({
          error: "No applicants with a roll number match these filters",
        });
      }

      // Look up centres so we can enrich each card with venue address/contact.
      const centres = await db.select().from(testCentresTable).where(eq(testCentresTable.tenantId, admitCardTenantId));
      const centreByName = new Map(
        centres.map((c) => [c.name.toLowerCase(), c]),
      );

      // ── Prefer a custom template: purpose-assigned first, then the saved
      //    built-in "admit-card" template type ────────────────────────────────
      const admitCardTpl = await resolveTemplateByPurpose(admitCardTenantId, "admit-card-entry-test", ["admit-card"]);
      if (admitCardTpl) {
        const [[tenantRow], sigTags] = await Promise.all([
          db.select({ name: tenantsTable.name }).from(tenantsTable).where(eq(tenantsTable.id, admitCardTenantId)).limit(1),
          buildSignatureTags(admitCardTenantId),
        ]);
        const schoolName = tenantRow?.name ?? "Cadet College Murree";
        const issueDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
        const pages = rows.map(app => {
          const centre = centreByName.get((app.examCenter || "").toLowerCase());
          const examDateStr = app.testDate
            ? new Date(app.testDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
            : "";
          const photoUrl = app.photoFilename;
          const fullName = (app.fullName ?? "").toUpperCase();
          return renderTemplatePage(admitCardTpl, {
            ...sigTags,
            serial_no:                      app.rollNumber ?? "",
            roll_no:                        app.rollNumber ?? "",
            roll_number:                    app.rollNumber ?? "",
            applicant_id:                   app.referenceId ?? "",
            student_name:                   fullName,
            name:                           fullName,
            father_name:                    String(app.fatherName ?? app.guardianName ?? ""),
            class:                          app.classApplying ?? "",
            session:                        app.session ?? "",
            date_of_birth:                  app.dateOfBirth ?? "",
            mobile_no:                      String(app.guardianMobile || app.studentMobile || ""),
            mobileno:                       String(app.guardianMobile || app.studentMobile || ""),
            phone:                          String(app.guardianMobile || app.studentMobile || ""),
            email:                          app.studentEmail ?? "",
            city:                           app.city ?? "",
            present_address:                String(app.presentAddress ?? ""),
            test_city:                      app.examCenter ?? "",
            test_center_name:               centre?.name ?? app.testVenue ?? app.examCenter ?? "",
            test_center_address:            centre?.address ?? app.testCenterAddress ?? "",
            test_focal_person_phone_number: centre?.contact ?? app.testFocalPerson ?? "",
            exam_date:                      examDateStr,
            student_photo:                  photoImgTag(photoUrl),
            issue_date:                     issueDate,
            school_name:                    schoolName,
          });
        });
        const htmlFilename = `admit-cards-${new Date().toISOString().slice(0, 10)}.html`;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${htmlFilename}"`);
        return res.send(buildHtmlDocument(admitCardTpl, pages));
      }

      // ── Fall back to built-in PDFKit design ───────────────────────────────
      const filename = `admit-cards-${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );

      const doc = new PDFDocument({ size: "A4", margin: 40 });

      // Guard against stream-time failures (after headers are flushed): log and
      // tear down the response cleanly rather than leaving it hanging.
      doc.on("error", (streamErr) => {
        req.log.error({ err: streamErr }, "Admit-card PDF stream errored");
        if (!res.writableEnded) res.end();
      });
      res.on("error", (resErr) => {
        req.log.error({ err: resErr }, "Admit-card PDF response errored");
      });

      doc.pipe(res);

      rows.forEach((app, idx) => {
        if (idx > 0) doc.addPage();
        const centre = centreByName.get((app.examCenter || "").toLowerCase());
        drawAdmitCard(doc, app, centre);
      });

      doc.end();
      return;
    } catch (err) {
      req.log.error({ err }, "Failed to generate admit cards");
      if (!res.headersSent) {
        return res.status(500).json({ error: "Failed to generate admit cards" });
      }
      return res.end();
    }
  },
);

// ── Offer Letters PDF ─────────────────────────────────────────────────────────
router.get(
  "/admin/offer-letters.pdf",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;

      const classApplying =
        typeof req.query.classApplying === "string" ? req.query.classApplying.trim() : "";

      const conditions = [
        eq(applicationsTable.tenantId, tenantId),
        or(
          eq(applicationsTable.status, "admitted"),
          eq(applicationsTable.status, "on_hold"),
        )!,
      ];
      if (classApplying) conditions.push(eq(applicationsTable.classApplying, classApplying));

      const [rows, tenantRows] = await Promise.all([
        db
          .select()
          .from(applicationsTable)
          .where(and(...conditions))
          .orderBy(asc(applicationsTable.classApplying), asc(applicationsTable.fullName)),
        db.select({ name: tenantsTable.name }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1),
      ]);

      if (rows.length === 0) {
        return res.status(404).json({ error: "No qualified applicants found for offer letters" });
      }

      const schoolName = tenantRows[0]?.name ?? "Cadet College Murree";
      const issueDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

      // ── Prefer a custom template: purpose-assigned first, then the saved
      //    built-in "offer-letter-applicant" template type ─────────────────────
      const offerTpl = await resolveTemplateByPurpose(tenantId, "offer-letter-applicants", ["offer-letter-applicant"]);
      if (offerTpl) {
        const sigTags = await buildSignatureTags(tenantId);
        const pages = rows.map(app => {
          const classLabel = (app.classApplying ?? "").replace(/^Class\s+/i, "");
          const fullName = (app.fullName ?? "").toUpperCase();
          const examDateStr = app.testDate
            ? new Date(app.testDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
            : "";
          return renderTemplatePage(offerTpl, {
            ...sigTags,
            student_name:     fullName,
            name:             fullName,
            father_name:      String(app.fatherName ?? app.guardianName ?? "").toUpperCase(),
            applicant_id:        String(app.referenceId ?? app.id ?? ""),
            roll_no:          app.rollNumber ?? "",
            roll_number:      app.rollNumber ?? "",
            class:            classLabel,
            section:          "",
            session:          String(app.session ?? ""),
            date_of_birth:    app.dateOfBirth ?? "",
            mobile_no:        String(app.guardianMobile || app.studentMobile || ""),
            phone:            String(app.guardianMobile || app.studentMobile || ""),
            email:            app.studentEmail ?? "",
            city:             app.city ?? "",
            present_address:  String(app.presentAddress ?? ""),
            exam_date:        examDateStr,
            test_city:        app.examCenter ?? "",
            test_center_name: app.testVenue ?? app.examCenter ?? "",
            merit_score:      app.meritScore != null ? String(app.meritScore) : "",
            student_photo:    photoImgTag(app.photoFilename),
            school_name:      schoolName,
            reporting_date:   String((app as any).joiningDate ?? ""),
            hostel_block:     "",
            fee_amount:       "",
            issue_date:       issueDate,
          });
        });
        const htmlFilename = `offer-letters-${new Date().toISOString().slice(0, 10)}.html`;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${htmlFilename}"`);
        return res.send(buildHtmlDocument(offerTpl, pages));
      }

      // ── Fall back to built-in PDFKit design ───────────────────────────────
      const filename = `offer-letters-${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      const doc = new PDFDocument({ size: "A4", margin: 50 });
      doc.on("error", (err) => {
        req.log.error({ err }, "Offer-letter PDF stream errored");
        if (!res.writableEnded) res.end();
      });
      res.on("error", (err) => { req.log.error({ err }, "Offer-letter response errored"); });
      doc.pipe(res);

      rows.forEach((app, idx) => {
        if (idx > 0) doc.addPage();
        drawOfferLetter(doc, app, schoolName, issueDate);
      });

      doc.end();
      return;
    } catch (err) {
      req.log.error({ err }, "Failed to generate offer letters");
      if (!res.headersSent) return res.status(500).json({ error: "Failed to generate offer letters" });
      return res.end();
    }
  },
);

function drawOfferLetter(
  doc: PDFKit.PDFDocument,
  app: typeof applicationsTable.$inferSelect,
  schoolName: string,
  issueDate: string,
) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const green = "#064A1A";
  const accent = "#0d9488";
  const gray = "#6b7280";
  const dark = "#111827";

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.font("Helvetica-Bold").fontSize(18).fillColor(green)
     .text(schoolName.toUpperCase(), left, doc.y, { align: "center", width });
  doc.font("Helvetica").fontSize(9).fillColor(gray)
     .text("ADMISSION OFFER LETTER", { align: "center", width, characterSpacing: 1.2 });
  doc.moveDown(0.5);
  doc.strokeColor(accent).lineWidth(2).moveTo(left, doc.y).lineTo(right, doc.y).stroke();
  doc.moveDown(0.8);

  // ── Date & Reference ───────────────────────────────────────────────────────
  doc.font("Helvetica").fontSize(11).fillColor(dark)
     .text(`Date: ${issueDate}`, left, doc.y)
     .text(`Ref: ${app.referenceId}`, { align: "right", width });
  doc.moveDown(0.6);

  // ── Addressee ──────────────────────────────────────────────────────────────
  const studentName = app.fullName ?? "";
  const fatherName  = app.fatherName ?? app.guardianName ?? "";
  doc.font("Helvetica").fontSize(11).fillColor(dark);
  doc.text("To:", left, doc.y);
  doc.text("The Parent / Guardian of", { indent: 16 });
  doc.font("Helvetica-Bold").text(studentName, { indent: 16 });
  if (fatherName) doc.font("Helvetica").text(`S/O  ${fatherName}`, { indent: 16 });
  doc.moveDown(0.8);

  // ── Subject ────────────────────────────────────────────────────────────────
  doc.font("Helvetica-Bold").fontSize(12).fillColor(dark)
     .text("Subject: Offer of Admission", { underline: true });
  doc.moveDown(0.6);

  // ── Body ───────────────────────────────────────────────────────────────────
  const classLabel = (app.classApplying ?? "").replace(/^class[- ]*/i, "Class ");
  const session    = app.session ?? new Date().getFullYear().toString();
  const applicantId   = app.referenceId;

  doc.font("Helvetica").fontSize(11).fillColor(dark)
     .text("Dear Parent / Guardian,", left, doc.y)
     .moveDown(0.5)
     .text(
       `We are pleased to inform you that `,
       { continued: true }
     )
     .font("Helvetica-Bold").text(studentName, { continued: true })
     .font("Helvetica").text(
       ` (Ref. No. ${applicantId}) has been selected for admission to `,
       { continued: true }
     )
     .font("Helvetica-Bold").text(schoolName, { continued: true })
     .font("Helvetica").text(
       ` for the academic session ${session}. The details of the offered seat are as follows:`,
     )
     .moveDown(0.8);

  // ── Details table ──────────────────────────────────────────────────────────
  const labelW = 170;
  const rowH   = 24;
  const items: [string, string][] = [
    ["Class / Program", classLabel || "—"],
    ["Academic Session", session],
    ["Applicant Name", studentName || "—"],
    ["Father / Guardian", fatherName || "—"],
    ["Date of Birth", app.dateOfBirth || "—"],
    ["Reference ID", app.referenceId],
    ["Contact", app.guardianMobile || app.studentMobile || "—"],
    ["Reporting Date", "As per college notice"],
  ];

  let y = doc.y;
  doc.fontSize(10.5);
  for (const [k, v] of items) {
    doc.rect(left, y, labelW, rowH).fillAndStroke("#f0fdf4", "#d1d5db");
    doc.rect(left + labelW, y, width - labelW, rowH).fillAndStroke("#ffffff", "#d1d5db");
    doc.fillColor(green).font("Helvetica-Bold").text(k, left + 6, y + 6, { width: labelW - 12 });
    doc.fillColor(dark).font("Helvetica").text(v, left + labelW + 8, y + 6, { width: width - labelW - 16 });
    y += rowH;
  }
  doc.y = y + 16;

  // ── Instructions ───────────────────────────────────────────────────────────
  doc.font("Helvetica").fontSize(11).fillColor(dark)
     .text(
       "Please report to the Admission Office on or before the reporting date with the following original documents:",
       left, doc.y,
     )
     .moveDown(0.4);

  const docs = [
    "B-Form / Birth Certificate / CNIC",
    "Previous class result card / mark sheet",
    "Character certificate from the last school",
    "Four recent passport-size photographs",
    "Domicile certificate (where applicable)",
  ];
  for (const [i, d] of docs.entries()) {
    doc.text(`  (${["i","ii","iii","iv","v"][i]})  ${d}`);
  }
  doc.moveDown(0.6);

  doc.text(
    "Failure to report by the due date will result in automatic cancellation of this offer without further notice. " +
    "We look forward to welcoming the student to our institution.",
  ).moveDown(2);

  // ── Signature ──────────────────────────────────────────────────────────────
  doc.font("Helvetica").fontSize(11).fillColor(dark)
     .text("____________________");
  doc.font("Helvetica-Bold").text("Principal / Commandant");
  doc.font("Helvetica").fillColor(gray).text(schoolName);
}

function drawAdmitCard(
  doc: PDFKit.PDFDocument,
  app: typeof applicationsTable.$inferSelect,
  centre: typeof testCentresTable.$inferSelect | undefined,
) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  // Header
  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor("#064A1A")
    .text("CADET COLLEGE MURREE", left, doc.y, { align: "center", width });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#333")
    .text("PUNJAB-PAKISTAN  •  TEL: +92 51 9269180-1", { align: "center", width });
  doc.moveDown(0.4);
  doc
    .strokeColor("#064A1A")
    .lineWidth(1.5)
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .stroke();
  doc.moveDown(0.6);
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor("#111")
    .text("ADMIT CARD", { align: "center", width, underline: true });
  doc.moveDown(0.8);

  const classLabel = (app.classApplying || "").replace(/^Class\s+/i, "");
  const testDateLabel = app.testDate
    ? new Date(app.testDate).toLocaleString("en-GB", {
        dateStyle: "full",
        timeStyle: "short",
      })
    : "To be announced";

  const rowsData: [string, string][] = [
    ["Roll Number", app.rollNumber ?? ""],
    ["Name", (app.fullName ?? "").toUpperCase()],
    ["Father / Guardian", app.fatherName || app.guardianName || ""],
    ["Class Applying", classLabel],
    ["Date of Birth", app.dateOfBirth || ""],
    ["Reference ID", app.referenceId],
    ["Contact", app.guardianMobile || app.studentMobile || ""],
    ["Postal Address", app.presentAddress || ""],
    ["Proposed Centre", app.examCenter || ""],
    ["Test Venue", centre?.address || app.examCenter || "—"],
    ["Venue Contact", centre?.contact || "—"],
    ["Entry Test Date", testDateLabel],
  ];

  const labelW = 140;
  const rowH = 22;
  let y = doc.y;
  doc.fontSize(11);

  for (const [k, v] of rowsData) {
    const cellH = Math.max(
      rowH,
      doc.heightOfString(v || "—", { width: width - labelW - 16 }) + 10,
    );
    doc.rect(left, y, labelW, cellH).fillAndStroke("#f4f4f4", "#444");
    doc.rect(left + labelW, y, width - labelW, cellH).stroke("#444");
    doc
      .fillColor("#111")
      .font("Helvetica-Bold")
      .text(k, left + 6, y + 6, { width: labelW - 12 });
    doc
      .font("Helvetica")
      .fillColor(k === "Roll Number" ? "#064A1A" : "#111")
      .text(v || "—", left + labelW + 8, y + 6, { width: width - labelW - 16 });
    y += cellH;
  }

  doc.y = y + 16;
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#111")
    .text("Instructions", left, doc.y);
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(10).fillColor("#333");
  const instructions = [
    "Bring this admit card with you. You will not be permitted to appear in the written test without it.",
    "Candidates to be seated by 09:00 hrs. Paper-1 (Objective) 09:15–10:15, Paper-2 (Subjective) 10:55–11:55, Interviews 12:05 onwards.",
    "Parents / Guardians are not permitted inside the examination hall.",
    "Result of successful candidates only will be communicated.",
  ];
  instructions.forEach((line, i) => {
    doc.text(`${i + 1}. ${line}`, { width });
    doc.moveDown(0.15);
  });

  doc.moveDown(1.5);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#111")
    .text("_____________________________", { align: "right", width });
  doc.text("In-charge Admission Cell", { align: "right", width });
}

// ── Fee confirmation ──────────────────────────────────────────────────────────
router.patch(
  "/admin/applications/:referenceId/fee/confirm",
  requireRole("admissions", "draft"),
  async (req: Request, res: Response) => {
    const referenceId = String(req.params.referenceId);
    try {
      const apps = await db
        .select()
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);
      const app = apps[0];
      if (!app) return res.status(404).json({ error: "Application not found" });
      // Idempotency guard: reject if already paid (mirrors the cash route pattern)
      if (app.feeStatus === "paid") {
        return res.status(409).json({ error: "Application fee is already marked as paid" });
      }
      // Atomic update: only the request that flips feeStatus away from a non-paid state proceeds
      const confirmed = await db
        .update(applicationsTable)
        .set({ feeStatus: "paid", feeConfirmedAt: new Date() })
        .where(and(eq(applicationsTable.id, app.id), ne(applicationsTable.feeStatus, "paid")))
        .returning({ id: applicationsTable.id });
      if (confirmed.length === 0) {
        return res.status(409).json({ error: "Application fee is already marked as paid" });
      }
      await db.insert(applicationEventsTable).values({
        applicationId: app.id,
        eventType: "fee_confirmed",
        title: "Application Fee Confirmed",
        description: `Application fee (Rs. 2,000) confirmed by admissions office. Reference: ${app.feeBankRef ?? "—"}.`,
      });

      // Post journal entry: DR cash/bank, CR Application Fee Income (4300)
      const tenantId = app.tenantId;
      const feeAmount = app.feePaidAmount ?? 2000;
      let jeWarning: string | undefined;
      if (tenantId && feeAmount > 0) {
        const jeResult = await postApplicationFeeJE({
          tenantId,
          amount:      feeAmount,
          reference:   app.feeBankRef ?? referenceId,
          date:        new Date().toISOString().slice(0, 10),
          sourceRefId: app.id,
          description: "Application fee received",
          narrationDebit: "Bank transfer",
          logger:      req.log,
        });
        if (!jeResult.ok) jeWarning = jeResult.warning;
      }

      return res.json({ success: true, ...(jeWarning ? { jeWarning } : {}) });
    } catch (err) {
      req.log.error({ err }, "Fee confirm failed");
      return res.status(500).json({ error: "Failed to confirm fee" });
    }
  },
);

// ── Cash payment recording (admin records cash received at office) ────────────
router.patch(
  "/admin/applications/:referenceId/fee/cash",
  requireAdmin,
  async (req: Request, res: Response) => {
    const referenceId = String(req.params.referenceId);
    const { cashRef, note, amount, paidDate, receiptUrl } = req.body as {
      cashRef?: string;
      note?: string;
      amount?: number;
      paidDate?: string;
      receiptUrl?: string;
    };
    if (!cashRef || !cashRef.trim()) {
      return res.status(400).json({ error: "cashRef (cash receipt / voucher number) is required" });
    }
    // Amount: whole PKR rupees, must be a positive integer.
    const amountNum = typeof amount === "number" ? amount : Number(amount);
    if (!Number.isFinite(amountNum) || !Number.isInteger(amountNum) || amountNum <= 0) {
      return res.status(400).json({ error: "amount (whole PKR rupees, greater than 0) is required" });
    }
    if (amountNum > 100_000_000) {
      return res.status(400).json({ error: "amount is unreasonably large" });
    }
    // Payment date: optional; default to now. Reject an unparseable date.
    let paidAt = new Date();
    if (paidDate) {
      const parsed = new Date(paidDate);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: "paidDate is not a valid date" });
      }
      // Reject future dates. A 24h buffer absorbs client/server timezone
      // offsets for "today" entries (date inputs submit UTC midnight).
      if (parsed.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
        return res.status(400).json({ error: "paidDate cannot be in the future" });
      }
      paidAt = parsed;
    }
    const cleanReceiptUrl = typeof receiptUrl === "string" && receiptUrl.trim() ? receiptUrl.trim() : null;
    const actorName = (req as any).adminUser?.name ?? "Admissions Office";
    try {
      const [app] = await db
        .select()
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);
      if (!app) return res.status(404).json({ error: "Application not found" });
      if (app.feeStatus === "paid") {
        return res.status(409).json({ error: "Application fee is already marked as paid" });
      }

      // If a receipt URL was supplied, it must reference an image already
      // uploaded to THIS tenant's media library. This blocks arbitrary or
      // cross-tenant URLs (and non-images) from being stored / rendered.
      let validatedReceiptUrl: string | null = null;
      if (cleanReceiptUrl) {
        const mediaTenantId = await getAdminTenantId(req);
        if (!mediaTenantId) {
          return res.status(400).json({ error: "Tenant could not be resolved" });
        }
        const [media] = await db
          .select({ mimeType: mediaLibraryTable.mimeType })
          .from(mediaLibraryTable)
          .where(and(
            eq(mediaLibraryTable.url, cleanReceiptUrl),
            eq(mediaLibraryTable.tenantId, mediaTenantId),
          ))
          .limit(1);
        if (!media) {
          return res.status(400).json({ error: "receiptUrl does not reference an uploaded media item" });
        }
        if (!media.mimeType || !media.mimeType.startsWith("image/")) {
          return res.status(400).json({ error: "Receipt must be an image" });
        }
        validatedReceiptUrl = cleanReceiptUrl;
      }

      // Atomic guard against a concurrent second submission: only the request
      // that flips fee_status away from "paid" proceeds to write the event.
      const updated = await db
        .update(applicationsTable)
        .set({
          feeStatus: "paid",
          paymentMethod: "cash",
          feeBankRef: cashRef.trim(),
          feePaidAmount: amountNum,
          feeReceiptUrl: validatedReceiptUrl ?? app.feeReceiptUrl,
          feeSubmittedAt: paidAt,
          feeConfirmedAt: paidAt,
        })
        .where(and(
          eq(applicationsTable.id, app.id),
          ne(applicationsTable.feeStatus, "paid"),
        ))
        .returning({ id: applicationsTable.id });
      if (updated.length === 0) {
        return res.status(409).json({ error: "Application fee is already marked as paid" });
      }
      await db.insert(applicationEventsTable).values({
        applicationId: app.id,
        occurredAt: paidAt,
        eventType: "fee_confirmed",
        title: "Application Fee Paid (Cash)",
        description: `Cash payment of Rs. ${amountNum.toLocaleString("en-PK")} recorded by ${actorName}. Receipt/Voucher: ${cashRef.trim()}.${validatedReceiptUrl ? " Receipt attached." : ""}${note ? ` Note: ${note.trim()}` : ""}`,
      });

      // Post journal entry: DR cash/bank, CR Application Fee Income (4300)
      const cashTenantId = app.tenantId;
      let cashJeWarning: string | undefined;
      if (cashTenantId && amountNum > 0) {
        const jeResult = await postApplicationFeeJE({
          tenantId:       cashTenantId,
          amount:         amountNum,
          reference:      cashRef.trim(),
          date:           paidAt.toISOString().slice(0, 10),
          sourceRefId:    app.id,
          description:    "Application fee received (cash)",
          narrationDebit: `Cash — ${cashRef.trim()}`,
          logger:         req.log,
        });
        if (!jeResult.ok) cashJeWarning = jeResult.warning;
      }

      return res.json({ success: true, ...(cashJeWarning ? { jeWarning: cashJeWarning } : {}) });
    } catch (err) {
      req.log.error({ err }, "Cash fee record failed");
      return res.status(500).json({ error: "Failed to record cash payment" });
    }
  },
);

// ── Application fee rejection ─────────────────────────────────────────────────
router.patch(
  "/admin/applications/:referenceId/fee/reject",
  requireAdmin,
  async (req: Request, res: Response) => {
    const referenceId = String(req.params.referenceId);
    const { note } = req.body as { note?: string };
    try {
      const apps = await db
        .select()
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);
      const app = apps[0];
      if (!app) return res.status(404).json({ error: "Application not found" });
      await db
        .update(applicationsTable)
        .set({ feeStatus: "rejected" })
        .where(eq(applicationsTable.id, app.id));
      await db.insert(applicationEventsTable).values({
        applicationId: app.id,
        eventType: "fee_rejected",
        title: "Application Fee Rejected",
        description: `Application fee deposit rejected by admissions office. Reference: ${app.feeBankRef ?? "—"}.${note ? ` Note: ${note}` : ""}`,
      });
      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, "Fee reject failed");
      return res.status(500).json({ error: "Failed to reject fee" });
    }
  },
);

// ── Admission fee JE posting (shared by legacy confirm + action/verify) ───────
// Idempotent: a pre-check against journal_entries (sourceModule + sourceRefId)
// ensures repeated verify/confirm calls never double-post.
type AdmissionFeeJEResult = { posted: boolean; skippedReason?: string; error?: string };

async function postAdmissionFeeJE(params: {
  tenantId: string | null;
  applicationId: string;
  amount: number;
  reference: string;
  dateISO: string;
  log: Request["log"];
}): Promise<AdmissionFeeJEResult> {
  const { tenantId, applicationId, amount, reference, dateISO, log } = params;
  if (!tenantId) return { posted: false, skippedReason: "missing tenant" };
  if (!(amount > 0)) return { posted: false, skippedReason: "amount is not greater than zero" };
  try {
    const [existing] = await db
      .select({ id: journalEntriesTable.id })
      .from(journalEntriesTable)
      .where(and(
        eq(journalEntriesTable.sourceModule, "admission-fee"),
        eq(journalEntriesTable.sourceRefId, applicationId),
      ))
      .limit(1);
    if (existing) return { posted: true };

    const [acct] = await db
      .select({ coaId: bankAccountsTable.coaId })
      .from(bankAccountsTable)
      .where(and(eq(bankAccountsTable.tenantId, tenantId), eq(bankAccountsTable.isActive, true)))
      .orderBy(bankAccountsTable.sortOrder)
      .limit(1);
    const bankCoa = (acct?.coaId ? await coaById(acct.coaId, tenantId) : null)
      ?? await coaByCode("1110", tenantId)
      ?? await coaByCode("1100", tenantId);
    const feeCoa = await coaByCode("4300", tenantId);
    if (!bankCoa) {
      const reason = "no cash/bank COA found (seed 1110 or link a bank account)";
      log.warn({ tenantId }, `admission-fee JE skipped: ${reason}`);
      return { posted: false, skippedReason: reason };
    }
    if (!feeCoa) {
      const reason = "COA 4300 (Admission & Registration Fee) not found";
      log.warn({ tenantId }, `admission-fee JE skipped: ${reason}`);
      return { posted: false, skippedReason: reason };
    }
    await tryCreateAndPostJE({
      tenantId,
      date:         dateISO,
      description:  "Admission fee received",
      reference,
      sourceModule: "admission-fee",
      sourceRefId:  applicationId,
      lines: [
        { coaId: bankCoa.id, coaCode: bankCoa.code, coaName: bankCoa.name, debitAmount: amount, creditAmount: 0,      narration: reference },
        { coaId: feeCoa.id,  coaCode: feeCoa.code,  coaName: feeCoa.name,  debitAmount: 0,      creditAmount: amount, narration: "Admission fee" },
      ],
    }, log);
    return { posted: true };
  } catch (jeErr: unknown) {
    const message = jeErr instanceof Error ? jeErr.message : String(jeErr);
    log.error({ err: jeErr }, "admission-fee JE failed — ledger impact skipped");
    return { posted: false, error: message };
  }
}

// ── Admission fee confirmation (legacy — routes through audited action handler)
// Kept for backward compatibility with the candidate portal. Internally calls
// the verify action so all state changes are fully audited.
router.patch(
  "/admin/applications/:referenceId/admission-fee/confirm",
  requireAdmin,
  async (req: Request, res: Response) => {
    const referenceId = String(req.params.referenceId);
    const { bankRef } = req.body as { bankRef?: string };
    const actorName = (req as any).adminUser?.name ?? "Admissions Office";
    const actorId = (req as any).adminUser?.id ?? null;
    const now = new Date();
    try {
      const [app] = await db
        .select()
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);
      if (!app) return res.status(404).json({ error: "Application not found" });
      // Tenant-scoped txnRef so reference ID collisions across tenants can never
      // affect each other's payment_transactions rows.
      const feePayTxnRef = `admfee:${app.tenantId ?? "global"}:${referenceId}`;
      await db.transaction(async (tx) => {
        await tx.update(applicationsTable)
          .set({
            admissionFeeStatus: "paid",
            admissionFeeConfirmedAt: now,
            admissionFeeVerifiedById: actorId,
            admissionFeeVerifiedByName: actorName,
            admissionFeeActionAt: now,
            admissionFeeRejectionReason: null,
            ...(bankRef ? { admissionFeeBankRef: bankRef } : {}),
          })
          .where(eq(applicationsTable.id, app.id));
        await tx.insert(applicationEventsTable).values({
          applicationId: app.id,
          eventType: "admission_fee_verify",
          title: "Admission Fee Verified",
          description: `Admission fee verified by ${actorName}.${bankRef ? ` Ref: ${bankRef}.` : ""}`,
        });
        await tx
          .insert(paymentTransactionsTable)
          .values({
            applicationId: app.id,
            tenantId: app.tenantId,
            feeType: "admission",
            gateway: "bank_deposit",
            amount: 0,
            currency: "PKR",
            status: "paid",
            txnRef: feePayTxnRef,
            gatewayTxnId: bankRef ?? null,
            paidAt: now,
          })
          .onConflictDoUpdate({
            target: paymentTransactionsTable.txnRef,
            set: { status: "paid", gatewayTxnId: bankRef ?? null, paidAt: now, updatedAt: now },
          });
      });

      let jeResult: AdmissionFeeJEResult = { posted: false, skippedReason: "no tenant on application" };
      if (app.tenantId) {
        const config = await resolvePaymentConfig(app.tenantId);
        jeResult = await postAdmissionFeeJE({
          tenantId:      app.tenantId,
          applicationId: app.id,
          amount:        config.admissionFeeAmount,
          reference:     bankRef ?? feePayTxnRef,
          dateISO:       now.toISOString().slice(0, 10),
          log:           req.log,
        });
      }

      return res.json({
        success: true,
        jePosted: jeResult.posted,
        ...(jeResult.error ? { jeError: jeResult.error } : {}),
        ...(jeResult.skippedReason ? { jeSkippedReason: jeResult.skippedReason } : {}),
      });
    } catch (err) {
      req.log.error({ err }, "Admission fee confirm failed");
      return res.status(500).json({ error: "Failed to confirm admission fee" });
    }
  },
);

// ── Admission fee verification action (verify / reject / revert) ──────────────
router.patch(
  "/admin/applications/:referenceId/admission-fee/action",
  requireAdmin,
  async (req: Request, res: Response) => {
    const referenceId = String(req.params.referenceId);
    const { action, amount, bankRef, reason } = req.body as {
      action?: string; amount?: number; bankRef?: string; reason?: string;
    };
    if (!action || !["verify", "reject", "revert"].includes(action)) {
      return res.status(400).json({ error: "action must be one of: verify, reject, revert" });
    }
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const actorName = (req as any).adminUser?.name ?? "Admissions Office";
    const actorId = (req as any).adminUser?.id ?? null;
    const now = new Date();
    try {
      const [app] = await db
        .select()
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);
      if (!app) return res.status(404).json({ error: "Application not found" });
      // Tenant-scoped txnRef so reference ID collisions across tenants can never
      // affect each other's payment_transactions rows.
      const feePayTxnRef = `admfee:${app.tenantId ?? "global"}:${referenceId}`;

      let updates: Record<string, any>;
      let eventTitle: string;
      let eventDesc: string;
      let newStatus: string;

      if (action === "verify") {
        newStatus = "paid";
        eventTitle = "Admission Fee Verified";
        eventDesc = `Admission fee verified by ${actorName}.${amount ? ` Amount: Rs. ${Number(amount).toLocaleString()}.` : ""}${bankRef ? ` Ref: ${bankRef}.` : ""}`;
        updates = {
          admissionFeeStatus: "paid",
          admissionFeeConfirmedAt: now,
          admissionFeeVerifiedById: actorId,
          admissionFeeVerifiedByName: actorName,
          admissionFeeActionAt: now,
          admissionFeeRejectionReason: null,
          admissionFeeVerifiedAmount: amount ? Number(amount) : null,
          ...(bankRef ? { admissionFeeBankRef: bankRef } : {}),
        };
      } else if (action === "reject") {
        newStatus = "rejected";
        eventTitle = "Admission Fee Rejected";
        eventDesc = `Admission fee rejected by ${actorName}.${reason ? ` Reason: ${reason}.` : ""}`;
        updates = {
          admissionFeeStatus: "rejected",
          admissionFeeVerifiedById: actorId,
          admissionFeeVerifiedByName: actorName,
          admissionFeeActionAt: now,
          admissionFeeRejectionReason: reason?.trim() ?? null,
          admissionFeeConfirmedAt: null,
          admissionFeeVerifiedAmount: null,
        };
      } else {
        // revert
        newStatus = "pending";
        eventTitle = "Admission Fee Reverted to Pending";
        eventDesc = `Admission fee status reverted to pending by ${actorName}.`;
        updates = {
          admissionFeeStatus: "pending",
          admissionFeeVerifiedById: actorId,
          admissionFeeVerifiedByName: actorName,
          admissionFeeActionAt: now,
          admissionFeeRejectionReason: null,
          admissionFeeConfirmedAt: null,
          admissionFeeVerifiedAmount: null,
        };
      }

      await db.transaction(async (tx) => {
        await tx.update(applicationsTable).set(updates).where(eq(applicationsTable.id, app.id));
        await tx.insert(applicationEventsTable).values({
          applicationId: app.id,
          eventType: `admission_fee_${action}`,
          title: eventTitle,
          description: eventDesc,
        });
        // Finance linkage: maintain a payment_transactions receipt row for reconciliation
        if (action === "verify") {
          await tx
            .insert(paymentTransactionsTable)
            .values({
              applicationId: app.id,
              tenantId: app.tenantId,
              feeType: "admission",
              gateway: "bank_deposit",
              amount: amount ? Number(amount) : 0,
              currency: "PKR",
              status: "paid",
              txnRef: feePayTxnRef,
              gatewayTxnId: bankRef ?? null,
              paidAt: now,
            })
            .onConflictDoUpdate({
              target: paymentTransactionsTable.txnRef,
              set: {
                status: "paid",
                amount: amount ? Number(amount) : 0,
                gatewayTxnId: bankRef ?? null,
                paidAt: now,
                updatedAt: now,
              },
            });
        } else {
          // reject or revert — cancel the receipt if it exists
          // Scoped by both txnRef (tenant-prefixed) and applicationId for extra isolation.
          await tx
            .update(paymentTransactionsTable)
            .set({ status: "cancelled", updatedAt: now })
            .where(and(
              eq(paymentTransactionsTable.txnRef, feePayTxnRef),
              eq(paymentTransactionsTable.applicationId, app.id),
            ));
        }
      });

      let jeResult: AdmissionFeeJEResult | null = null;
      if (action === "verify" && app.tenantId) {
        let jeAmount = amount ? Number(amount) : 0;
        if (!(jeAmount > 0)) {
          const config = await resolvePaymentConfig(app.tenantId);
          jeAmount = config.admissionFeeAmount;
        }
        jeResult = await postAdmissionFeeJE({
          tenantId:      app.tenantId,
          applicationId: app.id,
          amount:        jeAmount,
          reference:     bankRef ?? feePayTxnRef,
          dateISO:       now.toISOString().slice(0, 10),
          log:           req.log,
        });
      }

      return res.json({
        success: true,
        status: newStatus,
        ...(jeResult ? {
          jePosted: jeResult.posted,
          ...(jeResult.error ? { jeError: jeResult.error } : {}),
          ...(jeResult.skippedReason ? { jeSkippedReason: jeResult.skippedReason } : {}),
        } : {}),
      });
    } catch (err) {
      req.log.error({ err }, "Admission fee action failed");
      return res.status(500).json({ error: "Failed to process admission fee action" });
    }
  },
);

// ── Waitlist list ─────────────────────────────────────────────────────────────
router.get("/admin/waitlist", requireAdmin, async (req: Request, res: Response) => {
  try {
    const waitlistTenantId = requireTenant(req, res);
    if (!waitlistTenantId) return;
    const waitlistFilter = and(
      eq(applicationsTable.resultStatus, "wait_listed"),
      eq(applicationsTable.tenantId, waitlistTenantId),
    );
    const rows = await db
      .select()
      .from(applicationsTable)
      .where(waitlistFilter)
      .orderBy(asc(applicationsTable.meritRank));
    return res.json(rows.map((r) => ({
      referenceId: r.referenceId,
      name: r.fullName,
      classApplying: r.classApplying,
      meritRank: r.meritRank,
      meritScore: r.meritScore,
      resultMarks: r.resultMarks,
      candidateAcceptedAt: r.candidateAcceptedAt,
    })));
  } catch (err) {
    req.log.error({ err }, "Waitlist fetch failed");
    return res.status(500).json({ error: "Failed to fetch waitlist" });
  }
});

// ── Promote from waitlist ─────────────────────────────────────────────────────
router.post(
  "/admin/applications/:referenceId/promote-waitlist",
  requireAdmin,
  async (req: Request, res: Response) => {
    const referenceId = String(req.params.referenceId);
    const { offerDate, feeDeadline, joiningDate } = req.body as {
      offerDate?: string; feeDeadline?: string; joiningDate?: string;
    };
    try {
      const apps = await db
        .select()
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);
      const app = apps[0];
      if (!app) return res.status(404).json({ error: "Application not found" });
      if (app.resultStatus !== "wait_listed") {
        return res.status(400).json({ error: "Application is not on the waitlist" });
      }
      await db
        .update(applicationsTable)
        .set({
          resultStatus: "selected",
          status: "admitted",
          offerDate: offerDate ?? null,
          feeDeadline: feeDeadline ?? null,
          joiningDate: joiningDate ?? null,
        })
        .where(eq(applicationsTable.id, app.id));
      await db.insert(applicationEventsTable).values({
        applicationId: app.id,
        eventType: "admitted",
        title: "Promoted from Waitlist — Offer Letter Issued",
        description: "A vacancy arose and the candidate has been promoted from the waitlist. Offer letter issued.",
      });
      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, "Waitlist promote failed");
      return res.status(500).json({ error: "Failed to promote from waitlist" });
    }
  },
);

// ── Admissions window settings ────────────────────────────────────────────────
router.get("/admin/settings/admissions-window", requireAdmin, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(admissionsSettingsTable)
      .where(
        sql`${admissionsSettingsTable.key} IN ('admissions_open','admissions_deadline','admissions_session')`,
      );
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value;
    return res.json({
      open: map["admissions_open"] === "true",
      deadline: map["admissions_deadline"] ?? null,
      session: map["admissions_session"] ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Admissions window fetch failed");
    return res.status(500).json({ error: "Failed to fetch admissions settings" });
  }
});

router.patch("/admin/settings/admissions-window", requireAdmin, async (req: Request, res: Response) => {
  const { open, deadline, session } = req.body as {
    open?: boolean; deadline?: string; session?: string;
  };
  try {
    const upsert = async (key: string, value: string) => {
      await db
        .insert(admissionsSettingsTable)
        .values({ key, value })
        .onConflictDoUpdate({ target: admissionsSettingsTable.key, set: { value, updatedAt: new Date() } });
    };
    if (open !== undefined) await upsert("admissions_open", open ? "true" : "false");
    if (deadline !== undefined) await upsert("admissions_deadline", deadline);
    if (session !== undefined) await upsert("admissions_session", session);
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Admissions window update failed");
    return res.status(500).json({ error: "Failed to update admissions settings" });
  }
});

// ── Admission fee enrollment gate (block vs warn) ─────────────────────────────
router.get("/admin/settings/admission-fee-gate", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const gateKey = `admission_fee_gate:${tenantId}`;
    const [row] = await db
      .select()
      .from(admissionsSettingsTable)
      .where(eq(admissionsSettingsTable.key, gateKey))
      .limit(1);
    return res.json({ gate: row?.value ?? "warn" });
  } catch (err) {
    req.log.error({ err }, "Admission fee gate fetch failed");
    return res.status(500).json({ error: "Failed to fetch admission fee gate" });
  }
});

router.patch("/admin/settings/admission-fee-gate", requireAdmin, async (req: Request, res: Response) => {
  const { gate } = req.body as { gate?: string };
  if (!gate || !["warn", "block"].includes(gate)) {
    return res.status(400).json({ error: "gate must be 'warn' or 'block'" });
  }
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const gateKey = `admission_fee_gate:${tenantId}`;
    await db
      .insert(admissionsSettingsTable)
      .values({ key: gateKey, value: gate })
      .onConflictDoUpdate({ target: admissionsSettingsTable.key, set: { value: gate, updatedAt: new Date() } });
    return res.json({ success: true, gate });
  } catch (err) {
    req.log.error({ err }, "Admission fee gate update failed");
    return res.status(500).json({ error: "Failed to update admission fee gate" });
  }
});

// ── Applicant ID format settings (persisted per-tenant in admissions_settings) ───

const DEFAULT_GR_FORMAT = {
  prefix: "GR",
  separator: "-",
  includeYear: true,
  paddingDigits: "3",
  startingNumber: "1",
};

router.get("/admin/settings/gr-format", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const [row] = await db
      .select()
      .from(admissionsSettingsTable)
      .where(eq(admissionsSettingsTable.key, `gr_format:${tenantId}`))
      .limit(1);
    if (!row) return res.json(DEFAULT_GR_FORMAT);
    try {
      return res.json({ ...DEFAULT_GR_FORMAT, ...JSON.parse(row.value) });
    } catch {
      return res.json(DEFAULT_GR_FORMAT);
    }
  } catch (err) {
    req.log.error({ err }, "GR format fetch failed");
    return res.status(500).json({ error: "Failed to fetch GR format settings" });
  }
});

router.get("/admin/settings/gr-format/check-prefix", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const raw = typeof req.query["prefix"] === "string" ? req.query["prefix"] : "";
    const prefix = raw.trim().toUpperCase();
    if (!prefix) return res.status(400).json({ error: "prefix query param is required" });

    const allRows = await db
      .select({ key: admissionsSettingsTable.key, value: admissionsSettingsTable.value })
      .from(admissionsSettingsTable)
      .where(sql`${admissionsSettingsTable.key} LIKE ${"gr_format:%"}`);

    for (const row of allRows) {
      const rowTenantId = row.key.replace("gr_format:", "");
      if (rowTenantId === tenantId) continue;
      try {
        const fmt = JSON.parse(row.value);
        if (String(fmt.prefix ?? "").toUpperCase() === prefix) {
          return res.json({ available: false, conflict: true });
        }
      } catch {}
    }
    return res.json({ available: true });
  } catch (err) {
    req.log.error({ err }, "GR prefix check failed");
    return res.status(500).json({ error: "Failed to check prefix availability" });
  }
});

router.put("/admin/settings/gr-format", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;

    const { prefix, separator, includeYear, paddingDigits, startingNumber } = req.body as {
      prefix?: string; separator?: string; includeYear?: boolean;
      paddingDigits?: string; startingNumber?: string;
    };

    const cleanPrefix = (typeof prefix === "string" ? prefix : "GR").trim().toUpperCase();
    if (!cleanPrefix) return res.status(400).json({ error: "prefix is required" });

    // Enforce GR prefix uniqueness across all tenants so same-format Applicant IDs
    // never collide (students.applicant_id has a global unique index).
    const allRows = await db
      .select({ key: admissionsSettingsTable.key, value: admissionsSettingsTable.value })
      .from(admissionsSettingsTable)
      .where(sql`${admissionsSettingsTable.key} LIKE ${"gr_format:%"}`);

    for (const row of allRows) {
      const rowTenantId = row.key.replace("gr_format:", "");
      if (rowTenantId === tenantId) continue;
      try {
        const fmt = JSON.parse(row.value);
        if (String(fmt.prefix ?? "").toUpperCase() === cleanPrefix) {
          return res.status(409).json({
            error: `GR prefix "${cleanPrefix}" is already used by another tenant. Choose a unique prefix.`,
          });
        }
      } catch {}
    }

    const value = JSON.stringify({
      prefix: cleanPrefix,
      separator: separator ?? "-",
      includeYear: includeYear !== false,
      paddingDigits: paddingDigits ?? "3",
      startingNumber: startingNumber ?? "1",
    });

    await db
      .insert(admissionsSettingsTable)
      .values({ key: `gr_format:${tenantId}`, value })
      .onConflictDoUpdate({ target: admissionsSettingsTable.key, set: { value, updatedAt: new Date() } });

    return res.json({ success: true, ...JSON.parse(value) });
  } catch (err) {
    req.log.error({ err }, "GR format update failed");
    return res.status(500).json({ error: "Failed to update GR format settings" });
  }
});

// ── Document verification ─────────────────────────────────────────────────────
router.patch(
  "/admin/applications/:referenceId/documents/:docType/verify",
  requireAdmin,
  async (req: Request, res: Response) => {
    const referenceId = String(req.params.referenceId); const docType = String(req.params.docType);
    const { status, rejectionReason } = req.body as { status?: string; rejectionReason?: string };
    if (!["verified", "rejected", "pending"].includes(status ?? "")) {
      return res.status(400).json({ error: "Status must be verified, rejected, or pending" });
    }
    try {
      const apps = await db
        .select({ id: applicationsTable.id })
        .from(applicationsTable)
        .where(appByRef(req, referenceId))
        .limit(1);
      const app = apps[0];
      if (!app) return res.status(404).json({ error: "Application not found" });

      const doc = await db
        .select()
        .from(applicationDocumentsTable)
        .where(
          and(
            eq(applicationDocumentsTable.applicationId, app.id),
            eq(applicationDocumentsTable.docType, decodeURIComponent(docType)),
          ),
        )
        .limit(1);
      if (!doc[0]) return res.status(404).json({ error: "Document not found" });

      await db
        .update(applicationDocumentsTable)
        .set({
          status: status as string,
          rejectionReason: status === "rejected" ? (rejectionReason ?? null) : null,
        })
        .where(eq(applicationDocumentsTable.id, doc[0].id));
      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, "Doc verify failed");
      return res.status(500).json({ error: "Failed to update document status" });
    }
  },
);

// ── Helper: parse an import date string (ISO YYYY-MM-DD or DD/MM/YYYY) ───────
// Strictly validates calendar dates — returns null for rolled dates like 2026-02-31.
function parseImportDate(s: string): Date | null {
  if (!s) return null;

  let year: number, month: number, day: number;

  // DD/MM/YYYY — parsed first to avoid JS's MM/DD/YYYY interpretation of slash dates.
  const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmm) {
    day   = parseInt(ddmm[1]!, 10);
    month = parseInt(ddmm[2]!, 10);
    year  = parseInt(ddmm[3]!, 10);
  } else {
    // ISO YYYY-MM-DD (or YYYY-MM-DDThh:mm…) — only attempt when clearly ISO-shaped.
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!iso) return null;
    year  = parseInt(iso[1]!, 10);
    month = parseInt(iso[2]!, 10);
    day   = parseInt(iso[3]!, 10);
  }

  // Reject obviously out-of-range components before constructing a Date.
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Build a UTC midnight date and verify the calendar round-trip to catch date rolling
  // (e.g. Feb 31 becomes Mar 3 in JS — we reject those by comparing components back).
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year  ||
    d.getUTCMonth()    !== month - 1 ||
    d.getUTCDate()     !== day
  ) return null;

  return d;
}

// ── Bulk create / update applications (admin walk-in / visitor inquiry) ──────
router.post(
  "/admin/applications/bulk",
  requireAdmin,
  async (req: Request, res: Response) => {
    const rows = req.body?.rows;
    const updateMode = req.body?.updateMode === true;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No rows provided" });
    }

    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const errors: string[] = [];

    // ── UPDATE MODE: patch existing records by referenceId ────────────────
    if (updateMode) {
      const updated: string[] = [];
      for (const row of rows) {
        const refId = String(row.referenceId ?? "").trim().toUpperCase();
        if (!refId) { errors.push("row missing referenceId"); continue; }

        const [existing] = await db
          .select({ id: applicationsTable.id })
          .from(applicationsTable)
          .where(appByRef(req, refId))
          .limit(1);

        if (!existing) { errors.push(`not found: ${refId}`); continue; }

        const patch: Record<string, unknown> = {};
        const fullName       = String(row.fullName ?? (row.firstName ? `${row.firstName} ${row.lastName ?? ""}`.trim() : "")).trim();
        const fatherName     = String(row.fatherName    ?? "").trim();
        const phone          = String(row.phone         ?? "").trim();
        const city           = String(row.city          ?? "").trim();
        const gender         = String(row.gender        ?? "").trim().toLowerCase();
        const studentEmail   = String(row.studentEmail  ?? row.email ?? "").trim();
        const examCenter     = String(row.examCenter    ?? "").trim();
        const presentAddress = String(row.presentAddress ?? row.address ?? "").trim();
        const classApplying  = String(row.classApplying ?? "").trim();
        const paymentStatus  = String(row.paymentStatus ?? "").trim().toLowerCase();
        const applicationDate = String(row.applicationDate ?? "").trim();

        if (fullName)          patch.fullName = fullName;
        if (fatherName)      { patch.fatherName = fatherName; patch.guardianName = fatherName; }
        if (phone)           { patch.studentMobile = phone; patch.guardianMobile = phone; }
        if (city)              patch.city = city;
        if (gender)            patch.gender = gender;
        if (studentEmail)      patch.studentEmail = studentEmail;
        if (examCenter)        patch.examCenter = examCenter;
        if (presentAddress)    patch.presentAddress = presentAddress;
        if (classApplying)     patch.classApplying = classApplying;
        if (paymentStatus && ["pending", "submitted", "paid"].includes(paymentStatus)) patch.feeStatus = paymentStatus;
        if (applicationDate) {
          const parsedDate = parseImportDate(applicationDate);
          if (parsedDate) patch.createdAt = parsedDate;
        }

        if (Object.keys(patch).length === 0) continue;

        try {
          await db.update(applicationsTable).set(patch).where(eq(applicationsTable.id, existing.id));
          updated.push(refId);
        } catch (err) {
          req.log.warn({ err, refId }, "Bulk row update failed");
          errors.push(`update failed: ${refId}`);
        }
      }
      return res.json({ created: 0, updated: updated.length, referenceIds: updated, errors });
    }

    // ── CREATE MODE: insert new records ───────────────────────────────────
    const yr = new Date().getFullYear();
    const session = `${yr}-${yr + 1}`;
    const created: string[] = [];

    for (const row of rows) {
      const fullName = String(row.fullName ?? (row.firstName ? `${row.firstName} ${row.lastName ?? ""}`.trim() : "")).trim();
      const classApplying = String(row.classApplying ?? "").trim();
      if (!fullName || !classApplying) continue;

      const suppliedRefId = String(row.referenceId ?? "").trim().toUpperCase();
      let referenceId: string;
      if (suppliedRefId) {
        const clash = await db
          .select({ id: applicationsTable.id })
          .from(applicationsTable)
          .where(appByRef(req, suppliedRefId))
          .limit(1);
        if (clash.length > 0) {
          errors.push(`Row ${rows.indexOf(row) + 1}: Register ID "${suppliedRefId}" is already taken`);
          continue;
        }
        referenceId = suppliedRefId;
      } else {
        referenceId = generateReferenceId();
        for (let attempt = 0; attempt < 5; attempt++) {
          const clash = await db
            .select({ id: applicationsTable.id })
            .from(applicationsTable)
            .where(appByRef(req, referenceId))
            .limit(1);
          if (clash.length === 0) break;
          referenceId = generateReferenceId();
        }
      }

      const fatherName      = String(row.fatherName     ?? "").trim() || "-";
      const phone           = String(row.phone          ?? "").trim() || "0000-0000000";
      const city            = String(row.city           ?? "").trim() || "-";
      const gender          = String(row.gender         ?? "").trim().toLowerCase() || null;
      const studentEmail    = String(row.studentEmail   ?? row.email ?? "").trim() || null;
      const examCenter      = String(row.examCenter     ?? "").trim() || "-";
      const presentAddress  = String(row.presentAddress ?? row.address ?? "").trim() || "-";
      const rawPaymentStatus = String(row.paymentStatus ?? "").trim().toLowerCase();
      const feeStatus       = ["pending", "submitted", "paid"].includes(rawPaymentStatus) ? rawPaymentStatus : "pending";
      const rawAppDate      = String(row.applicationDate ?? "").trim();
      const createdAt       = parseImportDate(rawAppDate) ?? new Date();

      try {
        const [inserted] = await db
          .insert(applicationsTable)
          .values({
            referenceId,
            session,
            classApplying,
            previousMarks: "0",
            fullName,
            gender: gender ?? null,
            dateOfBirth: "2000-01-01",
            bloodGroup: "Unknown",
            studentMobile: phone,
            studentEmail: studentEmail ?? `${referenceId.toLowerCase().replace(/-/g, ".")}@visitor.ccm`,
            presentAddress,
            state: "-",
            city,
            examCenter,
            guardianName: fatherName,
            relation: "Father",
            fatherName,
            guardianMobile: phone,
            parentCnic: "00000-0000000-0",
            parentCnicLast4: "0000",
            status: "received",
            source: "visitor_inquiry",
            feeStatus,
            createdAt,
            tenantId,
          })
          .returning();

        if (inserted) {
          await db.insert(applicationEventsTable).values({
            applicationId: inserted.id,
            eventType: "received",
            title: "Application Received",
            description: "Application registered by admin staff (visitor inquiry).",
            occurredAt: inserted.createdAt,
          });
          created.push(referenceId);
        }
      } catch (err) {
        req.log.warn({ err, referenceId }, "Bulk row insert failed");
        errors.push(fullName);
      }
    }

    return res.json({ created: created.length, updated: 0, referenceIds: created, errors });
  },
);

// ── Bulk delete applications (destructive — requires password confirmation) ───
router.delete(
  "/admin/applications/bulk-delete",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { referenceIds } = req.body ?? {};
      if (!Array.isArray(referenceIds) || referenceIds.length === 0) {
        return res.status(400).json({ error: "No referenceIds provided" });
      }

      const tenantId = requireTenant(req, res);
      if (!tenantId) return;

      const ids = (referenceIds as string[]).map(r => String(r).trim().toUpperCase()).filter(Boolean);
      if (ids.length === 0) return res.status(400).json({ error: "No valid referenceIds" });

      const deleted = await db
        .delete(applicationsTable)
        .where(and(inArray(applicationsTable.referenceId, ids), eq(applicationsTable.tenantId, tenantId)))
        .returning({ referenceId: applicationsTable.referenceId });

      return res.json({ deleted: deleted.length, referenceIds: deleted.map(d => d.referenceId) });
    } catch (err) {
      req.log.error({ err }, "Bulk delete applications failed");
      return res.status(500).json({ error: "Failed to delete applications" });
    }
  },
);

// ── Interview performa: list candidates for scoring ──────────────────────────
router.get(
  "/admin/applications/interview-performa",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const classApplying = typeof req.query.classApplying === "string" ? req.query.classApplying.trim() : undefined;
      const q             = typeof req.query.q             === "string" ? req.query.q.trim()             : undefined;
      const page          = Math.max(1, parseInt(String(req.query.page     ?? "1")));
      const pageSize      = Math.min(500, Math.max(1, parseInt(String(req.query.pageSize ?? "200"))));

      const INTERVIEW_STATUSES = [
        "interview_scheduled",
        "interview_taken",
        "result_announced",
        "admitted",
        "enrolled",
        "on_hold",
        "rejected",
      ];

      const conditions = [
        eq(applicationsTable.tenantId, tenantId),
        inArray(applicationsTable.status, INTERVIEW_STATUSES),
      ];
      if (classApplying) conditions.push(eq(applicationsTable.classApplying, classApplying));
      if (q) {
        const like = `%${q}%`;
        conditions.push(
          or(
            ilike(applicationsTable.referenceId, like),
            ilike(applicationsTable.fullName,    like),
          )!,
        );
      }

      const where = and(...conditions);

      const [{ total = 0 } = {}] = await db
        .select({ total: count() })
        .from(applicationsTable)
        .where(where);

      const rows = await db
        .select({
          referenceId:     applicationsTable.referenceId,
          fullName:        applicationsTable.fullName,
          fatherName:      applicationsTable.fatherName,
          classApplying:   applicationsTable.classApplying,
          rollNumber:      applicationsTable.rollNumber,
          photoFilename:   applicationsTable.photoFilename,
          occupation:      applicationsTable.occupation,
          status:          applicationsTable.status,
          interviewDate:   applicationsTable.interviewDate,
          interviewVenue:  applicationsTable.interviewVenue,
          scoreAppearance: applicationsTable.scoreAppearance,
          scorePhysical:   applicationsTable.scorePhysical,
          scoreConfidence: applicationsTable.scoreConfidence,
          scoreSpoken:     applicationsTable.scoreSpoken,
          scoreEnglish:    applicationsTable.scoreEnglish,
          scoreGenKnow:    applicationsTable.scoreGenKnow,
          interviewMarks:  applicationsTable.interviewMarks,
        })
        .from(applicationsTable)
        .where(where)
        .orderBy(asc(applicationsTable.rollNumber), asc(applicationsTable.referenceId))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return res.json({ items: rows, total: Number(total), page, pageSize });
    } catch (err) {
      req.log.error({ err }, "Failed to list interview performa");
      return res.status(500).json({ error: "Failed to list interview performa" });
    }
  },
);

// ── Interview performa: bulk save per-criterion scores ────────────────────────
router.patch(
  "/admin/applications/bulk/interview-performa",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const parsed = BulkSaveInterviewPerformaBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid interview performa request", issues: parsed.error.issues });
      }
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const { entries, advanceStatus } = parsed.data;

      // Validate all scores are whole numbers when provided
      for (const e of entries) {
        const scores = [e.scoreAppearance, e.scorePhysical, e.scoreConfidence, e.scoreSpoken, e.scoreEnglish, e.scoreGenKnow];
        for (const s of scores) {
          if (s != null && !Number.isInteger(s)) {
            return res.status(400).json({ error: "Scores must be whole numbers (0–10)" });
          }
        }
      }

      const refIds = [...new Set(entries.map(e => e.referenceId.toUpperCase().trim()))];
      const apps = await db
        .select({
          id:          applicationsTable.id,
          referenceId: applicationsTable.referenceId,
          status:      applicationsTable.status,
        })
        .from(applicationsTable)
        .where(and(inArray(applicationsTable.referenceId, refIds), eq(applicationsTable.tenantId, tenantId)));

      const byRefId = new Map(apps.map(a => [a.referenceId.toUpperCase(), a]));
      const notFound: string[] = [];
      const toUpdate: { id: string; referenceId: string; status: string; entry: (typeof entries)[number] }[] = [];

      for (const entry of entries) {
        const app = byRefId.get(entry.referenceId.toUpperCase().trim());
        if (!app) { notFound.push(entry.referenceId); continue; }
        toUpdate.push({ id: app.id, referenceId: app.referenceId, status: app.status, entry });
      }

      let updated = 0;
      let statusAdvanced = 0;

      await db.transaction(async (tx) => {
        for (const { id, status, entry } of toUpdate) {
          const updates: Partial<typeof applicationsTable.$inferInsert> = {};

          if (entry.scoreAppearance  !== undefined) updates.scoreAppearance  = entry.scoreAppearance  ?? null;
          if (entry.scorePhysical    !== undefined) updates.scorePhysical    = entry.scorePhysical    ?? null;
          if (entry.scoreConfidence  !== undefined) updates.scoreConfidence  = entry.scoreConfidence  ?? null;
          if (entry.scoreSpoken      !== undefined) updates.scoreSpoken      = entry.scoreSpoken      ?? null;
          if (entry.scoreEnglish     !== undefined) updates.scoreEnglish     = entry.scoreEnglish     ?? null;
          if (entry.scoreGenKnow     !== undefined) updates.scoreGenKnow     = entry.scoreGenKnow     ?? null;

          if (Object.keys(updates).length === 0) continue;

          // Auto-compute interviewMarks from the 6 criteria
          // Fetch current row to merge with the incoming deltas
          const [current] = await tx
            .select({
              scoreAppearance: applicationsTable.scoreAppearance,
              scorePhysical:   applicationsTable.scorePhysical,
              scoreConfidence: applicationsTable.scoreConfidence,
              scoreSpoken:     applicationsTable.scoreSpoken,
              scoreEnglish:    applicationsTable.scoreEnglish,
              scoreGenKnow:    applicationsTable.scoreGenKnow,
            })
            .from(applicationsTable)
            .where(eq(applicationsTable.id, id))
            .limit(1);

          const merged = {
            scoreAppearance: updates.scoreAppearance  ?? current?.scoreAppearance  ?? null,
            scorePhysical:   updates.scorePhysical    ?? current?.scorePhysical    ?? null,
            scoreConfidence: updates.scoreConfidence  ?? current?.scoreConfidence  ?? null,
            scoreSpoken:     updates.scoreSpoken      ?? current?.scoreSpoken      ?? null,
            scoreEnglish:    updates.scoreEnglish     ?? current?.scoreEnglish     ?? null,
            scoreGenKnow:    updates.scoreGenKnow     ?? current?.scoreGenKnow     ?? null,
          };

          const allScores = [
            merged.scoreAppearance, merged.scorePhysical, merged.scoreConfidence,
            merged.scoreSpoken, merged.scoreEnglish, merged.scoreGenKnow,
          ];
          const allEntered = allScores.every(s => s != null);
          updates.interviewMarks = allEntered
            ? allScores.reduce((a, b) => a! + b!, 0)
            : null;

          // Advance status if requested
          if (advanceStatus && status === "interview_scheduled" && allEntered) {
            updates.status = "interview_taken";
            statusAdvanced++;
          }

          await tx.update(applicationsTable).set(updates).where(eq(applicationsTable.id, id));

          if (updates.status) {
            await tx.insert(applicationEventsTable).values({
              applicationId: id,
              eventType: updates.status,
              title: STATUS_LABELS[updates.status] ?? updates.status,
              description: `Interview scores saved. Total: ${updates.interviewMarks}/60.`,
            });
          }

          updated++;
        }
      });

      void syncMeritScores(toUpdate.map(({ id }) => id));
      return res.json({ updated, statusAdvanced, notFound });
    } catch (err) {
      req.log.error({ err }, "Failed bulk interview performa save");
      return res.status(500).json({ error: "Failed to save interview performa scores" });
    }
  },
);

// ── Batch print jobs ──────────────────────────────────────────────────────────

router.get("/admin/batch-print-jobs", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { documentType, academicYearId, status, generatedAfter, generatedBefore, page = "1", pageSize = "30" } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const size    = Math.min(100, Math.max(1, parseInt(pageSize) || 30));
    const offset  = (pageNum - 1) * size;

    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const conditions: ReturnType<typeof eq>[] = [eq(batchPrintJobsTable.tenantId, tenantId)];
    if (documentType)   conditions.push(eq(batchPrintJobsTable.documentType, documentType));
    if (academicYearId) conditions.push(eq(batchPrintJobsTable.academicYearId, academicYearId));
    if (status)         conditions.push(eq(batchPrintJobsTable.status, status));
    if (generatedAfter) {
      const d = new Date(generatedAfter);
      if (!isNaN(d.getTime())) conditions.push(gte(batchPrintJobsTable.generatedAt, d));
    }
    if (generatedBefore) {
      const d = new Date(generatedBefore);
      if (!isNaN(d.getTime())) conditions.push(lte(batchPrintJobsTable.generatedAt, d));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [jobs, totals] = await Promise.all([
      db.select({
        id:             batchPrintJobsTable.id,
        documentType:   batchPrintJobsTable.documentType,
        academicYearId: batchPrintJobsTable.academicYearId,
        studentIds:     batchPrintJobsTable.studentIds,
        classCodes:     batchPrintJobsTable.classCodes,
        sectionIds:     batchPrintJobsTable.sectionIds,
        status:         batchPrintJobsTable.status,
        generatedAt:    batchPrintJobsTable.generatedAt,
        printedAt:      batchPrintJobsTable.printedAt,
        adminFullName:  adminUsersTable.fullName,
      })
        .from(batchPrintJobsTable)
        .leftJoin(adminUsersTable, eq(batchPrintJobsTable.adminUserId, adminUsersTable.id))
        .where(where)
        .orderBy(desc(batchPrintJobsTable.generatedAt))
        .limit(size)
        .offset(offset),
      db.select({ total: count() }).from(batchPrintJobsTable).where(where),
    ]);

    return res.json({
      items: jobs.map(j => ({
        id:             j.id,
        documentType:   j.documentType,
        academicYearId: j.academicYearId,
        studentCount:   (j.studentIds as string[]).length,
        classCodes:     j.classCodes ?? null,
        sectionIds:     j.sectionIds ?? null,
        status:         j.status,
        generatedAt:    j.generatedAt.toISOString(),
        printedAt:      j.printedAt?.toISOString() ?? null,
        adminFullName:  j.adminFullName ?? null,
      })),
      total:    Number(totals[0]?.total ?? 0),
      page:     pageNum,
      pageSize: size,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list batch print jobs");
    return res.status(500).json({ error: "Failed to list batch print jobs" });
  }
});

router.get("/admin/batch-print-jobs/student-status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { documentType, academicYearId, studentIds } = req.query as Record<string, string>;
    if (!documentType || !studentIds) {
      return res.status(400).json({ error: "documentType and studentIds are required" });
    }
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const ids = studentIds.split(",").map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return res.json({ results: {} });

    const yearCondition = academicYearId
      ? eq(studentPrintRecordsTable.academicYearId, academicYearId)
      : isNull(studentPrintRecordsTable.academicYearId);

    const records = await db
      .select()
      .from(studentPrintRecordsTable)
      .where(and(
        eq(studentPrintRecordsTable.tenantId, tenantId),
        eq(studentPrintRecordsTable.documentType, documentType),
        inArray(studentPrintRecordsTable.studentId, ids),
        yearCondition,
      ));

    const results: Record<string, { printed: boolean; generated: boolean; printedAt: string | null; batchJobId: string | null }> = {};
    for (const id of ids) {
      const rec = records.find(r => r.studentId === id);
      results[id] = {
        printed:    rec?.status === "printed",
        generated:  !!rec,
        printedAt:  rec?.printedAt?.toISOString() ?? null,
        batchJobId: rec?.batchJobId ?? null,
      };
    }
    return res.json({ results });
  } catch (err) {
    req.log.error({ err }, "Failed to get student print status");
    return res.status(500).json({ error: "Failed to get student print status" });
  }
});

router.get("/admin/batch-print-jobs/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const id = String(req.params["id"]);

    const [job] = await db
      .select({
        id:             batchPrintJobsTable.id,
        documentType:   batchPrintJobsTable.documentType,
        academicYearId: batchPrintJobsTable.academicYearId,
        studentIds:     batchPrintJobsTable.studentIds,
        mergeValues:    batchPrintJobsTable.mergeValues,
        status:         batchPrintJobsTable.status,
        generatedAt:    batchPrintJobsTable.generatedAt,
        printedAt:      batchPrintJobsTable.printedAt,
        adminFullName:  adminUsersTable.fullName,
      })
      .from(batchPrintJobsTable)
      .leftJoin(adminUsersTable, eq(batchPrintJobsTable.adminUserId, adminUsersTable.id))
      .where(and(eq(batchPrintJobsTable.id, id), eq(batchPrintJobsTable.tenantId, tenantId)));

    if (!job) return res.status(404).json({ error: "Batch print job not found" });

    const jobStudentIds = (job.studentIds as string[]);

    // Fetch current student data directly from studentsTable using the stored studentIds.
    // This is durable: student_print_records for a given student/docType/year get replaced on
    // re-generation, so querying by batchJobId would silently lose history for older jobs.
    const studentRows = jobStudentIds.length > 0
      ? await db
          .select({
            id:        studentsTable.id,
            fullName:  studentsTable.fullName,
            applicantId:  studentsTable.applicantId,
            classCode: studentsTable.classCode,
            sectionId: studentsTable.sectionId,
          })
          .from(studentsTable)
          .where(and(inArray(studentsTable.id, jobStudentIds), eq(studentsTable.tenantId, tenantId)))
      : [];

    // Get current per-student print status from student_print_records (latest record per student
    // for this docType/year — may be from a newer batch if regenerated, but reflects real status).
    const yearCondition2 = job.academicYearId
      ? eq(studentPrintRecordsTable.academicYearId, job.academicYearId)
      : isNull(studentPrintRecordsTable.academicYearId);

    const printRecords = jobStudentIds.length > 0
      ? await db
          .select({
            studentId: studentPrintRecordsTable.studentId,
            status:    studentPrintRecordsTable.status,
            printedAt: studentPrintRecordsTable.printedAt,
          })
          .from(studentPrintRecordsTable)
          .where(and(
            eq(studentPrintRecordsTable.tenantId, tenantId),
            eq(studentPrintRecordsTable.documentType, job.documentType),
            inArray(studentPrintRecordsTable.studentId, jobStudentIds),
            yearCondition2,
          ))
      : [];

    const printStatusMap = Object.fromEntries(printRecords.map(r => [r.studentId, r]));
    const studentMap     = Object.fromEntries(studentRows.map(s => [s.id, s]));

    return res.json({
      id:             job.id,
      documentType:   job.documentType,
      academicYearId: job.academicYearId,
      status:         job.status,
      generatedAt:    job.generatedAt.toISOString(),
      printedAt:      job.printedAt?.toISOString() ?? null,
      adminFullName:  job.adminFullName ?? null,
      mergeValues:    (job.mergeValues as Record<string, string> | null) ?? {},
      students: jobStudentIds.map(studentId => {
        const s = studentMap[studentId];
        const p = printStatusMap[studentId];
        return {
          studentId,
          fullName:    s?.fullName    ?? "",
          applicantId: s?.applicantId ?? "",
          classCode:   s?.classCode   ?? "",
          sectionId:   s?.sectionId   ?? "",
          status:      p?.status      ?? "generated",
          printedAt:   p?.printedAt?.toISOString() ?? null,
        };
      }).sort((a, b) =>
        a.fullName.localeCompare(b.fullName)
      ),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get batch print job");
    return res.status(500).json({ error: "Failed to get batch print job" });
  }
});

router.post("/admin/batch-print-jobs", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { documentType, academicYearId, studentIds, force, mergeValues, classCodes, sectionIds, dataSource } = req.body as {
      documentType: string; academicYearId?: string; studentIds: string[]; force?: boolean;
      mergeValues?: Record<string, string>; classCodes?: string; sectionIds?: string;
      dataSource?: "students" | "applicants";
    };
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    if (!documentType || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: "documentType and studentIds are required" });
    }

    // Fail-closed IDOR guard: every requested record must belong to the caller's tenant.
    // Branch by dataSource so applicant IDs are checked against applicationsTable.
    if (dataSource === "applicants") {
      const ownedApplicants = await db
        .select({ id: applicationsTable.id })
        .from(applicationsTable)
        .where(and(inArray(applicationsTable.id, studentIds), eq(applicationsTable.tenantId, tenantId)));
      if (ownedApplicants.length !== new Set(studentIds).size) {
        return res.status(403).json({ error: "One or more applicants do not belong to this tenant" });
      }
    } else {
      const ownedStudents = await db
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .where(and(inArray(studentsTable.id, studentIds), eq(studentsTable.tenantId, tenantId)));
      if (ownedStudents.length !== new Set(studentIds).size) {
        return res.status(403).json({ error: "One or more students do not belong to this tenant" });
      }
    }

    const yearCondition = academicYearId
      ? eq(studentPrintRecordsTable.academicYearId, academicYearId)
      : isNull(studentPrintRecordsTable.academicYearId);

    const existing = await db
      .select()
      .from(studentPrintRecordsTable)
      .where(and(
        eq(studentPrintRecordsTable.tenantId, tenantId),
        eq(studentPrintRecordsTable.documentType, documentType),
        inArray(studentPrintRecordsTable.studentId, studentIds),
        eq(studentPrintRecordsTable.status, "printed"),
        yearCondition,
      ));

    if (existing.length > 0 && !force) {
      return res.status(409).json({
        error: "Duplicate print records found",
        duplicates: existing.map(r => ({
          studentId:   r.studentId,
          studentName: "",
          printedAt:   r.printedAt?.toISOString() ?? null,
        })),
      });
    }

    const _adminUser  = (req as any).adminUser;
    const _rawId = _adminUser?.id as string | undefined;
    const _uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const adminUserId = (_rawId && _uuidRe.test(_rawId)) ? _rawId : undefined;

    const [job] = await db.insert(batchPrintJobsTable).values({
      tenantId,
      adminUserId:    adminUserId ?? null,
      documentType,
      academicYearId: academicYearId ?? null,
      studentIds,
      mergeValues:    mergeValues ?? {},
      classCodes:     classCodes ?? null,
      sectionIds:     sectionIds ?? null,
      status:         "generated",
    }).returning();

    // Always delete existing records for these students+doctype+year before inserting fresh ones.
    // This ensures at most one row per (studentId, documentType, academicYearId), making
    // status lookups deterministic and preventing multi-row ambiguity on repeated generate calls.
    await db.delete(studentPrintRecordsTable).where(
      and(
        eq(studentPrintRecordsTable.tenantId, tenantId),
        eq(studentPrintRecordsTable.documentType, documentType),
        inArray(studentPrintRecordsTable.studentId, studentIds),
        yearCondition,
      ),
    );

    await db.insert(studentPrintRecordsTable).values(
      studentIds.map(studentId => ({
        tenantId,
        studentId,
        documentType,
        academicYearId: academicYearId ?? null,
        status:         "generated",
        batchJobId:     job!.id,
      })),
    );

    return res.status(201).json({
      id:             job!.id,
      documentType:   job!.documentType,
      academicYearId: job!.academicYearId,
      studentIds:     job!.studentIds as string[],
      status:         job!.status,
      generatedAt:    job!.generatedAt.toISOString(),
      printedAt:      job!.printedAt?.toISOString() ?? null,
      duplicates:     existing.map(r => ({
        studentId:  r.studentId,
        printedAt:  r.printedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create batch print job");
    return res.status(500).json({ error: "Failed to create batch print job" });
  }
});

router.patch("/admin/batch-print-jobs/:id/print", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const id = String(req.params["id"]);
    const _adminUser2  = (req as any).adminUser;
    const _rawId2 = _adminUser2?.id as string | undefined;
    const _uuidRe2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const adminUserId  = (_rawId2 && _uuidRe2.test(_rawId2)) ? _rawId2 : undefined;

    const [job] = await db
      .update(batchPrintJobsTable)
      .set({ status: "printed", printedAt: new Date(), printedByAdminId: adminUserId ?? null })
      .where(and(eq(batchPrintJobsTable.id, id), eq(batchPrintJobsTable.tenantId, tenantId)))
      .returning();

    if (!job) return res.status(404).json({ error: "Batch print job not found" });

    await db
      .update(studentPrintRecordsTable)
      .set({ status: "printed", printedAt: new Date() })
      .where(and(eq(studentPrintRecordsTable.batchJobId, id), eq(studentPrintRecordsTable.tenantId, tenantId)));

    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to mark batch print job as printed");
    return res.status(500).json({ error: "Failed to mark batch print job as printed" });
  }
});

// ── Student print-data endpoint ──────────────────────────────────────────────

router.get("/admin/students/:id/print-data", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const studentId = String(req.params["id"]);
    const { academicYearId } = req.query as Record<string, string>;

    const [student] = await db.select().from(studentsTable).where(and(eq(studentsTable.id, studentId), eq(studentsTable.tenantId, tenantId)));
    if (!student) return res.status(404).json({ error: "Student not found" });

    // Latest fee challan
    // Student already verified to belong to tenantId above, so studentId alone scopes the challan.
    const feeConditions = [eq(feeChallansTable.studentId, studentId)];
    if (academicYearId) feeConditions.push(eq(feeChallansTable.academicYearId, academicYearId));
    const [latestChallan] = await db
      .select({ status: feeChallansTable.status, month: feeChallansTable.month })
      .from(feeChallansTable)
      .where(and(...feeConditions))
      .orderBy(desc(feeChallansTable.createdAt))
      .limit(1);

    // Hostel allocation → room → block
    const [hostelAlloc] = await db
      .select({
        roomNumber: hostelRoomsTable.roomNumber,
        blockName:  hostelBlocksTable.name,
      })
      .from(hostelAllocationsTable)
      .innerJoin(hostelRoomsTable,  eq(hostelAllocationsTable.roomId, hostelRoomsTable.id))
      .innerJoin(hostelBlocksTable, eq(hostelRoomsTable.blockId, hostelBlocksTable.id))
      .where(and(
        eq(hostelAllocationsTable.studentId, studentId),
        eq(hostelAllocationsTable.status, "active"),
      ))
      .limit(1);

    // Enrollment date
    const enrollConds = [eq(studentEnrollmentsTable.studentId, studentId)];
    if (academicYearId) enrollConds.push(eq(studentEnrollmentsTable.academicYearId, academicYearId));
    const [enrollment] = await db
      .select({ enrollmentDate: studentEnrollmentsTable.createdAt })
      .from(studentEnrollmentsTable)
      .where(and(...enrollConds))
      .orderBy(desc(studentEnrollmentsTable.createdAt))
      .limit(1);

    return res.json({
      studentId:       student.id,
      fullName:        student.fullName ?? "",
      applicantId:     student.applicantId  ?? "",
      classCode:       student.classCode ?? "",
      sectionId:       student.sectionId ?? "",
      rollNo:          student.rollNo    ?? "",
      bloodGroup:      student.bloodGroup ?? "",
      guardianMobile:  student.guardianMobile ?? "",
      fatherName:      student.fatherName ?? "",
      feeStatus:       latestChallan?.status ?? "",
      hostelBlock:     hostelAlloc?.blockName ?? "",
      hostelRoom:      hostelAlloc?.roomNumber ?? "",
      enrollmentDate:  enrollment ? new Date(enrollment.enrollmentDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get student print data");
    return res.status(500).json({ error: "Failed to get student print data" });
  }
});

// ── Test Schedules CRUD ───────────────────────────────────────────────────────
router.get("/admin/test-schedules", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const rows = await db
      .select()
      .from(testSchedulesTable)
      .where(eq(testSchedulesTable.tenantId, tenantId))
      .orderBy(desc(testSchedulesTable.testDate));
    return res.json({ items: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to list test schedules");
    return res.status(500).json({ error: "Failed to list test schedules" });
  }
});

router.post("/admin/test-schedules", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const { title, testDate, testTime, centreId, centreName, classApplying, session, totalSeats, notes, status } = req.body ?? {};
    if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
    if (!testDate?.trim()) return res.status(400).json({ error: "Test date is required" });

    let resolvedCentreName = centreName?.trim() || null;
    if (centreId && !resolvedCentreName) {
      const [c] = await db.select({ name: testCentresTable.name }).from(testCentresTable)
        .where(and(eq(testCentresTable.id, centreId), eq(testCentresTable.tenantId, tenantId))).limit(1);
      resolvedCentreName = c?.name ?? null;
    }

    const [created] = await db
      .insert(testSchedulesTable)
      .values({
        title: String(title).trim(),
        testDate: String(testDate).trim(),
        testTime: testTime?.trim() || null,
        centreId: centreId || null,
        centreName: resolvedCentreName,
        classApplying: classApplying?.trim() || null,
        session: session?.trim() || null,
        totalSeats: totalSeats ? Number(totalSeats) : null,
        notes: notes?.trim() || null,
        status: status ?? "upcoming",
        tenantId,
      })
      .returning();

    return res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Failed to create test schedule");
    return res.status(500).json({ error: "Failed to create test schedule" });
  }
});

router.patch("/admin/test-schedules/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const { title, testDate, testTime, centreId, centreName, classApplying, session, totalSeats, notes, status } = req.body ?? {};
    const updates: Partial<typeof testSchedulesTable.$inferInsert> = {};

    if (title !== undefined)        updates.title        = String(title).trim();
    if (testDate !== undefined)     updates.testDate     = String(testDate).trim();
    if (testTime !== undefined)     updates.testTime     = testTime?.trim() || null;
    if (centreId !== undefined)     updates.centreId     = centreId || null;
    if (centreName !== undefined)   updates.centreName   = centreName?.trim() || null;
    if (classApplying !== undefined) updates.classApplying = classApplying?.trim() || null;
    if (session !== undefined)      updates.session      = session?.trim() || null;
    if (totalSeats !== undefined)   updates.totalSeats   = totalSeats ? Number(totalSeats) : null;
    if (notes !== undefined)        updates.notes        = notes?.trim() || null;
    if (status !== undefined)       updates.status       = status;

    if (centreId && !centreName) {
      const [c] = await db.select({ name: testCentresTable.name }).from(testCentresTable)
        .where(and(eq(testCentresTable.id, centreId), eq(testCentresTable.tenantId, tenantId))).limit(1);
      if (c) updates.centreName = c.name;
    }

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });

    const [updated] = await db
      .update(testSchedulesTable)
      .set(updates)
      .where(and(eq(testSchedulesTable.id, req.params.id as string), eq(testSchedulesTable.tenantId, tenantId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Test schedule not found" });
    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update test schedule");
    return res.status(500).json({ error: "Failed to update" });
  }
});

router.delete("/admin/test-schedules/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const [deleted] = await db
      .delete(testSchedulesTable)
      .where(and(eq(testSchedulesTable.id, req.params.id as string), eq(testSchedulesTable.tenantId, tenantId)))
      .returning({ id: testSchedulesTable.id });

    if (!deleted) return res.status(404).json({ error: "Test schedule not found" });
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete test schedule");
    return res.status(500).json({ error: "Failed to delete" });
  }
});

// ── Interviewers CRUD ─────────────────────────────────────────────────────────
router.get("/admin/interviewers", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const rows = await db
      .select()
      .from(interviewersTable)
      .where(eq(interviewersTable.tenantId, tenantId))
      .orderBy(asc(interviewersTable.sortOrder), asc(interviewersTable.name));
    return res.json({ items: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to list interviewers");
    return res.status(500).json({ error: "Failed to list interviewers" });
  }
});

router.post("/admin/interviewers", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const { name, designation, sortOrder } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

    const [created] = await db
      .insert(interviewersTable)
      .values({
        name: String(name).trim(),
        designation: designation?.trim() || null,
        sortOrder: Number(sortOrder ?? 0) || 0,
        tenantId,
      })
      .returning();

    return res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Failed to create interviewer");
    return res.status(500).json({ error: "Failed to create interviewer" });
  }
});

router.patch("/admin/interviewers/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const { name, designation, active, sortOrder } = req.body ?? {};
    const updates: Partial<typeof interviewersTable.$inferInsert> = {};
    if (name !== undefined)        updates.name        = String(name).trim();
    if (designation !== undefined) updates.designation = designation?.trim() || null;
    if (active !== undefined)      updates.active      = Boolean(active);
    if (sortOrder !== undefined)   updates.sortOrder   = Number(sortOrder) || 0;

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });

    const [updated] = await db
      .update(interviewersTable)
      .set(updates)
      .where(and(eq(interviewersTable.id, req.params.id as string), eq(interviewersTable.tenantId, tenantId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Interviewer not found" });
    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update interviewer");
    return res.status(500).json({ error: "Failed to update" });
  }
});

router.delete("/admin/interviewers/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const [deleted] = await db
      .delete(interviewersTable)
      .where(and(eq(interviewersTable.id, req.params.id as string), eq(interviewersTable.tenantId, tenantId)))
      .returning({ id: interviewersTable.id });

    if (!deleted) return res.status(404).json({ error: "Interviewer not found" });
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete interviewer");
    return res.status(500).json({ error: "Failed to delete" });
  }
});

// ── Dev: seed all demo data ───────────────────────────────────────────────────
router.post("/admin/dev/seed-all", requireAdmin, async (req: Request, res: Response) => {
  try {
    await seedAllData();
    return res.json({ ok: true, message: "Seed complete — empty tables have been populated." });
  } catch (err) {
    req.log.error({ err }, "dev seed-all failed");
    return res.status(500).json({ error: "Seed failed" });
  }
});

export default router;
