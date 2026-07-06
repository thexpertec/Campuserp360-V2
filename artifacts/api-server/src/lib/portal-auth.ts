import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const PORTAL_TOKEN_SECRET =
  process.env["PORTAL_TOKEN_SECRET"] ?? "ccm-portal-dev-secret-change-me";

if (!process.env["PORTAL_TOKEN_SECRET"]) {
  console.error(
    "\n⚠️  SECURITY WARNING ⚠️\n" +
    "   PORTAL_TOKEN_SECRET is not set — using an insecure hardcoded default.\n" +
    "   Set this in Replit Secrets before going to production.\n"
  );
}

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type PortalTokenPayload = {
  referenceId: string;
  applicationId: string;
  email: string;
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
    crypto.createHmac("sha256", PORTAL_TOKEN_SECRET).update(payload).digest(),
  );
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function issuePortalToken(payload: PortalTokenPayload): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const body = {
    ...payload,
    exp: expiresAt.getTime(),
  };
  const encodedPayload = base64url(JSON.stringify(body));
  const signature = sign(encodedPayload);
  return { token: `${encodedPayload}.${signature}`, expiresAt };
}

export function verifyPortalToken(token: string): PortalTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;

  const expected = sign(encodedPayload);
  if (!timingSafeEqualStr(signature, expected)) return null;

  try {
    const body = JSON.parse(
      Buffer.from(encodedPayload, "base64").toString("utf8"),
    ) as { referenceId?: string; applicationId?: string; email?: string; exp?: number };
    if (!body.referenceId || !body.applicationId || !body.exp) return null;
    if (body.exp <= Date.now()) return null;
    return {
      referenceId: body.referenceId,
      applicationId: body.applicationId,
      email: body.email ?? "",
    };
  } catch {
    return null;
  }
}

declare global {
  namespace Express {
    interface Request {
      portalUser?: PortalTokenPayload;
    }
  }
}

export function requirePortal(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || !match[1]) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const payload = verifyPortalToken(match[1].trim());
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  req.portalUser = payload;
  next();
}
