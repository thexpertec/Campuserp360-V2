import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";

// ── Secret / credential checks ───────────────────────────────────────────────
// TOKEN_SECRET signs every admin session token — it MUST be a secret env var.
// If the fallback is in use, any attacker who reads the source can forge tokens.
const ADMIN_USERNAME = process.env["ADMIN_USERNAME"] ?? "admin";
const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"] ?? "admin123";
const ADMIN_NAME     = process.env["ADMIN_NAME"]     ?? "Admissions Office";

const TOKEN_SECRET = process.env["ADMIN_TOKEN_SECRET"] ?? "ccm-admin-dev-secret-change-me";

const _DEFAULTS_IN_USE: string[] = [];
if (!process.env["ADMIN_TOKEN_SECRET"]) _DEFAULTS_IN_USE.push("ADMIN_TOKEN_SECRET");
if (!process.env["ADMIN_PASSWORD"])     _DEFAULTS_IN_USE.push("ADMIN_PASSWORD");
if (_DEFAULTS_IN_USE.length) {
  console.error(
    "\n⚠️  SECURITY WARNING ⚠️\n" +
    `   The following secrets are using insecure defaults: ${_DEFAULTS_IN_USE.join(", ")}\n` +
    "   Anyone who reads the source code can log in or forge session tokens.\n" +
    "   Go to Replit Secrets and set these env vars NOW before deploying to production.\n"
  );
}

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BCRYPT_ROUNDS = 12;
const LEGACY_PREFIX = "$2"; // bcrypt hashes start with $2a$ or $2b$

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdminUser = {
  id: string;
  username: string;
  name: string;
  role: string;
  isSuperAdmin: boolean;
  tenantId?: string;
  roles: Array<{ module: string; permission: string }>;
};

export type AdminTokenResult = {
  token: string;
  expiresAt: Date;
  user: AdminUser;
};

// ── Crypto helpers ────────────────────────────────────────────────────────────

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(payload: string): string {
  return base64url(
    crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest(),
  );
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns `user.id` only when it is a real row in `admin_users` (a UUID), or
 * `null` otherwise. Several session types carry a synthetic, non-UUID id that
 * has no matching `admin_users` row — the env-var super-admin ("env-admin")
 * and SaaS-admin tenant impersonation sessions ("saas-impersonate-<tenantId>")
 * are the two known cases today, and more may be added later.
 *
 * Use this instead of ad-hoc `user.id !== "env-admin"` checks whenever the id
 * is written into a maker/checker column with a foreign key to admin_users
 * (preparedBy, approvedBy, collectedBy, marksEnteredBy, etc.) — inserting a
 * synthetic id there violates the FK constraint and fails the whole request.
 */
export function realAdminUserId(user: Pick<AdminUser, "id"> | null | undefined): string | null {
  const id = user?.id;
  return id && UUID_RE.test(id) ? id : null;
}

/** Hash a password with bcrypt (use for new passwords and re-hashing). */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a stored hash.
 * Supports both bcrypt hashes (new) and legacy HMAC-SHA256 hashes.
 * Returns { valid, needsRehash } — if needsRehash is true, caller should
 * re-hash the plaintext password with bcrypt and save it to the DB.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (storedHash.startsWith(LEGACY_PREFIX)) {
    // Modern bcrypt hash
    const valid = await bcrypt.compare(password, storedHash);
    return { valid, needsRehash: false };
  }
  // Legacy HMAC-SHA256 hash — verify and flag for re-hash
  const legacyHash = crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(password)
    .digest("hex");
  const valid = timingSafeEqualStr(legacyHash, storedHash);
  return { valid, needsRehash: valid }; // only re-hash if password was actually correct
}

/** Synchronous bcrypt hash — only for use in startup migration scripts. */
export function hashPasswordSync(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

// ── Env-var credential check (legacy super-admin) ─────────────────────────────

export function verifyEnvCredentials(
  username: string,
  password: string,
): AdminUser | null {
  const userOk = timingSafeEqualStr(username, ADMIN_USERNAME);
  const passOk = timingSafeEqualStr(password, ADMIN_PASSWORD);
  if (userOk && passOk) {
    return {
      id: "env-admin",
      username: ADMIN_USERNAME,
      name: ADMIN_NAME,
      role: "admin",
      isSuperAdmin: true,
      roles: [],
    };
  }
  return null;
}

// ── Token issue / verify ──────────────────────────────────────────────────────

export function issueToken(user: AdminUser): AdminTokenResult {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const body = {
    sub:          user.username,
    uid:          user.id,
    name:         user.name,
    role:         user.role,
    isSuperAdmin: user.isSuperAdmin,
    tenantId:     user.tenantId,
    roles:        user.roles,
    exp:          expiresAt.getTime(),
  };
  const payload   = base64url(JSON.stringify(body));
  const signature = sign(payload);
  return { token: `${payload}.${signature}`, expiresAt, user };
}

export function verifyToken(token: string): AdminUser | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  const expected = sign(payload);
  if (!timingSafeEqualStr(signature, expected)) return null;

  try {
    const body = JSON.parse(
      Buffer.from(payload, "base64").toString("utf8"),
    ) as {
      sub?: string; uid?: string; name?: string; role?: string;
      isSuperAdmin?: boolean; tenantId?: string;
      roles?: Array<{ module: string; permission: string }>;
      exp?: number;
    };
    if (!body.sub || !body.exp || typeof body.exp !== "number") return null;
    if (body.exp <= Date.now()) return null;
    return {
      id:           body.uid ?? "env-admin",
      username:     body.sub,
      name:         body.name ?? ADMIN_NAME,
      role:         body.role ?? "admin",
      isSuperAdmin: body.isSuperAdmin ?? false,
      tenantId:     body.tenantId,
      roles:        body.roles ?? [],
    };
  } catch {
    return null;
  }
}

// ── Express middleware ────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminUser?: AdminUser;
    }
  }
}

/** Requires any valid admin token. Attaches user to req.adminUser. */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  // Also accept ?token= query param so browser-navigated download links work
  const rawToken = match?.[1]?.trim() ?? (req.query["token"] as string | undefined);
  if (!rawToken) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const user = verifyToken(rawToken);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  req.adminUser = user;
  next();
}

/** Requires super-admin. Use for user-management routes. */
export function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || !match[1]) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const user = verifyToken(match[1].trim());
  if (!user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  if (!user.isSuperAdmin) {
    res.status(403).json({ error: "Super-admin access required" });
    return;
  }
  req.adminUser = user;
  next();
}

export const PERMISSION_HIERARCHY: Record<string, number> = {
  view: 1, draft: 2, post: 3, edit: 4, delete: 5,
};

/**
 * Returns true if the user has at least the given permission level in the
 * given module (or is a super-admin). Use this inside route handlers that need
 * to conditionally bypass posted-record locks for editors/deleters.
 */
export function hasModuleRole(
  user: AdminUser,
  module: string,
  permission: "view" | "draft" | "post" | "edit" | "delete",
): boolean {
  if (user.isSuperAdmin) return true;
  const required = PERMISSION_HIERARCHY[permission] ?? 1;
  return user.roles.some(
    (r) =>
      (r.module === module || r.module === "*") &&
      (PERMISSION_HIERARCHY[r.permission] ?? 0) >= required,
  );
}

/**
 * Middleware factory — requires the current user to have the given permission
 * in the given module (or be a super-admin, who bypasses all checks).
 *
 * If req.adminUser is already populated (e.g. by a DB-refresh middleware that
 * re-hydrated isSuperAdmin from the live database row), that value is trusted
 * directly instead of re-verifying the token.  This lets a promotion take effect
 * immediately without forcing a re-login.
 */
export function requireRole(module: string, permission: "view" | "draft" | "post" | "edit" | "delete") {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Prefer a pre-hydrated user (may have refreshed isSuperAdmin from DB)
    let user = req.adminUser;
    if (!user) {
      const header = req.headers.authorization ?? "";
      const match = /^Bearer\s+(.+)$/i.exec(header);
      if (!match || !match[1]) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const verified = verifyToken(match[1].trim());
      if (!verified) {
        res.status(401).json({ error: "Invalid or expired session" });
        return;
      }
      req.adminUser = verified;
      user = verified;
    }

    if (user.isSuperAdmin) { next(); return; }

    // Tenant admin users (created via SaaS Admin, role !== "staff") act as
    // directors for all modules within their own tenant. Staff users have
    // role === "staff" and need explicit module roles in admin_user_roles.
    if (user.tenantId && user.role !== "staff") { next(); return; }

    const requiredLevel = PERMISSION_HIERARCHY[permission] ?? 1;

    const hasRole = user.roles.some(
      (r) =>
        (r.module === module || r.module === "*") &&
        (PERMISSION_HIERARCHY[r.permission] ?? 0) >= requiredLevel,
    );

    if (!hasRole) {
      res.status(403).json({
        error: `Requires ${permission} permission in module "${module}"`,
      });
      return;
    }
    next();
  };
}

/**
 * Middleware factory — like `requireRole`, but WITHOUT the tenant-director
 * auto-bypass (`user.tenantId && user.role !== "staff"`).
 *
 * Use this for routes that are not scoped to the caller's own tenant — most
 * importantly global admin-user management (`/admin/admin-users`), which
 * reads/writes the platform-wide `admin_users` table across all tenants.
 * The tenant-director shortcut in `requireRole` is meant to give a tenant's
 * own director full access to modules *within their tenant* (fees, payroll,
 * etc.) — it must never be treated as equivalent to an explicit
 * `admin_user_roles` grant on a global, cross-tenant route, or any tenant
 * director account could manage every tenant's admin users.
 *
 * Only an explicit `admin_user_roles` grant (checked via `hasModuleRole`,
 * which still lets true super-admins bypass) is accepted here.
 */
export function requireGlobalRole(module: string, permission: "view" | "draft" | "post" | "edit" | "delete") {
  return (req: Request, res: Response, next: NextFunction): void => {
    let user = req.adminUser;
    if (!user) {
      const header = req.headers.authorization ?? "";
      const match = /^Bearer\s+(.+)$/i.exec(header);
      if (!match || !match[1]) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const verified = verifyToken(match[1].trim());
      if (!verified) {
        res.status(401).json({ error: "Invalid or expired session" });
        return;
      }
      req.adminUser = verified;
      user = verified;
    }

    if (!hasModuleRole(user, module, permission)) {
      res.status(403).json({
        error: `Requires ${permission} permission in module "${module}"`,
      });
      return;
    }
    next();
  };
}
