import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { tenantsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { resolveTenantFromList, hostFromReq, normalizeHost, type TenantInfo, type TenantResolution } from "./tenant-resolve.js";

export type { TenantInfo } from "./tenant-resolve.js";
export type { TenantResolution } from "./tenant-resolve.js";

// ── Tenant resolution ─────────────────────────────────────────────────────────
// The public website is multi-tenant: which tenant a request belongs to is
// resolved from the request host (mapped to tenants.domain), with overrides for
// dev/testing via a ?tenant= slug/id query param and a DEFAULT_TENANT_SLUG env.
// The pure host/override decision logic lives in tenant-resolve.ts (no DB
// dependency, so it is unit-testable); this module adds DB-backed loading,
// caching, and the Express middleware.

const CACHE_TTL_MS = 30_000;

let cache: { at: number; rows: TenantInfo[] } | null = null;

async function loadTenants(): Promise<TenantInfo[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows = await db.select().from(tenantsTable);
  const mapped: TenantInfo[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    domain: r.domain ?? null,
    siteTheme: r.siteTheme ?? "ccm",
    isActive: r.isActive,
  }));
  cache = { at: Date.now(), rows: mapped };
  return mapped;
}

/** Invalidate the in-memory tenant cache (call after creating/editing tenants). */
export function clearTenantCache(): void {
  cache = null;
}

/**
 * Resolve which tenant a public request belongs to. Returns `{ tenant, confident }`
 * where `confident` is false when the resolution fell through to the DEFAULT_SLUG
 * or first-active-tenant fallback. Write operations MUST reject (HTTP 400) when
 * `confident` is false — use `resolveTenantStrict` for those paths.
 */
export async function resolveTenant(req: Request): Promise<TenantResolution> {
  const tenants = await loadTenants();
  return resolveTenantFromList(req, tenants);
}

/**
 * Resolve the tenant for a public write operation. Returns the TenantInfo when
 * resolution is confident, or null when it is ambiguous. Callers should return
 * HTTP 400 on null.
 *
 * This is a convenience wrapper around `resolveTenant` that discards the
 * confidence envelope and returns null for ambiguous resolutions.
 */
export async function resolveTenantStrict(req: Request): Promise<TenantInfo | null> {
  const { tenant, confident } = await resolveTenant(req);
  if (!confident) return null;
  return tenant;
}

/** Express middleware — attaches the resolved tenant to the public request. */
export async function publicTenant(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenant } = await resolveTenant(req);
    req.tenant = tenant ?? undefined;
    req.tenantId = tenant?.id;
  } catch {
    // On failure, leave tenant unset; route handlers fall back gracefully.
  }
  next();
}

/**
 * Resolve the tenant an admin request operates on.
 *
 * Resolution order (fail-closed at every step):
 *  1. Scoped tenant admins: always their own token tenantId (cannot escape).
 *  2. Super-admins with explicit X-Tenant-Id header or ?tenant= param: match by
 *     slug or UUID. Returns null if the override value is unrecognised (prevents
 *     a bad override from falling through to the host fallback).
 *  3. Super-admins with NO explicit override: direct host-domain match only —
 *     no DEFAULT_TENANT_SLUG, no first-active-tenant fallback. If the request
 *     host does not map to a known tenant domain, returns null. Callers must
 *     return 400 so the admin UI requires explicit tenant selection.
 */
export async function getAdminTenantId(req: Request): Promise<string | null> {
  const user = req.adminUser;
  if (user?.tenantId) return user.tenantId;

  const tenants = await loadTenants();

  const override =
    (req.headers["x-tenant-id"] as string | undefined)?.trim() ||
    (req.query["tenant"] as string | undefined)?.trim();
  if (override) {
    const match = tenants.find(
      (t) => t.id === override || t.slug.toLowerCase() === override.toLowerCase(),
    );
    // Fail closed: unrecognised override → null (do NOT fall through to host).
    return match?.id ?? null;
  }

  // No explicit override: resolve from host domain only — no DEFAULT_SLUG fallback.
  // This is safe for single-tenant deployments with custom domains, and fails
  // closed (null) for multi-tenant hub hosts that serve many tenants on one domain.
  const host = hostFromReq(req);
  if (!host) return null;
  const byDomain = tenants.find(
    (t) => t.domain && normalizeHost(t.domain) === host,
  );
  return byDomain?.id ?? null;
}

/**
 * Run `fn` inside a DB transaction with the tenant context set via both:
 *   1. SET LOCAL ROLE app_user  — makes the app_user RLS policy fire for all
 *      queries in this transaction (even when the connection user is neondb_owner).
 *   2. set_config('app.current_tenant', tenantId, TRUE) — provides the UUID that
 *      the tenant_isolation policy checks against.
 *
 * Both settings are LOCAL to the transaction and reset automatically on COMMIT/ROLLBACK.
 * This is the connection-safe, guaranteed-per-query approach: the same pg client is
 * used for all queries within the fn callback.
 *
 * Usage:
 *   await withTenantCtx(tenantId, async (tx) => {
 *     return tx.select().from(someTable).where(...);
 *   });
 */
export async function withTenantCtx<T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // Switch to the restricted role so RLS policies (TO app_user) fire.
    // SET LOCAL ROLE is transaction-scoped — reverts on commit/rollback.
    // Fail closed: if the role switch fails, abort the transaction — DO NOT
    // continue as the owner role because that would bypass RLS policies.
    await tx.execute(sql`SET LOCAL ROLE app_user`);
    await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, TRUE)`);
    return fn(tx);
  });
}

/**
 * Run a READ-ONLY query inside a DB transaction with the tenant context set.
 * Identical to `withTenantCtx` but clearly named to indicate the intent is a
 * SELECT (no writes). The transaction is rolled back on completion, which also
 * reverts the LOCAL role and tenant config.
 *
 * Use this wherever a non-mutating query needs DB-level RLS enforcement as a
 * second safety net (beyond the explicit WHERE tenant_id = ? clause).
 */
export async function withTenantRead<T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return withTenantCtx(tenantId, fn);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenant?: TenantInfo;
      tenantId?: string;
      /** Effective admin tenant resolved fail-closed by the admin router middleware. */
      adminTenantId?: string | null;
    }
  }
}
