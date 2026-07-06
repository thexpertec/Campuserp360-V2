import test from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import { resolveTenantFromList, type TenantInfo } from "./tenant-resolve.js";
import { issueToken, type AdminUser } from "./admin-auth.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CCM: TenantInfo = {
  id: "tenant-ccm",
  name: "Cadet College Murree",
  slug: "ccm",
  domain: "cadetcollegemurree.edu.pk",
  siteTheme: "ccm",
  isActive: true,
};

const GCCM: TenantInfo = {
  id: "tenant-gccm",
  name: "Girls Cadet College Murree",
  slug: "gccm",
  domain: "girlscadetcollegemurree.edu.pk",
  siteTheme: "gccm",
  isActive: true,
};

const TENANTS: TenantInfo[] = [CCM, GCCM];

type ReqOpts = {
  host?: string;
  forwardedHost?: string;
  query?: Record<string, string>;
  authorization?: string;
  xTenantSlug?: string;
};

/** Build a minimal Express-like request for the resolver under test. */
function makeReq(opts: ReqOpts = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.host) headers["host"] = opts.host;
  if (opts.forwardedHost) headers["x-forwarded-host"] = opts.forwardedHost;
  if (opts.authorization) headers["authorization"] = opts.authorization;
  if (opts.xTenantSlug) headers["x-tenant-slug"] = opts.xTenantSlug;
  return {
    headers,
    query: opts.query ?? {},
  } as unknown as Request;
}

function superAdminBearer(): string {
  const user: AdminUser = {
    id: "super-1",
    username: "super",
    name: "Super Admin",
    role: "admin",
    isSuperAdmin: true,
    roles: [],
  };
  return `Bearer ${issueToken(user).token}`;
}

function tenantAdminBearer(): string {
  const user: AdminUser = {
    id: "scoped-1",
    username: "scoped",
    name: "Tenant Admin",
    role: "admin",
    isSuperAdmin: false,
    tenantId: CCM.id,
    roles: [],
  };
  return `Bearer ${issueToken(user).token}`;
}

// Each test sets NODE_ENV explicitly and restores it afterward so the suite is
// order-independent regardless of the ambient environment.
function withNodeEnv(value: string | undefined, fn: () => void): void {
  const prev = process.env.NODE_ENV;
  if (value === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
}

// ── Production: real domain + cross-tenant override is IGNORED ─────────────────

test("production: real tenant domain ignores ?tenant=<other> override", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: CCM.domain!, query: { tenant: "gccm" } });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, CCM.id, "must resolve to the host's tenant, not the override");
  });
});

test("production: GCCM domain ignores ?tenant=ccm override", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: GCCM.domain!, query: { tenant: "ccm" } });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, GCCM.id);
  });
});

test("production: real domain with no override resolves to the host's tenant", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: GCCM.domain! });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, GCCM.id);
  });
});

test("production: override matching the host's own tenant is harmless", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: CCM.domain!, query: { tenant: "ccm" } });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, CCM.id);
  });
});

// ── Production: preview host (no domain match) + override is HONORED ───────────

test("production: preview host honors ?tenant=<slug> override", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: "my-app.replit.app", query: { tenant: "gccm" } });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, GCCM.id);
  });
});

test("production: preview host honors override by tenant id too", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: "my-app.replit.app", query: { tenant: GCCM.id } });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, GCCM.id);
  });
});

// ── Production: real domain + super-admin token + override is HONORED ──────────

test("production: super-admin Bearer token honors cross-tenant override on a real domain", () => {
  withNodeEnv("production", () => {
    const req = makeReq({
      host: CCM.domain!,
      query: { tenant: "gccm" },
      authorization: superAdminBearer(),
    });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, GCCM.id, "super-admin may preview another tenant on a live domain");
  });
});

test("production: super-admin ?token= query param honors override on a real domain", () => {
  withNodeEnv("production", () => {
    const token = issueToken({
      id: "super-2",
      username: "super2",
      name: "Super Admin 2",
      role: "admin",
      isSuperAdmin: true,
      roles: [],
    }).token;
    const req = makeReq({ host: CCM.domain!, query: { tenant: "gccm", token } });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, GCCM.id);
  });
});

test("production: non-super-admin token does NOT honor override on a real domain", () => {
  withNodeEnv("production", () => {
    const req = makeReq({
      host: CCM.domain!,
      query: { tenant: "gccm" },
      authorization: tenantAdminBearer(),
    });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, CCM.id, "scoped tenant admin cannot override on a live domain");
  });
});

test("production: invalid/garbage token does NOT honor override on a real domain", () => {
  withNodeEnv("production", () => {
    const req = makeReq({
      host: CCM.domain!,
      query: { tenant: "gccm" },
      authorization: "Bearer not.a.real.token",
    });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, CCM.id);
  });
});

// ── Non-production: override is always HONORED ────────────────────────────────

test("non-production: ?tenant=<slug> override is honored even on a real domain", () => {
  withNodeEnv("development", () => {
    const req = makeReq({ host: CCM.domain!, query: { tenant: "gccm" } });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, GCCM.id);
  });
});

test("non-production: override honored with no host", () => {
  withNodeEnv("development", () => {
    const req = makeReq({ query: { tenant: "gccm" } });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, GCCM.id);
  });
});

// ── Fallback behavior ─────────────────────────────────────────────────────────

test("empty tenant list resolves to null", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: CCM.domain! });
    assert.equal(resolveTenantFromList(req, []).tenant, null);
  });
});

test("unknown host falls back to the default tenant (ccm)", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: "unknown.example.com" });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.slug, "ccm");
  });
});

test("x-forwarded-host and www./port are normalized for domain matching", () => {
  withNodeEnv("production", () => {
    const req = makeReq({
      host: "internal:8080",
      forwardedHost: `www.${GCCM.domain}:443`,
      query: { tenant: "ccm" },
    });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, GCCM.id, "forwarded host matches GCCM; cross override ignored");
  });
});

// ── X-Tenant-Slug: gateway path-prefix routing ────────────────────────────────
// The gateway sets host=localhost:<port> and x-tenant-slug=<slug> for every
// tenant-prefixed request.  The resolver should honour it ONLY when the host
// is localhost (i.e. the request came from the loopback gateway).

test("gateway: X-Tenant-Slug from localhost resolves to the named tenant", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: "localhost:8080", xTenantSlug: "gccm" });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, GCCM.id, "loopback + X-Tenant-Slug → GCCM");
  });
});

test("gateway: X-Tenant-Slug from localhost works for ccm too", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: "localhost:8080", xTenantSlug: "ccm" });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, CCM.id);
  });
});

test("gateway: X-Tenant-Slug from a non-localhost host is IGNORED (anti-spoof)", () => {
  withNodeEnv("production", () => {
    // An external client connecting directly to the API on its public hostname
    // must not be able to spoof X-Tenant-Slug to switch tenants.
    const req = makeReq({ host: CCM.domain!, xTenantSlug: "gccm" });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, CCM.id, "domain match wins; spoofed slug must be ignored");
  });
});

test("gateway: X-Tenant-Slug from a non-localhost preview host is IGNORED", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: "my-app.replit.app", xTenantSlug: "gccm" });
    const resolved = resolveTenantFromList(req, TENANTS);
    // Falls through to default (ccm) since no domain match and slug is ignored
    assert.equal(resolved?.tenant?.slug, "ccm", "non-localhost host must not trust X-Tenant-Slug");
  });
});

test("gateway: unknown X-Tenant-Slug from localhost falls through to default", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: "localhost:8080", xTenantSlug: "nonexistent" });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.slug, "ccm", "unknown slug → default tenant");
  });
});

// ── Production: host+?tenant= mismatch → confident: false ────────────────────
// When a request arrives at a known production domain (host maps to CCM) but
// carries a conflicting ?tenant=<other-slug> param for a non-super-admin, the
// resolution is ambiguous. The host-matched tenant is returned but confidence
// is false so write operations can reject the request.

test("production: conflicting ?tenant= on a real domain is NOT confident (non-super-admin)", () => {
  withNodeEnv("production", () => {
    // host = CCM domain, ?tenant = gccm slug → conflict
    const req = makeReq({ host: CCM.domain!, query: { tenant: "gccm" } });
    const resolved = resolveTenantFromList(req, TENANTS);
    // The host-matched tenant (CCM) is returned, but confident must be false
    assert.equal(resolved.confident, false, "conflicting slug on real domain must not be confident");
  });
});

test("production: same ?tenant= as host domain is still confident (no conflict)", () => {
  withNodeEnv("production", () => {
    // host = CCM domain, ?tenant = ccm → no conflict
    const req = makeReq({ host: CCM.domain!, query: { tenant: "ccm" } });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved.confident, true, "same slug as host domain → no conflict, still confident");
    assert.equal(resolved?.tenant?.id, CCM.id);
  });
});

test("production: super-admin may use conflicting ?tenant= and result is confident", () => {
  withNodeEnv("production", () => {
    // Super-admin with a valid override token: their cross-domain override is trusted
    const req = makeReq({
      host: CCM.domain!,
      query: { tenant: "gccm" },
      authorization: superAdminBearer(),
    });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved.confident, true, "super-admin cross-tenant override must be confident");
    assert.equal(resolved?.tenant?.id, GCCM.id, "super-admin resolves to the overridden tenant");
  });
});

test("production: no ?tenant= on a real domain → confident host match (no ambiguity)", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: GCCM.domain! });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved.confident, true, "host-only resolution is always confident");
    assert.equal(resolved?.tenant?.id, GCCM.id);
  });
});

test("production: Referer path bypass is blocked by mismatch guard — still NOT confident", () => {
  withNodeEnv("production", () => {
    // A crafted request: host = CCM domain (real tenant A), ?tenant = gccm (tenant B),
    // AND a Referer whose first segment matches the ?tenant= slug.
    // Without the early mismatch guard, Step 2 (Referer) would return confident: true.
    // With the guard, the mismatch is detected first and the result must be confident: false.
    const req = {
      headers: {
        host: CCM.domain!,
        referer: `https://${CCM.domain}/gccm/admissions`,
      },
      query: { tenant: "gccm" },
    } as unknown as import("express").Request;
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(
      resolved.confident,
      false,
      "host/slug mismatch + crafted Referer must still be confident: false",
    );
  });
});
