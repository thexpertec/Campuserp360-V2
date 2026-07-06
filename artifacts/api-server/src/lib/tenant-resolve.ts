import type { Request } from "express";
import { verifyToken } from "./admin-auth.js";

// ── Pure tenant-resolution logic ──────────────────────────────────────────────
// This module holds the host/override resolution algorithm with NO database
// dependency, so it can be unit-tested in isolation. The DB-backed loading and
// caching live in tenant.ts, which delegates the actual decision-making here.

export type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  siteTheme: string;
  isActive: boolean;
};

/**
 * Resolution result. `confident` is true when the tenant was resolved via an
 * unambiguous, self-consistent signal. It is false when:
 *   a) The fallback DEFAULT_SLUG or first-active-tenant paths were used.
 *   b) A `?tenant=` slug is present in production that disagrees with the
 *      host-matched tenant (and the requester is not a super-admin).
 *
 * Conflicting signals are detected early (before ANY resolution branch runs)
 * so that Referer, gateway header, or other paths cannot silently override a
 * detected mismatch and produce a spuriously confident result.
 *
 * Write operations MUST reject requests (HTTP 400) when `confident` is false.
 * Read operations may proceed using the resolved tenant even when not confident.
 */
export type TenantResolution = {
  tenant: TenantInfo | null;
  confident: boolean;
};

export const DEFAULT_SLUG = (process.env["DEFAULT_TENANT_SLUG"] ?? "ccm").toLowerCase();

export function normalizeHost(host: string): string {
  return host.split(":")[0]!.trim().toLowerCase().replace(/^www\./, "");
}

export function hostFromReq(req: Request): string {
  const xf = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim();
  return normalizeHost(xf || req.headers.host || "");
}

/**
 * Whether the request carries a valid super-admin token. Super-admins may use
 * the ?tenant= override anywhere (including on a real production domain) so they
 * can preview a tenant's site. Accepts both the Authorization: Bearer header
 * and a ?token= query param (for browser-navigated links).
 */
export function isSuperAdminRequest(req: Request): boolean {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const rawToken = match?.[1]?.trim() ?? (req.query["token"] as string | undefined);
  if (!rawToken) return false;
  const user = verifyToken(rawToken);
  return user?.isSuperAdmin === true;
}

/**
 * Whether the ?tenant= override should be honored for this request.
 *  - In non-production (dev / Replit preview) it is always honored, so a tenant
 *    can be previewed by slug where the request host maps to no tenant domain.
 *  - In production it is honored only when the host does NOT resolve to a real
 *    tenant domain (e.g. a *.replit.app preview host), or for super-admins.
 * This stops a visitor from appending ?tenant=<other> to a live tenant domain
 * and seeing the wrong school's content under that domain.
 */
export function overrideAllowed(req: Request, byDomain: TenantInfo | undefined): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (!byDomain) return true;
  return isSuperAdminRequest(req);
}

/**
 * Whether the request originated from the local gateway (loopback).
 * The gateway sets `host: localhost:<port>` on every proxied request, so this
 * is a reliable signal that X-Tenant-Slug was injected by our own gateway and
 * not spoofed by an external client.
 */
export function isGatewayRequest(req: Request): boolean {
  const host = req.headers.host ?? "";
  return host.startsWith("localhost:") || host === "localhost";
}

/**
 * Resolve which tenant a public request belongs to, given the full tenant list.
 * Returns `{ tenant, confident }` where `confident` is false when resolution
 * is ambiguous. Write operations MUST reject (HTTP 400) when `confident` is false.
 *
 * MISMATCH GUARD (evaluated first, before any branch):
 * In production, if the request host matches tenant A but `?tenant=` claims
 * tenant B, and the requester is not a super-admin, this is treated as
 * fundamentally ambiguous. Resolution short-circuits immediately with the
 * host-matched tenant and `confident: false`. No subsequent branch (Referer,
 * gateway header, etc.) can upgrade this to confident, because any such branch
 * would still be operating under conflicting signals.
 *
 * Order of precedence (after mismatch guard passes):
 *  1. ?tenant=<slug|id> override (only when allowed — see overrideAllowed).
 *  2. Referer path-prefix: /gccm/… cross-checked against ?tenant= param.
 *  3. Request host matched against tenants.domain → confident: true.
 *  4. X-Tenant-Slug header (only trusted from the loopback gateway).
 *  5. DEFAULT_TENANT_SLUG env (default "ccm")     → confident: false
 *  6. First active tenant (last-resort fallback)   → confident: false
 */
export function resolveTenantFromList(
  req: Request,
  tenants: TenantInfo[],
): TenantResolution {
  if (tenants.length === 0) return { tenant: null, confident: false };

  const host = hostFromReq(req);
  const byDomain = host
    ? tenants.find((t) => t.domain && normalizeHost(t.domain) === host)
    : undefined;

  const override = (req.query["tenant"] as string | undefined)?.trim().toLowerCase();
  const isSuperAdmin = isSuperAdminRequest(req);

  // ── MISMATCH GUARD — evaluated before any resolution branch ───────────────
  // In production, if the host maps to a known tenant but the `?tenant=` param
  // claims a DIFFERENT tenant (and the requester is not a super-admin), the
  // signals are in conflict. Short-circuit immediately with `confident: false`
  // so write operations are blocked regardless of Referer, gateway, or any
  // other subsequent signal. This prevents bypass via crafted Referer headers.
  if (
    process.env.NODE_ENV === "production" &&
    byDomain &&
    override &&
    !isSuperAdmin
  ) {
    const overrideMatch = tenants.find(
      (t) => t.slug.toLowerCase() === override || t.id.toLowerCase() === override,
    );
    if (overrideMatch && overrideMatch.id !== byDomain.id) {
      // Return the host-matched tenant (most trustworthy signal) but mark as
      // not confident so callers can reject writes.
      return { tenant: byDomain, confident: false };
    }
  }

  // ── Step 1: ?tenant= override ─────────────────────────────────────────────
  if (override && overrideAllowed(req, byDomain)) {
    const match = tenants.find(
      (t) => t.slug.toLowerCase() === override || t.id.toLowerCase() === override,
    );
    if (match) return { tenant: match, confident: true };
  }

  // ── Step 2: Referer path-prefix ───────────────────────────────────────────
  // Allows a hub domain (e.g. ccm.erp360.org) to serve multiple tenants
  // at /ccm/ and /gccm/ by letting the browser's Referer guide resolution.
  // Cross-checked against the ?tenant= param: spoofing requires both.
  // Note: this branch only executes if the mismatch guard passed (no conflicting
  // host+slug pair in production), so its confident: true is safe.
  if (override) {
    const referer = (req.headers["referer"] ?? req.headers["referrer"] ?? "") as string;
    if (referer) {
      try {
        const refPath = new URL(referer).pathname;
        const refFirstSeg = refPath.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
        if (refFirstSeg === override) {
          const match = tenants.find(
            (t) => t.slug.toLowerCase() === override || t.id.toLowerCase() === override,
          );
          if (match) return { tenant: match, confident: true };
        }
      } catch {
        // Malformed Referer — ignore and fall through
      }
    }
  }

  // ── Step 3: Host domain match ─────────────────────────────────────────────
  if (byDomain) return { tenant: byDomain, confident: true };

  // ── Step 4: X-Tenant-Slug (gateway only) ──────────────────────────────────
  // Only honour it when the request comes from the loopback gateway to prevent
  // external clients from spoofing their tenant.
  const xSlug = (req.headers["x-tenant-slug"] as string | undefined)?.trim().toLowerCase();
  if (xSlug && isGatewayRequest(req)) {
    const match = tenants.find((t) => t.slug.toLowerCase() === xSlug);
    if (match) return { tenant: match, confident: true };
  }

  // ── Steps 5–6: Fallback paths — NOT confident ─────────────────────────────
  // Must not be used for write operations.

  const byDefault = tenants.find((t) => t.slug.toLowerCase() === DEFAULT_SLUG);
  if (byDefault) return { tenant: byDefault, confident: false };

  const firstActive = tenants.find((t) => t.isActive) ?? tenants[0]!;
  return { tenant: firstActive, confident: false };
}
