import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { verifyToken } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";
import healthRouter from "./health";
import mediaProxyRouter from "./mediaProxy";
import applicationsRouter from "./applications";
import adminRouter from "./admin";
import adminUsersRouter from "./adminUsers";
import centresRouter from "./centres";
import academicRouter from "./academic";
import studentsRouter from "./students";
import portalRouter from "./portal";
import feesRouter from "./fees";
import hrRouter from "./hr";
import hostelRouter from "./hostel";
import transportRouter from "./transport";
import libraryRouter from "./library";
import storeRouter from "./store";
import medicalRouter from "./medical";
import timetableRouter from "./timetable";
import syllabusRouter from "./syllabus";
import examsRouter from "./exams";
import sportsRouter from "./sports";
import settingsRouter from "./settings";
import mediaRouter from "./media";
import printTemplatesRouter from "./printTemplates";
import printSignaturesRouter from "./printSignatures";
import gateRouter from "./gate";
import communicationRouter from "./communication";
import eventsRouter from "./events";
import coaRouter from "./coa";
import bankAccountsRouter from "./bankAccounts";
import accountPaymentsRouter from "./accountPayments";
import vouchersRouter from "./vouchers";
import vendorsRouter from "./vendors";
import vendorBillsRouter from "./vendorBills";
import guardiansRouter from "./guardians";
import saasAdminRouter from "./saas-admin";
import tenantModulesRouter from "./tenantModules";
import backupRouter from "./backup";
import calendarRouter from "./calendar";
import websiteContentRouter from "./websiteContent";
import siteAnalyticsRouter from "./siteAnalytics";
import paymentsRouter from "./payments";
import reportsRouter from "./reports";
import formConfigRouter from "./formConfig";
import paymentConfigRouter from "./paymentConfig";
import gatewayCredentialsRouter from "./gatewayCredentials";
import jeRouter from "./je";
import careersRouter from "./careers";
import challanSettingsRouter from "./challanSettings";

/**
 * AsyncLocalStorage for the current admin request's tenant ID.
 *
 * Propagates via Node.js async context (survives await boundaries). Route
 * handlers and helpers can call `adminTenantStorage.getStore()` to obtain
 * the tenant for the current request without threading it through every call.
 *
 * NOTE: withTenantCtx() uses an EXPLICIT tenantId argument and wraps its
 * callback in db.transaction() (single pinned connection) + SET LOCAL ROLE app_user
 * + set_config('app.current_tenant', id, TRUE). That is the connection-safe,
 * per-query RLS enforcement path. This store is for context propagation only.
 */
export const adminTenantStorage = new AsyncLocalStorage<string>();

const router: IRouter = Router();

/**
 * Global tenant-context middleware for all admin routes.
 *
 * Two-layer approach:
 *
 * Layer 1 — Async context (always): stores tenantId in AsyncLocalStorage so all
 *   helper functions can resolve the tenant without threading it as a parameter.
 *
 * Layer 2 — DB session context (best-effort): calls set_config('app.current_tenant',
 *   tenantId, false) on the connection pool so that DB-level RLS policies
 *   (neondb_owner_scoped: USING tenant_id = current_setting('app.current_tenant'))
 *   can filter tenant-scoped tables even for plain db.select() calls that lack an
 *   explicit WHERE tenant_id clause. This is session-level (not LOCAL), so it acts
 *   as a request-start default; withTenantCtx/withTenantRead apply LOCAL (per-tx)
 *   settings for a stronger per-transaction guarantee on writes and key reads.
 *
 * Note: Because pg uses a connection pool, a later query in the same request may
 * use a different connection. The mandatory WHERE tenant_id = ? clause in every
 * admin route is the primary guard; the session set_config is defence-in-depth.
 *
 * Super-admins (no tenantId on token) bypass this middleware and rely on explicit
 * application-level filters only.
 */
router.use(async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.path.startsWith("/admin/")) return next();
  const authHeader = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  const token = match?.[1]?.trim();
  if (!token) return next();
  const adminUser = verifyToken(token);
  if (!adminUser) return next();

  // Make the verified user available to getAdminTenantId. requireAdmin re-sets
  // this per-route, so this is safe and idempotent.
  req.adminUser = adminUser;

  // Resolve the effective tenant for this request, FAIL-CLOSED:
  //  - Scoped tenant admins → their own token tenantId (cannot escape).
  //  - Super-admins → X-Tenant-Id / ?tenant= override, else host-domain match.
  //  - Otherwise null. Every tenant-scoped route MUST require a non-null value.
  //
  // CRITICAL: the runtime DB role (neondb_owner) has BYPASSRLS=true, so RLS
  // policies do NOT protect plain `db` queries. The explicit WHERE tenant_id = ?
  // clause (driven by this resolved value) is the PRIMARY isolation guard.
  let resolvedTenantId: string | null = null;
  try {
    resolvedTenantId = await getAdminTenantId(req);
  } catch {
    resolvedTenantId = null;
  }
  req.adminTenantId = resolvedTenantId;

  if (!resolvedTenantId) return next();

  // Defence-in-depth only (ineffective while the connection role bypasses RLS):
  // best-effort session tenant context for any code that runs via app_user.
  db.execute(sql`SELECT set_config('app.current_tenant', ${resolvedTenantId}, false)`).catch(() => {});

  // Propagate via async context so helpers can resolve tenantId without params.
  adminTenantStorage.run(resolvedTenantId, next);
});

router.use(healthRouter);
router.use(mediaProxyRouter);
router.use(applicationsRouter);
router.use(adminUsersRouter);
router.use(adminRouter);
router.use(centresRouter);
router.use(academicRouter);
router.use(studentsRouter);
router.use(portalRouter);
router.use(feesRouter);
router.use(hrRouter);
router.use(hostelRouter);
router.use(transportRouter);
router.use(libraryRouter);
router.use(storeRouter);
router.use(medicalRouter);
router.use(timetableRouter);
router.use(syllabusRouter);
router.use(examsRouter);
router.use(sportsRouter);
router.use(settingsRouter);
router.use(mediaRouter);
router.use(printTemplatesRouter);
router.use(gateRouter);
router.use(communicationRouter);
router.use(eventsRouter);
router.use(coaRouter);
router.use(bankAccountsRouter);
router.use(accountPaymentsRouter);
router.use(vouchersRouter);
router.use(vendorsRouter);
router.use(vendorBillsRouter);
router.use(guardiansRouter);
router.use(saasAdminRouter);
router.use(tenantModulesRouter);
router.use(backupRouter);
router.use(calendarRouter);
router.use(websiteContentRouter);
router.use(siteAnalyticsRouter);
router.use(paymentsRouter);
router.use(reportsRouter);
router.use(formConfigRouter);
router.use(paymentConfigRouter);
router.use(gatewayCredentialsRouter);
router.use(jeRouter);
router.use(careersRouter);
router.use(challanSettingsRouter);
router.use(printSignaturesRouter);

export default router;
