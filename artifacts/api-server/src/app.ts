import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { verifyToken } from "./lib/admin-auth";
import { verifyPortalToken } from "./lib/portal-auth";
import { db } from "@workspace/db";
import {
  employeeDocumentsTable,
  employeesTable,
  studentDocumentsTable,
  studentsTable,
  applicationDocumentsTable,
  applicationsTable,
} from "@workspace/db";
import { eq, and, or } from "drizzle-orm";

const app: Express = express();

// ── Trust proxy — required in production behind Replit's reverse proxy ────────
// Without this, express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// because X-Forwarded-For headers arrive but Express doesn't trust them.
app.set("trust proxy", 1);

// ── Security headers (Helmet) ─────────────────────────────────────────────────
app.use(
  helmet({
    // CSP is intentionally relaxed here — the admin SPA loads assets from same origin
    contentSecurityPolicy: false,
  }),
);

// ── CORS — Replit domains + custom tenant domains ────────────────────────────
// Extra origins can be added at deploy time via ALLOWED_ORIGINS (comma-separated).
const extraOrigins: Set<string> = new Set(
  (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean),
);

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin requests (server-to-server, curl) have no origin header — allow them
      if (!origin) return callback(null, true);
      const allowed =
        /\.replit\.app$/.test(origin) ||
        /\.replit\.dev$/.test(origin) ||
        /\.erp360\.org$/.test(origin) ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
        extraOrigins.has(origin);
      if (allowed) return callback(null, true);
      logger.warn({ origin }, "CORS: rejected request from unknown origin");
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

// ── Request logging ───────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// ── Body parsers — 10 MB limit kept for base64 file uploads ──────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ── Authenticated file serving ────────────────────────────────────────────────
// Serves files from the uploads/ directory only to authenticated admin or portal users.
// NOTE: In production, R2 object storage is used — the API download routes generate
// signed R2 URLs with a 5-minute expiry and tenant ownership checks baked in. The
// /uploads/ path below is a LOCAL DEV FALLBACK only; it is never reached in production.
//
// Accepts Bearer token in Authorization header OR ?token= query param (for <img src> usage).
const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Sensitive document paths require auth — profile photos stay public.
// Admin-only paths: docs/, student-docs/, employee-docs/ — admin token required.
// Portal+admin paths: portal-docs/, application-docs/ — either token accepted.
const ADMIN_ONLY_DIRS   = /^\/(docs|student-docs|employee-docs)\//;
const PORTAL_ADMIN_DIRS = /^\/(portal-docs|application-docs)\//;

/**
 * For local-dev fallback uploads: check that the requested file belongs to the
 * requesting admin/portal user's tenant. Super-admins (no tenantId on token) bypass
 * this check. Returns true ONLY when ownership is positively confirmed.
 *
 * Fail-closed: returns false for protected document paths when:
 *   - No matching DB record is found (file may have been deleted or key is unexpected)
 *   - A DB error occurs (fail safe — do not grant access on uncertainty)
 *
 * NOTE: Production uses R2 with signed URLs (5-min expiry + tenant checks baked in);
 * this local-dev static fallback is intentionally strict.
 */
async function checkUploadTenantOwnership(
  filePath: string,   // path under uploads/, e.g. "employee-docs/foo.pdf"
  tenantId: string,
): Promise<boolean> {
  // Categorise the path to determine which DB table to consult
  const isEmployeeDoc    = filePath.startsWith("employee-docs/");
  const isStudentDoc     = filePath.startsWith("student-docs/");
  const isApplicationDoc = filePath.startsWith("docs/") || filePath.startsWith("application-docs/") || filePath.startsWith("portal-docs/");

  if (!isEmployeeDoc && !isStudentDoc && !isApplicationDoc) {
    return true; // photos, print assets, public media — not a protected doc path
  }

  try {
    if (isEmployeeDoc) {
      const filename = filePath;
      const [row] = await db
        .select({ employeeTenantId: employeesTable.tenantId })
        .from(employeeDocumentsTable)
        .innerJoin(employeesTable, eq(employeeDocumentsTable.employeeId, employeesTable.id))
        .where(or(
          eq(employeeDocumentsTable.filename, filename),
          eq(employeeDocumentsTable.filename, "/" + filename),
          eq(employeeDocumentsTable.filename, "/uploads/" + filename),
        ))
        .limit(1);
      // Fail-closed: no DB record → deny access (unknown ownership)
      if (!row) return false;
      return row.employeeTenantId === tenantId;
    }

    if (isStudentDoc) {
      const filename = filePath;
      const [row] = await db
        .select({ studentTenantId: studentsTable.tenantId })
        .from(studentDocumentsTable)
        .innerJoin(studentsTable, eq(studentDocumentsTable.studentId, studentsTable.id))
        .where(or(
          eq(studentDocumentsTable.storedName, filename),
          eq(studentDocumentsTable.storedName, "/" + filename),
          eq(studentDocumentsTable.storedName, "/uploads/" + filename),
        ))
        .limit(1);
      // Fail-closed: no DB record → deny access (unknown ownership)
      if (!row) return false;
      return row.studentTenantId === tenantId;
    }

    if (isApplicationDoc) {
      const filename = filePath;
      const [row] = await db
        .select({ appTenantId: applicationsTable.tenantId })
        .from(applicationDocumentsTable)
        .innerJoin(applicationsTable, eq(applicationDocumentsTable.applicationId, applicationsTable.id))
        .where(or(
          eq(applicationDocumentsTable.storedName, filename),
          eq(applicationDocumentsTable.storedName, "/" + filename),
          eq(applicationDocumentsTable.storedName, "/uploads/" + filename),
        ))
        .limit(1);
      // Fail-closed: no DB record → deny access (unknown ownership)
      if (!row) return false;
      return row.appTenantId === tenantId;
    }

    return true; // unreachable — all protected paths handled above
  } catch {
    // Fail-closed: on any DB error, deny access to protected document paths.
    // Production uses R2 signed URLs (not this path); dev strictness is intentional.
    return false;
  }
}

app.use("/uploads", async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization ?? "";
  const headerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
  const rawToken = headerMatch?.[1]?.trim() ?? (req.query["token"] as string | undefined);

  if (ADMIN_ONLY_DIRS.test(req.path)) {
    const adminUser = rawToken ? verifyToken(rawToken) : null;
    if (!adminUser) return res.status(401).json({ error: "Authentication required to access this file" });
    // Scoped admin: verify the file belongs to their tenant
    if (adminUser.tenantId) {
      const filePath = req.path.replace(/^\//, "");
      const allowed = await checkUploadTenantOwnership(filePath, adminUser.tenantId);
      if (!allowed) return res.status(403).json({ error: "You do not have permission to access this file" });
    }
    return next();
  }
  if (PORTAL_ADMIN_DIRS.test(req.path)) {
    const adminUser  = rawToken ? verifyToken(rawToken)  : null;
    const portalUser = rawToken ? verifyPortalToken(rawToken) : null;
    if (!adminUser && !portalUser) {
      return res.status(401).json({ error: "Authentication required to access this file" });
    }
    // Scoped admin: verify file belongs to their tenant
    if (adminUser?.tenantId) {
      const filePath = req.path.replace(/^\//, "");
      const allowed = await checkUploadTenantOwnership(filePath, adminUser.tenantId);
      if (!allowed) return res.status(403).json({ error: "You do not have permission to access this file" });
    } else if (!adminUser && portalUser) {
      // Portal user: their token has no tenantId — derive it from their
      // application, then verify the file belongs to that tenant.
      const [appRow] = await db
        .select({ tenantId: applicationsTable.tenantId })
        .from(applicationsTable)
        .where(eq(applicationsTable.id, portalUser.applicationId))
        .limit(1);
      if (!appRow?.tenantId) return res.status(403).json({ error: "You do not have permission to access this file" });
      const filePath = req.path.replace(/^\//, "");
      const allowed = await checkUploadTenantOwnership(filePath, appRow.tenantId);
      if (!allowed) return res.status(403).json({ error: "You do not have permission to access this file" });
    }
    return next();
  }
  return next(); // photos, media, templates — public
});
app.use("/uploads", express.static(UPLOADS_DIR));

// ── API routes ────────────────────────────────────────────────────────────────
// Liveness probe at the API mount root. The deployment platform health-checks
// the api-server artifact at GET /api, so this must return 200 even before the
// rest of the routes are exercised. Registered before the router so it always
// resolves regardless of what the router defines.
app.get("/api", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", router);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

export default app;
