import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { saasAdminAccountTable } from "@workspace/db/schema";

const SAAS_ADMIN_USERNAME =
  process.env["SAAS_ADMIN_USERNAME"] ?? "saasadmin";
const SAAS_ADMIN_PASSWORD =
  process.env["SAAS_ADMIN_PASSWORD"] ?? "saasadmin123";

const TOKEN_SECRET =
  process.env["SAAS_ADMIN_TOKEN_SECRET"] ??
  process.env["ADMIN_TOKEN_SECRET"] ??
  "ccm-admin-dev-secret-change-me";

const _missing: string[] = [];
if (!process.env["SAAS_ADMIN_TOKEN_SECRET"] && !process.env["ADMIN_TOKEN_SECRET"]) _missing.push("SAAS_ADMIN_TOKEN_SECRET");
if (!process.env["SAAS_ADMIN_PASSWORD"]) _missing.push("SAAS_ADMIN_PASSWORD");
if (_missing.length && process.env.NODE_ENV !== "production") {
  console.error(
    "\n⚠️  SECURITY WARNING ⚠️\n" +
    `   SaaS Admin is using insecure defaults for: ${_missing.join(", ")}\n` +
    "   Set these in Replit Secrets before going to production.\n"
  );
}

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SaasAdminUser = {
  id: string;
  username: string;
  email: string | null;
  tokenVersion: number;
  isSaasAdmin: true;
};

export type SaasAdminTokenResult = {
  token: string;
  expiresAt: Date;
  user: SaasAdminUser;
};

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

/**
 * Verify SaaS admin credentials. Checks the DB record first (bcrypt compare);
 * falls back to env-var plain-text comparison ONLY if the table is genuinely
 * empty (no rows yet — i.e. first boot before the migration seed has run).
 * Any DB error (connection failure, etc.) returns null immediately so that a
 * transient outage cannot be exploited to bypass DB-stored credentials.
 */
export async function verifySaasCredentials(
  username: string,
  password: string,
): Promise<SaasAdminUser | null> {
  let tableEmpty = false;

  try {
    const [row] = await db
      .select()
      .from(saasAdminAccountTable)
      .limit(1);

    if (row) {
      // DB has a record — verify against it exclusively
      if (row.username !== username) return null;
      const ok = await bcrypt.compare(password, row.passwordHash);
      if (!ok) return null;
      return {
        id: row.id,
        username: row.username,
        email: row.email ?? null,
        tokenVersion: row.tokenVersion,
        isSaasAdmin: true,
      };
    }

    // Query succeeded but returned no rows: table is empty
    tableEmpty = true;
  } catch {
    // DB error — do NOT fall back to env-var; reject the request
    return null;
  }

  if (!tableEmpty) return null;

  // Fallback: plain env-var comparison (table is empty — pre-seed / first boot)
  const userOk = timingSafeEqualStr(username, SAAS_ADMIN_USERNAME);
  const passOk = timingSafeEqualStr(password, SAAS_ADMIN_PASSWORD);
  if (userOk && passOk) {
    return { id: "saas-admin", username: SAAS_ADMIN_USERNAME, email: null, tokenVersion: 0, isSaasAdmin: true };
  }
  return null;
}

export function issueSaasToken(user: SaasAdminUser): SaasAdminTokenResult {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const body = {
    sub:          user.username,
    uid:          user.id,
    email:        user.email,
    tv:           user.tokenVersion,
    isSaasAdmin:  true,
    exp:          expiresAt.getTime(),
  };
  const payload   = base64url(JSON.stringify(body));
  const signature = sign(payload);
  return { token: `${payload}.${signature}`, expiresAt, user };
}

export function verifySaasToken(token: string): (SaasAdminUser & { _tokenVersion: number }) | null {
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
      sub?: string;
      uid?: string;
      email?: string | null;
      tv?: number;
      isSaasAdmin?: boolean;
      exp?: number;
    };
    if (!body.sub || !body.exp || typeof body.exp !== "number") return null;
    if (body.exp <= Date.now()) return null;
    if (!body.isSaasAdmin) return null;
    return {
      id: body.uid ?? "saas-admin",
      username: body.sub,
      email: body.email ?? null,
      tokenVersion: body.tv ?? 0,
      isSaasAdmin: true,
      _tokenVersion: body.tv ?? 0,
    };
  } catch {
    return null;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      saasAdmin?: SaasAdminUser;
    }
  }
}

export async function requireSaasAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || !match[1]) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const parsed = verifySaasToken(match[1].trim());
  if (!parsed) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  // Server-side session revocation: compare token_version in token against DB.
  // If the admin changed credentials since this token was issued, the versions
  // won't match and the token is rejected — even if it hasn't expired yet.
  // Skip DB check for the env-var fallback user (tokenVersion === 0).
  if (parsed.tokenVersion !== 0) {
    try {
      const [row] = await db
        .select({ tokenVersion: saasAdminAccountTable.tokenVersion })
        .from(saasAdminAccountTable)
        .limit(1);
      if (!row || row.tokenVersion !== parsed.tokenVersion) {
        res.status(401).json({ error: "Session revoked — please log in again" });
        return;
      }
    } catch {
      res.status(503).json({ error: "Service temporarily unavailable" });
      return;
    }
  }

  req.saasAdmin = {
    id: parsed.id,
    username: parsed.username,
    email: parsed.email,
    tokenVersion: parsed.tokenVersion,
    isSaasAdmin: true,
  };
  next();
}
