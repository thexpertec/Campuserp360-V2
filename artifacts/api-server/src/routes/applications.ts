import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import { db, applicationsTable, applicationEventsTable, classesTable, paymentTransactionsTable, admissionsSettingsTable } from "@workspace/db";
import { eq, asc, gte, sql, desc, or, and, inArray } from "drizzle-orm";
import { postApplicationFeeJE } from "../lib/je-factory.js";
import { SubmitApplicationBody, LookupApplicationBody } from "@workspace/api-zod";
import { resolveTenant, resolveTenantStrict } from "../lib/tenant.js";
import { resolvePaymentConfig } from "../lib/payment-config-cache.js";
import {
  getPublicBaseUrl,
  makeTxnRef,
  type Gateway,
} from "../lib/payments/gateways.js";
import { resolveGatewayCredentials } from "../lib/gateway-credentials-cache.js";
import { buildJazzCashCheckout, verifyJazzCashResponse } from "../lib/payments/jazzcash.js";
import {
  buildPayFastCheckout,
  getPayFastAccessToken,
  verifyPayFastResponse,
} from "../lib/payments/payfast.js";
import { canonicalizeCnic, canonicalizePhone } from "../lib/format-utils.js";
import { putObject } from "../lib/storage.js";
import { loadCandidateReferencePrefix, buildReferenceId } from "../lib/reference-id.js";
import { loadAdmissionsWindow, admissionsWindowBlockReason } from "../lib/admissions-window.js";
import { hashPortalPassword } from "../lib/portal-password.js";

const router: IRouter = Router();

// ── In-memory rate limiter for lookup ────────────────────────────────────────
// Two layers:
//  • Per-IP fixed window: max 20 attempts per 5 minutes.
//  • Per-reference soft lockout: 8 consecutive failures lock that reference
//    for 15 minutes from any IP. Resets on success.
//
// In-memory is fine for a single-instance dev/staging deployment. Swap for
// Redis if we ever scale horizontally.

type WindowEntry = { count: number; resetAt: number };
type RefEntry = { fails: number; lockUntil: number };

const IP_WINDOW_MS = 5 * 60 * 1000;
const IP_MAX = 20;
const REF_LOCK_THRESHOLD = 8;
const REF_LOCK_MS = 15 * 60 * 1000;

const ipBuckets = new Map<string, WindowEntry>();
const refBuckets = new Map<string, RefEntry>();

function checkIpRate(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const entry = ipBuckets.get(ip);
  if (!entry || entry.resetAt <= now) {
    ipBuckets.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
    return { ok: true };
  }
  if (entry.count >= IP_MAX) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
  entry.count += 1;
  return { ok: true };
}

function checkRefLock(refId: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const entry = refBuckets.get(refId);
  if (entry && entry.lockUntil > now) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((entry.lockUntil - now) / 1000)) };
  }
  return { ok: true };
}

function recordRefFailure(refId: string): void {
  const now = Date.now();
  const entry = refBuckets.get(refId) ?? { fails: 0, lockUntil: 0 };
  entry.fails += 1;
  if (entry.fails >= REF_LOCK_THRESHOLD) {
    entry.lockUntil = now + REF_LOCK_MS;
    entry.fails = 0;
  }
  refBuckets.set(refId, entry);
}

function clearRefFailures(refId: string): void {
  refBuckets.delete(refId);
}

// Opportunistic cleanup to avoid unbounded growth.
function sweep(): void {
  const now = Date.now();
  for (const [k, v] of ipBuckets) if (v.resetAt <= now) ipBuckets.delete(k);
  for (const [k, v] of refBuckets) if (v.lockUntil > 0 && v.lockUntil <= now) refBuckets.delete(k);
}
setInterval(sweep, 5 * 60 * 1000).unref();

// ── Live admissions stats ────────────────────────────────────────────────────
// Returns the running tally for the current admissions session. Combines the
// real DB count with a stable historical baseline (offline applications from
// previous years carry forward into the current session count) so the homepage
// counter never starts at zero in a fresh install.
//
// Cached for 15 seconds to keep this cheap even if hammered by polling clients.
// Session start and optional historical baseline are per-tenant settings.
async function loadStatsConfig(tenantId: string): Promise<{ sessionStart: Date; historicalBaseline: number; sessionLabel: string }> {
  const keys = [
    `admissions_session_start:${tenantId}`,
    `stats_historical_baseline:${tenantId}`,
    `admissions_session:${tenantId}`,
    "admissions_session_start",
    "stats_historical_baseline",
    "admissions_session",
  ];
  const rows = await db
    .select()
    .from(admissionsSettingsTable)
    .where(inArray(admissionsSettingsTable.key, keys));
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  const sessionStartRaw =
    map[`admissions_session_start:${tenantId}`] ??
    map["admissions_session_start"] ??
    `${new Date().getFullYear()}-01-01`;
  const sessionStart = new Date(`${sessionStartRaw}T00:00:00Z`);
  const baselineRaw =
    map[`stats_historical_baseline:${tenantId}`] ??
    map["stats_historical_baseline"] ??
    "0";
  const historicalBaseline = Math.max(0, Number(baselineRaw) || 0);
  const sessionLabel =
    map[`admissions_session:${tenantId}`] ??
    map["admissions_session"] ??
    `Admissions ${sessionStart.getUTCFullYear()}`;

  return { sessionStart, historicalBaseline, sessionLabel };
}
// Total seats is the sum of `seats` across all active classes in the DB.
// Falls back to 0 when no classes are configured.
async function fetchTotalSeats(tenantId: string): Promise<number> {
  const [{ total = 0 } = { total: 0 }] = await db
    .select({ total: sql<number>`COALESCE(SUM(${classesTable.seats}), 0)::int` })
    .from(classesTable)
    .where(and(eq(classesTable.active, true), eq(classesTable.tenantId, tenantId)));
  return Number(total);
}
const STATS_TTL_MS = 15 * 1000;
// Keyed by tenantId so each tenant's stats are cached independently.
// A single global cache would leak one tenant's metrics to another during TTL.
const statsCacheByTenant = new Map<string, { value: StatsPayload; expiresAt: number }>();

type StatsPayload = {
  session: string;
  totalThisSession: number;
  totalSeats: number;
  spotsRemaining: number;
  submissions24h: number;
  lastSubmittedAt: string | null;
  serverTime: string;
};

router.get("/applications/stats", async (req: Request, res: Response) => {
  const now = Date.now();

  // Scope stats to the requesting tenant so each college sees its own numbers.
  // Non-strict: fallback resolution (DEFAULT_SLUG / first active tenant) is
  // acceptable for this read-only counter — the tenantFilter already scopes
  // results so no cross-tenant data leaks. Return 404 only when no tenants
  // exist at all (empty DB), not on an unconfident fallback.
  const { tenant: statsTenant } = await resolveTenant(req);
  if (!statsTenant) {
    return res.status(404).json({ error: "No tenant found." });
  }

  // Per-tenant cache — never share one tenant's payload with another.
  const cached = statsCacheByTenant.get(statsTenant.id);
  if (cached && cached.expiresAt > now) {
    res.setHeader("Cache-Control", "public, max-age=15");
    return res.json(cached.value);
  }

  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const tenantFilter = eq(applicationsTable.tenantId, statsTenant.id);

  try {
    const statsConfig = await loadStatsConfig(statsTenant.id);

    const [{ count: totalReal = 0 } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(applicationsTable)
      .where(and(gte(applicationsTable.createdAt, statsConfig.sessionStart), tenantFilter));

    const [{ count: admittedCount = 0 } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(applicationsTable)
      .where(and(
        tenantFilter,
        inArray(applicationsTable.status, ["admitted", "enrolled"]),
      ));

    const [{ count: last24 = 0 } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(applicationsTable)
      .where(and(gte(applicationsTable.createdAt, since24h), tenantFilter));

    const [latest] = await db
      .select({ createdAt: applicationsTable.createdAt })
      .from(applicationsTable)
      .where(tenantFilter)
      .orderBy(desc(applicationsTable.createdAt))
      .limit(1);

    const totalSeats = await fetchTotalSeats(statsTenant.id);
    const total = statsConfig.historicalBaseline + Number(totalReal);
    const spots = Math.max(0, totalSeats - Number(admittedCount));

    const payload: StatsPayload = {
      session: statsConfig.sessionLabel,
      totalThisSession: total,
      totalSeats,
      spotsRemaining: spots,
      submissions24h: Number(last24),
      lastSubmittedAt: latest ? new Date(latest.createdAt).toISOString() : null,
      serverTime: new Date(now).toISOString(),
    };

    statsCacheByTenant.set(statsTenant.id, { value: payload, expiresAt: now + STATS_TTL_MS });
    res.setHeader("Cache-Control", "public, max-age=15");
    return res.json(payload);
  } catch (err) {
    req.log?.error?.({ err }, "Failed to compute application stats");
    const fallbackSeats = cached?.value.totalSeats ?? 0;
    const fallback: StatsPayload = {
      session: cached?.value.session ?? `Admissions ${new Date().getUTCFullYear()}`,
      totalThisSession: cached?.value.totalThisSession ?? 0,
      totalSeats: fallbackSeats,
      spotsRemaining: cached?.value.spotsRemaining ?? fallbackSeats,
      submissions24h: 0,
      lastSubmittedAt: null,
      serverTime: new Date(now).toISOString(),
    };
    return res.json(fallback);
  }
});

// Invalidate the cache entry for a specific tenant so the counter ticks up
// for the very next poller without waiting on TTL.
function invalidateStatsCache(tenantId?: string): void {
  if (tenantId) {
    statsCacheByTenant.delete(tenantId);
  } else {
    statsCacheByTenant.clear();
  }
}

// Turn Zod validation issues into a compact, field-keyed list the frontend can
// map back onto specific form inputs (instead of showing one generic error).
function zodFieldErrors(issues: { path: (string | number)[]; message: string }[]) {
  const seen = new Set<string>();
  const fields: { field: string; message: string }[] = [];
  for (const it of issues) {
    const field = it.path.filter((p) => typeof p === "string").join(".") || "form";
    if (seen.has(field)) continue;
    seen.add(field);
    fields.push({ field, message: it.message });
  }
  return fields;
}

router.post("/applications", async (req: Request, res: Response) => {
  const parsed = SubmitApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ issues: parsed.error.issues }, "Invalid application submission");
    return res.status(400).json({
      error: "Please correct the highlighted fields and try again.",
      fields: zodFieldErrors(parsed.error.issues),
    });
  }
  const input = parsed.data;

  // Resolve the tenant from the incoming request so applications are stamped
  // with the correct college. The gateway always injects x-tenant-slug so this
  // will return the right tenant for every sub-domain / path-prefix site.
  // Strict: if tenant resolution falls back to DEFAULT_SLUG or first-active,
  // the request is ambiguous — refuse to write rather than silently misattribute.
  const tenant = await resolveTenantStrict(req);
  if (!tenant) {
    return res.status(400).json({
      error: "Tenant could not be determined. Check the form URL.",
    });
  }
  const tenantId = tenant.id;

  const admissionsWindow = await loadAdmissionsWindow(tenantId);
  const windowBlock = admissionsWindowBlockReason(admissionsWindow);
  if (windowBlock) {
    return res.status(403).json({ error: windowBlock });
  }

  const canonicalCnic = canonicalizeCnic(input.parentCnic);
  if (!canonicalCnic) {
    return res
      .status(400)
      .json({ error: "Parent CNIC must contain exactly 13 digits (e.g. 35201-1234567-9)." });
  }
  const cnicLast4 = canonicalCnic.replace(/\D/g, "").slice(-4);

  // Normalize the student B-form the same way as parent CNIC.
  const bFormRaw = (input as any).studentBForm as string | undefined;
  if (bFormRaw && !canonicalizeCnic(bFormRaw)) {
    return res
      .status(400)
      .json({ error: "Student B-Form / CNIC must contain exactly 13 digits." });
  }
  const canonicalBForm = bFormRaw ? canonicalizeCnic(bFormRaw) : null;

  // ── Duplicate detection (scoped to tenant + session) ─────────────────────
  // A student may legitimately apply in a different academic session (e.g. next
  // year after failing), so we scope only within the SAME tenant AND session.
  // Checks: studentEmail OR studentMobile OR studentBForm.
  // Parent CNIC is intentionally NOT checked — one parent may have multiple children.
  const tenantDupFilter = eq(applicationsTable.tenantId, tenantId);

  // Only include a field in the duplicate check when the payload actually contains
  // it — if the admin disabled the field, it won't be submitted and we must not
  // compare undefined/null against existing rows (that would produce false negatives
  // or unexpected db behaviour).
  const dupOrClauses = [
    ...(input.studentEmail  ? [eq(applicationsTable.studentEmail, input.studentEmail)]   : []),
    ...(input.studentMobile ? [eq(applicationsTable.studentMobile, input.studentMobile)] : []),
    ...(canonicalBForm      ? [eq(applicationsTable.studentBForm, canonicalBForm)]        : []),
  ];

  // Fetch ALL matches so we can deterministically determine the conflict type.
  // Scoped to same tenant only — cross-tenant is fine, but re-submitting the same
  // student identity (email/mobile/B-form) within the same tenant is blocked regardless
  // of academic session. A student who was rejected in one session cannot sneak in a
  // second application for a later session using the same credentials.
  // Priority: B-form (most unique) > email+phone > email > phone.
  //
  // If the tenant has disabled all three identity fields (email, mobile, studentBForm),
  // dupOrClauses will be empty. In that case there is no identity to deduplicate on, so
  // we skip the check entirely rather than issuing an unbounded tenant-wide query that
  // would falsely flag every subsequent submission as a duplicate.
  const existing = dupOrClauses.length === 0
    ? []
    : await db
        .select({
          referenceId:   applicationsTable.referenceId,
          studentEmail:  applicationsTable.studentEmail,
          studentMobile: applicationsTable.studentMobile,
          studentBForm:  applicationsTable.studentBForm,
        })
        .from(applicationsTable)
        .where(and(
          tenantDupFilter,
          or(...dupOrClauses),
        ));

  if (existing.length > 0) {
    // Aggregate conflict types across all matching rows.
    let hasBForm  = false;
    let hasEmail  = false;
    let hasPhone  = false;
    let bestRef   = existing[0]!.referenceId;

    for (const row of existing) {
      const bm = canonicalBForm !== null && row.studentBForm === canonicalBForm;
      const em = !!input.studentEmail  && row.studentEmail  === input.studentEmail;
      const pm = !!input.studentMobile && row.studentMobile === input.studentMobile;
      if (bm) { hasBForm = true; bestRef = row.referenceId; break; }
      if (em) { hasEmail = true; bestRef = row.referenceId; }
      if (pm) { hasPhone = true; bestRef = row.referenceId; }
    }

    const code =
      hasBForm              ? "duplicate_bform"
      : hasEmail && hasPhone ? "duplicate_email_and_phone"
      : hasEmail             ? "duplicate_email"
      :                        "duplicate_phone";

    return res.status(409).json({
      error: "An application with these details already exists.",
      code,
      existingReferenceId: bestRef,
    });
  }

  // Generate a unique reference ID within this tenant, retrying on collision.
  const refPrefix = await loadCandidateReferencePrefix(tenantId);
  let referenceId = buildReferenceId(refPrefix);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const clash = await db
      .select({ id: applicationsTable.id })
      .from(applicationsTable)
      .where(and(eq(applicationsTable.referenceId, referenceId), eq(applicationsTable.tenantId, tenantId)))
      .limit(1);
    if (clash.length === 0) break;
    referenceId = buildReferenceId(refPrefix);
  }

  // Handle optional bank receipt upload (base64-encoded file from the frontend)
  let feeReceiptUrl: string | null = null;
  const receiptBase64 = (req.body as any).receiptBase64 as string | undefined;
  const receiptMime   = (req.body as any).receiptMime   as string | undefined;
  const receiptName   = (req.body as any).receiptName   as string | undefined;
  if (receiptBase64 && receiptMime) {
    const ext = receiptName?.split(".").pop() ?? "bin";
    const key = `fee-receipts/${tenantId}/${referenceId}-${Date.now()}.${ext}`;
    const buf = Buffer.from(receiptBase64, "base64");
    if (buf.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "Receipt file exceeds 5 MB limit" });
    }
    feeReceiptUrl = await putObject(key, buf, receiptMime);
  }

  try {
    const defaultPortalPassword = await hashPortalPassword("12345");
    const [created] = await db
      .insert(applicationsTable)
      .values({
        referenceId,
        session: input.session,
        classApplying: input.classApplying,
        previousMarks: input.previousMarks,
        fullName: input.fullName,
        gender: (input as any).gender ?? null,
        dateOfBirth: input.dateOfBirth,
        // Configurable fields: disabled ones are stripped from the frontend payload.
        // We normalise to "" so NOT NULL DB columns never receive undefined.
        bloodGroup: input.bloodGroup ?? "",
        religion: input.religion ?? null,
        photoFilename: input.photoFilename ?? null,
        studentMobile: input.studentMobile ?? "",
        studentEmail: input.studentEmail ?? "",
        presentAddress: input.presentAddress,
        state: input.state ?? "",
        city: input.city ?? "",
        examCenter: input.examCenter ?? "",
        nationality: input.nationality ?? null,
        domicile: input.domicile ?? null,
        motherName: input.motherName ?? null,
        guardianName: input.guardianName,
        relation: input.relation ?? "",
        fatherName: input.fatherName,
        occupation: input.occupation ?? null,
        guardianMobile: input.guardianMobile,
        guardianEmail: input.guardianEmail ?? null,
        alternatePhone: input.alternatePhone ?? null,
        studentBForm: canonicalBForm ?? null,
        parentCnic: canonicalCnic,
        parentCnicLast4: cnicLast4,
        status: "received",
        tenantId,
        portalPassword: defaultPortalPassword,
        // Payment step fields
        paymentMethod: (input as any).paymentMethod ?? null,
        feeBankRef: (input as any).paymentReference ?? null,
        feeStatus: (input as any).paymentStatus ?? "pending",
        feeReceiptUrl: feeReceiptUrl ?? null,
      })
      .returning();

    if (!created) {
      throw new Error("Insert did not return a row");
    }

    await db.insert(applicationEventsTable).values({
      applicationId: created.id,
      eventType: "received",
      title: "Application Received",
      description:
        "Your application was submitted successfully via the online portal. We will verify your documents within 2-3 working days.",
      occurredAt: created.createdAt,
    });

    invalidateStatsCache(tenantId);

    return res.status(201).json({
      referenceId: created.referenceId,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create application");
    return res.status(500).json({ error: "Failed to save application" });
  }
});

router.post("/applications/lookup", async (req: Request, res: Response) => {
  const parsed = LookupApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid lookup request" });
  }
  const referenceId = parsed.data.referenceId.toUpperCase().trim();
  const cnicLast4 = parsed.data.cnicLast4;

  // Throttle: per-IP fixed window first, then per-reference soft lockout.
  const ip = (req.ip || req.socket.remoteAddress || "unknown").toString();
  const ipCheck = checkIpRate(ip);
  if (!ipCheck.ok) {
    res.setHeader("Retry-After", String(ipCheck.retryAfterSec));
    return res.status(429).json({
      error: "Too many lookup attempts from this device. Please try again shortly.",
    });
  }
  const refCheck = checkRefLock(referenceId);
  if (!refCheck.ok) {
    res.setHeader("Retry-After", String(refCheck.retryAfterSec));
    return res.status(429).json({
      error: "Too many failed attempts for this reference. Please try again in a few minutes.",
    });
  }

  // Scope lookup to the requesting tenant so candidates can't guess reference
  // IDs from other institutions. Strict: ambiguous resolution returns 400 so a
  // conflicting ?tenant= cannot probe another school's application data.
  const lookupTenant = await resolveTenantStrict(req);
  if (!lookupTenant) {
    return res.status(400).json({
      error: "Tenant could not be determined. Check the form URL.",
    });
  }
  const tenantLookupFilter = and(
    eq(applicationsTable.referenceId, referenceId),
    eq(applicationsTable.tenantId, lookupTenant.id),
  );

  try {
    const [app] = await db
      .select()
      .from(applicationsTable)
      .where(tenantLookupFilter)
      .limit(1);

    if (!app || app.parentCnicLast4 !== cnicLast4) {
      recordRefFailure(referenceId);
      req.log.warn({ ip, referenceId }, "Application lookup failed");
      // Do not leak existence of the reference ID.
      return res
        .status(404)
        .json({ error: "No application matches that reference ID and CNIC." });
    }

    clearRefFailures(referenceId);

    const events = await db
      .select()
      .from(applicationEventsTable)
      .where(eq(applicationEventsTable.applicationId, app.id))
      .orderBy(asc(applicationEventsTable.occurredAt));

    return res.json({
      referenceId: app.referenceId,
      status: app.status,
      fullName: app.fullName,
      dateOfBirth: app.dateOfBirth,
      classApplying: app.classApplying,
      session: app.session,
      examCenter: app.examCenter,
      city: app.city,
      state: app.state,
      rollNumber: app.rollNumber,
      testDate: app.testDate ? app.testDate.toISOString() : null,
      resultMarks: app.resultMarks,
      feeStatus: app.feeStatus ?? "pending",
      paymentMethod: app.paymentMethod ?? null,
      createdAt: app.createdAt.toISOString(),
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        title: e.title,
        description: e.description,
        occurredAt: e.occurredAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to lookup application");
    return res.status(500).json({ error: "Failed to look up application" });
  }
});

// ── Public: list active classes (for admission form selects) ─────────────────
router.get("/public/classes", async (req: Request, res: Response) => {
  try {
    const publicTenantId = (req as any).tenantId as string | undefined;
    const rows = await db
      .select({ code: classesTable.code, name: classesTable.name, eligibility: classesTable.eligibility, seats: classesTable.seats })
      .from(classesTable)
      .where(and(eq(classesTable.active, true), publicTenantId ? eq(classesTable.tenantId, publicTenantId) : sql`false`))
      .orderBy(asc(classesTable.sortOrder));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list public classes");
    return res.status(500).json({ error: "Failed to list classes" });
  }
});

// ── Online payment initiation for the admission form ─────────────────────────
// This is the unauthenticated counterpart of /portal/payments/initiate.
// The admission form calls this INSTEAD OF submitting the application normally
// when the user picks JazzCash or PayFast. We:
//   1. Build the gateway checkout (may fail if unconfigured — before touching DB)
//   2. Create the application with feeStatus "gateway_pending"
//   3. Record a payment_transaction row
//   4. Return the actionUrl + form fields so the browser can auto-POST to the gateway
//
// Body: full application form fields  +  gateway: "jazzcash" | "payfast"
const urlencodedParser = express.urlencoded({ extended: true });

const VALID_GATEWAYS: Gateway[] = ["jazzcash", "payfast"];

router.post("/applications/payment/initiate", async (req: Request, res: Response) => {
  const { gateway, ...formData } = req.body as Record<string, unknown> & { gateway?: string };

  if (!gateway || !VALID_GATEWAYS.includes(gateway as Gateway)) {
    return res.status(400).json({ error: "Invalid or missing gateway" });
  }
  const gw = gateway as Gateway;

  const parsed = SubmitApplicationBody.safeParse(formData);
  if (!parsed.success) {
    req.log.warn({ issues: parsed.error.issues }, "Invalid application data in payment/initiate");
    return res.status(400).json({
      error: "Please correct the highlighted fields and try again.",
      fields: zodFieldErrors(parsed.error.issues),
    });
  }
  const input = parsed.data;

  const canonicalCnic = canonicalizeCnic(input.parentCnic);
  if (!canonicalCnic) {
    return res.status(400).json({ error: "Parent CNIC must contain exactly 13 digits." });
  }
  const cnicLast4 = canonicalCnic.replace(/\D/g, "").slice(-4);

  const bFormRaw = (input as any).studentBForm as string | undefined;
  if (bFormRaw && !canonicalizeCnic(bFormRaw)) {
    return res.status(400).json({ error: "Student B-Form / CNIC must contain exactly 13 digits." });
  }
  const canonicalBForm = bFormRaw ? canonicalizeCnic(bFormRaw) : null;

  // Strict: ambiguous resolution must not stamp a write with the wrong tenant.
  const tenant = await resolveTenantStrict(req);
  if (!tenant) {
    return res.status(400).json({
      error: "Tenant could not be determined. Check the form URL.",
    });
  }
  const tenantId = tenant.id;

  const admissionsWindow = await loadAdmissionsWindow(tenantId);
  const windowBlock = admissionsWindowBlockReason(admissionsWindow);
  if (windowBlock) {
    return res.status(403).json({ error: windowBlock });
  }

  // Load per-tenant gateway credentials (DB-first, env-var fallback)
  const creds = await resolveGatewayCredentials(tenantId);

  // Check gateway is configured before touching the DB
  const configured = gw === "jazzcash" ? creds.jazzcash.configured : creds.payfast.configured;
  if (!configured) {
    return res.status(503).json({
      error: `${gw === "jazzcash" ? "JazzCash" : "PayFast"} online payment is not configured. Please use bank transfer.`,
    });
  }

  // Resolve configured fee amount for this tenant
  const payConfig = tenantId ? await resolvePaymentConfig(tenantId) : null;
  const amountRupees = payConfig?.applicationFeeAmount ?? 2000;

  const base = getPublicBaseUrl(req);
  const returnUrl = `${base}/api/applications/payment/${gw}/return`;
  const txnRef = makeTxnRef("APP");
  const description = `CCM Application Fee`;

  // Build the gateway checkout BEFORE touching the DB so a misconfigured gateway
  // fails cleanly without creating an orphaned application.
  let actionUrl: string;
  let fields: Record<string, string>;
  try {
    if (gw === "jazzcash") {
      const checkout = buildJazzCashCheckout({
        amountRupees,
        txnRef,
        returnUrl,
        billReference: txnRef,
        description,
      }, creds.jazzcash);
      actionUrl = checkout.actionUrl;
      fields = checkout.fields;
    } else {
      const token = await getPayFastAccessToken({ basketId: txnRef, amountRupees }, creds.payfast);
      const checkout = buildPayFastCheckout({
        token,
        amountRupees,
        basketId: txnRef,
        description,
        customerEmail: input.studentEmail ?? "",
        customerMobile: input.studentMobile ?? "",
        successUrl: returnUrl,
        failureUrl: returnUrl,
        checkoutUrl: returnUrl,
      }, creds.payfast);
      actionUrl = checkout.actionUrl;
      fields = checkout.fields;
    }
  } catch (err) {
    req.log.error({ err, gw }, "Gateway checkout build failed");
    return res.status(503).json({ error: "Failed to prepare gateway payment. Please try bank transfer." });
  }

  // Duplicate detection (same as the normal submit flow)
  const tenantDupFilter = eq(applicationsTable.tenantId, tenantId);

  const dupOrClauses = [
    ...(input.studentEmail  ? [eq(applicationsTable.studentEmail, input.studentEmail)]   : []),
    ...(input.studentMobile ? [eq(applicationsTable.studentMobile, input.studentMobile)] : []),
    ...(canonicalBForm      ? [eq(applicationsTable.studentBForm, canonicalBForm)]        : []),
  ];
  const existingDups = dupOrClauses.length === 0
    ? []
    : await db.select({ referenceId: applicationsTable.referenceId, studentBForm: applicationsTable.studentBForm, studentEmail: applicationsTable.studentEmail, studentMobile: applicationsTable.studentMobile })
        .from(applicationsTable)
        .where(and(tenantDupFilter, or(...dupOrClauses)));

  if (existingDups.length > 0) {
    let hasBForm = false, bestRef = existingDups[0]!.referenceId;
    for (const row of existingDups) {
      if (canonicalBForm && row.studentBForm === canonicalBForm) { hasBForm = true; bestRef = row.referenceId; break; }
    }
    const code = hasBForm ? "duplicate_bform" : "duplicate_email";
    return res.status(409).json({ error: "An application with these details already exists.", code, existingReferenceId: bestRef });
  }

  // Generate unique reference ID
  const refPrefix = await loadCandidateReferencePrefix(tenantId);
  let referenceId = buildReferenceId(refPrefix);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const clash = await db.select({ id: applicationsTable.id }).from(applicationsTable).where(eq(applicationsTable.referenceId, referenceId)).limit(1);
    if (clash.length === 0) break;
    referenceId = buildReferenceId(refPrefix);
  }

  try {
    const defaultPortalPassword = await hashPortalPassword("12345");
    const [created] = await db
      .insert(applicationsTable)
      .values({
        referenceId,
        session: input.session,
        classApplying: input.classApplying,
        previousMarks: input.previousMarks,
        fullName: input.fullName,
        gender: (input as any).gender ?? null,
        dateOfBirth: input.dateOfBirth,
        bloodGroup: input.bloodGroup ?? "",
        religion: input.religion ?? null,
        photoFilename: input.photoFilename ?? null,
        studentMobile: input.studentMobile ?? "",
        studentEmail: input.studentEmail ?? "",
        presentAddress: input.presentAddress,
        state: input.state ?? "",
        city: input.city ?? "",
        examCenter: input.examCenter ?? "",
        nationality: (input as any).nationality ?? null,
        domicile: (input as any).domicile ?? null,
        motherName: (input as any).motherName ?? null,
        guardianName: input.guardianName,
        relation: input.relation ?? "",
        fatherName: input.fatherName,
        occupation: input.occupation ?? null,
        guardianMobile: input.guardianMobile,
        guardianEmail: (input as any).guardianEmail ?? null,
        alternatePhone: (input as any).alternatePhone ?? null,
        studentBForm: canonicalBForm ?? null,
        parentCnic: canonicalCnic,
        parentCnicLast4: cnicLast4,
        status: "received",
        tenantId,
        portalPassword: defaultPortalPassword,
        paymentMethod: gw,
        feeStatus: "gateway_pending",
      })
      .returning();

    if (!created) throw new Error("Insert did not return a row");

    await db.insert(paymentTransactionsTable).values({
      applicationId: created.id,
      tenantId,
      feeType: "application",
      gateway: gw,
      amount: amountRupees,
      txnRef,
      status: "initiated",
    });

    await db.insert(applicationEventsTable).values({
      applicationId: created.id,
      eventType: "received",
      title: "Application Received — Payment Pending",
      description: `Application submitted. Awaiting ${gw === "jazzcash" ? "JazzCash" : "PayFast"} payment confirmation (ref: ${txnRef}).`,
      occurredAt: created.createdAt,
    });

    invalidateStatsCache(tenantId);

    return res.status(201).json({ referenceId: created.referenceId, txnRef, gateway: gw, actionUrl, fields });
  } catch (err) {
    req.log.error({ err }, "Failed to create application for gateway payment");
    return res.status(500).json({ error: "Failed to save application" });
  }
});

// ── Gateway return handlers for admission form payments ───────────────────────
// Gateways redirect the browser here after payment. We verify the payload,
// update the application fee status, then redirect back to the admissions page
// with ?payment=success&ref=CCM-XXX (or ?payment=failed).

function redirectToAdmissions(req: Request, res: Response, outcome: "success" | "failed", referenceId?: string): void {
  const base = getPublicBaseUrl(req);
  const params = new URLSearchParams({ payment: outcome });
  if (referenceId) params.set("ref", referenceId);
  res.redirect(302, `${base}/admissions?${params.toString()}`);
}

async function handleApplicationReturn(gw: Gateway, req: Request, res: Response): Promise<void> {
  const params: Record<string, string> = {
    ...(req.query as Record<string, string>),
    ...(req.body as Record<string, string>),
  };
  const raw = JSON.stringify(params);

  try {
    // Step 1: extract txnRef without credentials (fields don't need signing)
    const txnRef = gw === "jazzcash"
      ? (params.pp_TxnRefNo || "")
      : (params.basket_id || params.BASKET_ID || "");

    if (!txnRef) return redirectToAdmissions(req, res, "failed");

    // Step 2: look up the transaction and application to get tenantId
    const [txn] = await db
      .select()
      .from(paymentTransactionsTable)
      .where(eq(paymentTransactionsTable.txnRef, txnRef))
      .limit(1);

    if (!txn) return redirectToAdmissions(req, res, "failed");
    if (txn.gateway !== gw) return redirectToAdmissions(req, res, "failed");

    const [app] = await db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.id, txn.applicationId))
      .limit(1);

    if (!app) return redirectToAdmissions(req, res, "failed");

    // Already processed
    if (txn.status === "paid") return redirectToAdmissions(req, res, "success", app.referenceId);
    if (txn.status !== "initiated") return redirectToAdmissions(req, res, "failed", app.referenceId);

    // Step 3: resolve per-tenant credentials so the signature check uses the right key
    const creds = app.tenantId ? await resolveGatewayCredentials(app.tenantId) : null;

    // Step 4: verify signature and extract result with the correct credentials
    let success: boolean;
    let validSignature: boolean;
    let amountRupees: number;
    let responseCode: string;
    let responseMessage: string;
    let gatewayTxnId: string;

    if (gw === "jazzcash") {
      const r = verifyJazzCashResponse(params, creds?.jazzcash);
      success = r.success;
      validSignature = r.validSignature;
      amountRupees = Math.round(r.amountPaisa / 100);
      responseCode = r.responseCode;
      responseMessage = r.responseMessage;
      gatewayTxnId = r.gatewayTxnId;
    } else {
      const r = verifyPayFastResponse(params, creds?.payfast);
      success = r.success;
      validSignature = r.validSignature;
      amountRupees = r.amountRupees;
      responseCode = r.responseCode;
      responseMessage = r.responseMessage;
      gatewayTxnId = r.gatewayTxnId;
    }

    if (!success) {
      if (validSignature) {
        await db.update(paymentTransactionsTable).set({ status: "failed", responseCode, responseMessage, rawResponse: raw }).where(eq(paymentTransactionsTable.id, txn.id));
        await db.update(applicationsTable).set({ feeStatus: "failed" }).where(eq(applicationsTable.id, app.id));
      }
      return redirectToAdmissions(req, res, "failed", app.referenceId);
    }

    // Amount reconciliation
    if (amountRupees !== txn.amount) {
      req.log?.warn?.({ txnRef, expected: txn.amount, received: amountRupees }, "Application payment amount mismatch");
      await db.update(paymentTransactionsTable).set({ status: "failed", responseCode, responseMessage: "Amount mismatch", rawResponse: raw }).where(eq(paymentTransactionsTable.id, txn.id));
      await db.update(applicationsTable).set({ feeStatus: "failed" }).where(eq(applicationsTable.id, app.id));
      return redirectToAdmissions(req, res, "failed", app.referenceId);
    }

    // Mark paid
    const ref = gatewayTxnId || txnRef;
    await db.update(paymentTransactionsTable).set({ status: "paid", gatewayTxnId, paidAt: new Date(), responseCode, responseMessage, rawResponse: raw }).where(eq(paymentTransactionsTable.id, txn.id));
    await db.update(applicationsTable).set({ feeStatus: "paid", feeBankRef: ref, feeSubmittedAt: app.feeSubmittedAt ?? new Date(), feeConfirmedAt: new Date() }).where(eq(applicationsTable.id, app.id));
    await db.insert(applicationEventsTable).values({
      applicationId: app.id,
      eventType: "fee_submitted",
      title: "Application Fee Paid Online",
      description: `Paid via ${gw === "jazzcash" ? "JazzCash" : "PayFast"}. Transaction: ${ref}.`,
    });

    // Post journal entry: DR cash/bank, CR Application Fee Income (4300)
    // Fire-and-forget: gateway redirect must not be delayed by JE posting.
    const tenantId = app.tenantId;
    if (tenantId && txn.amount && txn.amount > 0) {
      void postApplicationFeeJE({
        tenantId,
        amount:      txn.amount,
        reference:   ref,
        date:        new Date().toISOString().slice(0, 10),
        sourceRefId: txn.id,
        description: "Application fee received",
        narrationDebit: `Via ${gw}`,
        logger:      req.log ?? undefined,
      }).catch((jeErr: unknown) => {
        req.log?.error?.({ err: jeErr }, "applications.ts online application-fee JE failed");
      });
    }

    return redirectToAdmissions(req, res, "success", app.referenceId);
  } catch (err) {
    req.log?.error?.({ err }, "Application payment return error");
    return redirectToAdmissions(req, res, "failed");
  }
}

router.post("/applications/payment/:gateway/return", urlencodedParser, (req: Request, res: Response) => {
  const gw = req.params.gateway as Gateway;
  if (!VALID_GATEWAYS.includes(gw)) return redirectToAdmissions(req, res, "failed");
  return handleApplicationReturn(gw, req, res);
});

router.get("/applications/payment/:gateway/return", (req: Request, res: Response) => {
  const gw = req.params.gateway as Gateway;
  if (!VALID_GATEWAYS.includes(gw)) return redirectToAdmissions(req, res, "failed");
  return handleApplicationReturn(gw, req, res);
});

export default router;
