// src/lib/tenant-resolve.test.ts
import test from "node:test";
import assert from "node:assert/strict";

// src/lib/admin-auth.ts
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
var ADMIN_USERNAME = process.env["ADMIN_USERNAME"] ?? "admin";
var ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"] ?? "admin123";
var ADMIN_NAME = process.env["ADMIN_NAME"] ?? "Admissions Office";
var TOKEN_SECRET = process.env["ADMIN_TOKEN_SECRET"] ?? "ccm-admin-dev-secret-change-me";
var _DEFAULTS_IN_USE = [];
if (!process.env["ADMIN_TOKEN_SECRET"]) _DEFAULTS_IN_USE.push("ADMIN_TOKEN_SECRET");
if (!process.env["ADMIN_PASSWORD"]) _DEFAULTS_IN_USE.push("ADMIN_PASSWORD");
if (_DEFAULTS_IN_USE.length) {
  console.error(
    `
\u26A0\uFE0F  SECURITY WARNING \u26A0\uFE0F
   The following secrets are using insecure defaults: ${_DEFAULTS_IN_USE.join(", ")}
   Anyone who reads the source code can log in or forge session tokens.
   Go to Replit Secrets and set these env vars NOW before deploying to production.
`
  );
}
var TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function sign(payload) {
  return base64url(
    crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest()
  );
}
function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
function issueToken(user) {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const body = {
    sub: user.username,
    uid: user.id,
    name: user.name,
    role: user.role,
    isSuperAdmin: user.isSuperAdmin,
    tenantId: user.tenantId,
    roles: user.roles,
    exp: expiresAt.getTime()
  };
  const payload = base64url(JSON.stringify(body));
  const signature = sign(payload);
  return { token: `${payload}.${signature}`, expiresAt, user };
}
function verifyToken(token) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (!timingSafeEqualStr(signature, expected)) return null;
  try {
    const body = JSON.parse(
      Buffer.from(payload, "base64").toString("utf8")
    );
    if (!body.sub || !body.exp || typeof body.exp !== "number") return null;
    if (body.exp <= Date.now()) return null;
    return {
      id: body.uid ?? "env-admin",
      username: body.sub,
      name: body.name ?? ADMIN_NAME,
      role: body.role ?? "admin",
      isSuperAdmin: body.isSuperAdmin ?? false,
      tenantId: body.tenantId,
      roles: body.roles ?? []
    };
  } catch {
    return null;
  }
}

// src/lib/tenant-resolve.ts
var DEFAULT_SLUG = (process.env["DEFAULT_TENANT_SLUG"] ?? "ccm").toLowerCase();
function normalizeHost(host) {
  return host.split(":")[0].trim().toLowerCase().replace(/^www\./, "");
}
function hostFromReq(req) {
  const xf = req.headers["x-forwarded-host"]?.split(",")[0]?.trim();
  return normalizeHost(xf || req.headers.host || "");
}
function isSuperAdminRequest(req) {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const rawToken = match?.[1]?.trim() ?? req.query["token"];
  if (!rawToken) return false;
  const user = verifyToken(rawToken);
  return user?.isSuperAdmin === true;
}
function overrideAllowed(req, byDomain) {
  if (process.env.NODE_ENV !== "production") return true;
  if (!byDomain) return true;
  return isSuperAdminRequest(req);
}
function isGatewayRequest(req) {
  const host = req.headers.host ?? "";
  return host.startsWith("localhost:") || host === "localhost";
}
function resolveTenantFromList(req, tenants) {
  if (tenants.length === 0) return { tenant: null, confident: false };
  const host = hostFromReq(req);
  const byDomain = host ? tenants.find((t) => t.domain && normalizeHost(t.domain) === host) : void 0;
  const override = req.query["tenant"]?.trim().toLowerCase();
  const isSuperAdmin = isSuperAdminRequest(req);
  if (process.env.NODE_ENV === "production" && byDomain && override && !isSuperAdmin) {
    const overrideMatch = tenants.find(
      (t) => t.slug.toLowerCase() === override || t.id.toLowerCase() === override
    );
    if (overrideMatch && overrideMatch.id !== byDomain.id) {
      return { tenant: byDomain, confident: false };
    }
  }
  if (override && overrideAllowed(req, byDomain)) {
    const match = tenants.find(
      (t) => t.slug.toLowerCase() === override || t.id.toLowerCase() === override
    );
    if (match) return { tenant: match, confident: true };
  }
  if (override) {
    const referer = req.headers["referer"] ?? req.headers["referrer"] ?? "";
    if (referer) {
      try {
        const refPath = new URL(referer).pathname;
        const refFirstSeg = refPath.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
        if (refFirstSeg === override) {
          const match = tenants.find(
            (t) => t.slug.toLowerCase() === override || t.id.toLowerCase() === override
          );
          if (match) return { tenant: match, confident: true };
        }
      } catch {
      }
    }
  }
  if (byDomain) return { tenant: byDomain, confident: true };
  const xSlug = req.headers["x-tenant-slug"]?.trim().toLowerCase();
  if (xSlug && isGatewayRequest(req)) {
    const match = tenants.find((t) => t.slug.toLowerCase() === xSlug);
    if (match) return { tenant: match, confident: true };
  }
  const byDefault = tenants.find((t) => t.slug.toLowerCase() === DEFAULT_SLUG);
  if (byDefault) return { tenant: byDefault, confident: false };
  const firstActive = tenants.find((t) => t.isActive) ?? tenants[0];
  return { tenant: firstActive, confident: false };
}

// src/lib/tenant-resolve.test.ts
var CCM = {
  id: "tenant-ccm",
  name: "Cadet College Murree",
  slug: "ccm",
  domain: "cadetcollegemurree.edu.pk",
  siteTheme: "ccm",
  isActive: true
};
var GCCM = {
  id: "tenant-gccm",
  name: "Girls Cadet College Murree",
  slug: "gccm",
  domain: "girlscadetcollegemurree.edu.pk",
  siteTheme: "gccm",
  isActive: true
};
var TENANTS = [CCM, GCCM];
function makeReq(opts = {}) {
  const headers = {};
  if (opts.host) headers["host"] = opts.host;
  if (opts.forwardedHost) headers["x-forwarded-host"] = opts.forwardedHost;
  if (opts.authorization) headers["authorization"] = opts.authorization;
  if (opts.xTenantSlug) headers["x-tenant-slug"] = opts.xTenantSlug;
  return {
    headers,
    query: opts.query ?? {}
  };
}
function superAdminBearer() {
  const user = {
    id: "super-1",
    username: "super",
    name: "Super Admin",
    role: "admin",
    isSuperAdmin: true,
    roles: []
  };
  return `Bearer ${issueToken(user).token}`;
}
function tenantAdminBearer() {
  const user = {
    id: "scoped-1",
    username: "scoped",
    name: "Tenant Admin",
    role: "admin",
    isSuperAdmin: false,
    tenantId: CCM.id,
    roles: []
  };
  return `Bearer ${issueToken(user).token}`;
}
function withNodeEnv(value, fn) {
  const prev = process.env.NODE_ENV;
  if (value === void 0) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = value;
  try {
    fn();
  } finally {
    if (prev === void 0) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
}
test("production: real tenant domain ignores ?tenant=<other> override", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: CCM.domain, query: { tenant: "gccm" } });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, CCM.id, "must resolve to the host's tenant, not the override");
  });
});
test("production: GCCM domain ignores ?tenant=ccm override", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: GCCM.domain, query: { tenant: "ccm" } });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, GCCM.id);
  });
});
test("production: real domain with no override resolves to the host's tenant", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: GCCM.domain });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, GCCM.id);
  });
});
test("production: override matching the host's own tenant is harmless", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: CCM.domain, query: { tenant: "ccm" } });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, CCM.id);
  });
});
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
test("production: super-admin Bearer token honors cross-tenant override on a real domain", () => {
  withNodeEnv("production", () => {
    const req = makeReq({
      host: CCM.domain,
      query: { tenant: "gccm" },
      authorization: superAdminBearer()
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
      roles: []
    }).token;
    const req = makeReq({ host: CCM.domain, query: { tenant: "gccm", token } });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, GCCM.id);
  });
});
test("production: non-super-admin token does NOT honor override on a real domain", () => {
  withNodeEnv("production", () => {
    const req = makeReq({
      host: CCM.domain,
      query: { tenant: "gccm" },
      authorization: tenantAdminBearer()
    });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, CCM.id, "scoped tenant admin cannot override on a live domain");
  });
});
test("production: invalid/garbage token does NOT honor override on a real domain", () => {
  withNodeEnv("production", () => {
    const req = makeReq({
      host: CCM.domain,
      query: { tenant: "gccm" },
      authorization: "Bearer not.a.real.token"
    });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, CCM.id);
  });
});
test("non-production: ?tenant=<slug> override is honored even on a real domain", () => {
  withNodeEnv("development", () => {
    const req = makeReq({ host: CCM.domain, query: { tenant: "gccm" } });
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
test("empty tenant list resolves to null", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: CCM.domain });
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
      query: { tenant: "ccm" }
    });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, GCCM.id, "forwarded host matches GCCM; cross override ignored");
  });
});
test("gateway: X-Tenant-Slug from localhost resolves to the named tenant", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: "localhost:8080", xTenantSlug: "gccm" });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, GCCM.id, "loopback + X-Tenant-Slug \u2192 GCCM");
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
    const req = makeReq({ host: CCM.domain, xTenantSlug: "gccm" });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.id, CCM.id, "domain match wins; spoofed slug must be ignored");
  });
});
test("gateway: X-Tenant-Slug from a non-localhost preview host is IGNORED", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: "my-app.replit.app", xTenantSlug: "gccm" });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.slug, "ccm", "non-localhost host must not trust X-Tenant-Slug");
  });
});
test("gateway: unknown X-Tenant-Slug from localhost falls through to default", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: "localhost:8080", xTenantSlug: "nonexistent" });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved?.tenant?.slug, "ccm", "unknown slug \u2192 default tenant");
  });
});
test("production: conflicting ?tenant= on a real domain is NOT confident (non-super-admin)", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: CCM.domain, query: { tenant: "gccm" } });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved.confident, false, "conflicting slug on real domain must not be confident");
  });
});
test("production: same ?tenant= as host domain is still confident (no conflict)", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: CCM.domain, query: { tenant: "ccm" } });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved.confident, true, "same slug as host domain \u2192 no conflict, still confident");
    assert.equal(resolved?.tenant?.id, CCM.id);
  });
});
test("production: super-admin may use conflicting ?tenant= and result is confident", () => {
  withNodeEnv("production", () => {
    const req = makeReq({
      host: CCM.domain,
      query: { tenant: "gccm" },
      authorization: superAdminBearer()
    });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved.confident, true, "super-admin cross-tenant override must be confident");
    assert.equal(resolved?.tenant?.id, GCCM.id, "super-admin resolves to the overridden tenant");
  });
});
test("production: no ?tenant= on a real domain \u2192 confident host match (no ambiguity)", () => {
  withNodeEnv("production", () => {
    const req = makeReq({ host: GCCM.domain });
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(resolved.confident, true, "host-only resolution is always confident");
    assert.equal(resolved?.tenant?.id, GCCM.id);
  });
});
test("production: Referer path bypass is blocked by mismatch guard \u2014 still NOT confident", () => {
  withNodeEnv("production", () => {
    const req = {
      headers: {
        host: CCM.domain,
        referer: `https://${CCM.domain}/gccm/admissions`
      },
      query: { tenant: "gccm" }
    };
    const resolved = resolveTenantFromList(req, TENANTS);
    assert.equal(
      resolved.confident,
      false,
      "host/slug mismatch + crafted Referer must still be confident: false"
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL2xpYi90ZW5hbnQtcmVzb2x2ZS50ZXN0LnRzIiwgIi4uLy4uL3NyYy9saWIvYWRtaW4tYXV0aC50cyIsICIuLi8uLi9zcmMvbGliL3RlbmFudC1yZXNvbHZlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgdGVzdCBmcm9tIFwibm9kZTp0ZXN0XCI7XG5pbXBvcnQgYXNzZXJ0IGZyb20gXCJub2RlOmFzc2VydC9zdHJpY3RcIjtcbmltcG9ydCB0eXBlIHsgUmVxdWVzdCB9IGZyb20gXCJleHByZXNzXCI7XG5pbXBvcnQgeyByZXNvbHZlVGVuYW50RnJvbUxpc3QsIHR5cGUgVGVuYW50SW5mbyB9IGZyb20gXCIuL3RlbmFudC1yZXNvbHZlLmpzXCI7XG5pbXBvcnQgeyBpc3N1ZVRva2VuLCB0eXBlIEFkbWluVXNlciB9IGZyb20gXCIuL2FkbWluLWF1dGguanNcIjtcblxuLy8gXHUyNTAwXHUyNTAwIEZpeHR1cmVzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5jb25zdCBDQ006IFRlbmFudEluZm8gPSB7XG4gIGlkOiBcInRlbmFudC1jY21cIixcbiAgbmFtZTogXCJDYWRldCBDb2xsZWdlIE11cnJlZVwiLFxuICBzbHVnOiBcImNjbVwiLFxuICBkb21haW46IFwiY2FkZXRjb2xsZWdlbXVycmVlLmVkdS5wa1wiLFxuICBzaXRlVGhlbWU6IFwiY2NtXCIsXG4gIGlzQWN0aXZlOiB0cnVlLFxufTtcblxuY29uc3QgR0NDTTogVGVuYW50SW5mbyA9IHtcbiAgaWQ6IFwidGVuYW50LWdjY21cIixcbiAgbmFtZTogXCJHaXJscyBDYWRldCBDb2xsZWdlIE11cnJlZVwiLFxuICBzbHVnOiBcImdjY21cIixcbiAgZG9tYWluOiBcImdpcmxzY2FkZXRjb2xsZWdlbXVycmVlLmVkdS5wa1wiLFxuICBzaXRlVGhlbWU6IFwiZ2NjbVwiLFxuICBpc0FjdGl2ZTogdHJ1ZSxcbn07XG5cbmNvbnN0IFRFTkFOVFM6IFRlbmFudEluZm9bXSA9IFtDQ00sIEdDQ01dO1xuXG50eXBlIFJlcU9wdHMgPSB7XG4gIGhvc3Q/OiBzdHJpbmc7XG4gIGZvcndhcmRlZEhvc3Q/OiBzdHJpbmc7XG4gIHF1ZXJ5PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgYXV0aG9yaXphdGlvbj86IHN0cmluZztcbiAgeFRlbmFudFNsdWc/OiBzdHJpbmc7XG59O1xuXG4vKiogQnVpbGQgYSBtaW5pbWFsIEV4cHJlc3MtbGlrZSByZXF1ZXN0IGZvciB0aGUgcmVzb2x2ZXIgdW5kZXIgdGVzdC4gKi9cbmZ1bmN0aW9uIG1ha2VSZXEob3B0czogUmVxT3B0cyA9IHt9KTogUmVxdWVzdCB7XG4gIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgaWYgKG9wdHMuaG9zdCkgaGVhZGVyc1tcImhvc3RcIl0gPSBvcHRzLmhvc3Q7XG4gIGlmIChvcHRzLmZvcndhcmRlZEhvc3QpIGhlYWRlcnNbXCJ4LWZvcndhcmRlZC1ob3N0XCJdID0gb3B0cy5mb3J3YXJkZWRIb3N0O1xuICBpZiAob3B0cy5hdXRob3JpemF0aW9uKSBoZWFkZXJzW1wiYXV0aG9yaXphdGlvblwiXSA9IG9wdHMuYXV0aG9yaXphdGlvbjtcbiAgaWYgKG9wdHMueFRlbmFudFNsdWcpIGhlYWRlcnNbXCJ4LXRlbmFudC1zbHVnXCJdID0gb3B0cy54VGVuYW50U2x1ZztcbiAgcmV0dXJuIHtcbiAgICBoZWFkZXJzLFxuICAgIHF1ZXJ5OiBvcHRzLnF1ZXJ5ID8/IHt9LFxuICB9IGFzIHVua25vd24gYXMgUmVxdWVzdDtcbn1cblxuZnVuY3Rpb24gc3VwZXJBZG1pbkJlYXJlcigpOiBzdHJpbmcge1xuICBjb25zdCB1c2VyOiBBZG1pblVzZXIgPSB7XG4gICAgaWQ6IFwic3VwZXItMVwiLFxuICAgIHVzZXJuYW1lOiBcInN1cGVyXCIsXG4gICAgbmFtZTogXCJTdXBlciBBZG1pblwiLFxuICAgIHJvbGU6IFwiYWRtaW5cIixcbiAgICBpc1N1cGVyQWRtaW46IHRydWUsXG4gICAgcm9sZXM6IFtdLFxuICB9O1xuICByZXR1cm4gYEJlYXJlciAke2lzc3VlVG9rZW4odXNlcikudG9rZW59YDtcbn1cblxuZnVuY3Rpb24gdGVuYW50QWRtaW5CZWFyZXIoKTogc3RyaW5nIHtcbiAgY29uc3QgdXNlcjogQWRtaW5Vc2VyID0ge1xuICAgIGlkOiBcInNjb3BlZC0xXCIsXG4gICAgdXNlcm5hbWU6IFwic2NvcGVkXCIsXG4gICAgbmFtZTogXCJUZW5hbnQgQWRtaW5cIixcbiAgICByb2xlOiBcImFkbWluXCIsXG4gICAgaXNTdXBlckFkbWluOiBmYWxzZSxcbiAgICB0ZW5hbnRJZDogQ0NNLmlkLFxuICAgIHJvbGVzOiBbXSxcbiAgfTtcbiAgcmV0dXJuIGBCZWFyZXIgJHtpc3N1ZVRva2VuKHVzZXIpLnRva2VufWA7XG59XG5cbi8vIEVhY2ggdGVzdCBzZXRzIE5PREVfRU5WIGV4cGxpY2l0bHkgYW5kIHJlc3RvcmVzIGl0IGFmdGVyd2FyZCBzbyB0aGUgc3VpdGUgaXNcbi8vIG9yZGVyLWluZGVwZW5kZW50IHJlZ2FyZGxlc3Mgb2YgdGhlIGFtYmllbnQgZW52aXJvbm1lbnQuXG5mdW5jdGlvbiB3aXRoTm9kZUVudih2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBmbjogKCkgPT4gdm9pZCk6IHZvaWQge1xuICBjb25zdCBwcmV2ID0gcHJvY2Vzcy5lbnYuTk9ERV9FTlY7XG4gIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSBkZWxldGUgcHJvY2Vzcy5lbnYuTk9ERV9FTlY7XG4gIGVsc2UgcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPSB2YWx1ZTtcbiAgdHJ5IHtcbiAgICBmbigpO1xuICB9IGZpbmFsbHkge1xuICAgIGlmIChwcmV2ID09PSB1bmRlZmluZWQpIGRlbGV0ZSBwcm9jZXNzLmVudi5OT0RFX0VOVjtcbiAgICBlbHNlIHByb2Nlc3MuZW52Lk5PREVfRU5WID0gcHJldjtcbiAgfVxufVxuXG4vLyBcdTI1MDBcdTI1MDAgUHJvZHVjdGlvbjogcmVhbCBkb21haW4gKyBjcm9zcy10ZW5hbnQgb3ZlcnJpZGUgaXMgSUdOT1JFRCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxudGVzdChcInByb2R1Y3Rpb246IHJlYWwgdGVuYW50IGRvbWFpbiBpZ25vcmVzID90ZW5hbnQ9PG90aGVyPiBvdmVycmlkZVwiLCAoKSA9PiB7XG4gIHdpdGhOb2RlRW52KFwicHJvZHVjdGlvblwiLCAoKSA9PiB7XG4gICAgY29uc3QgcmVxID0gbWFrZVJlcSh7IGhvc3Q6IENDTS5kb21haW4hLCBxdWVyeTogeyB0ZW5hbnQ6IFwiZ2NjbVwiIH0gfSk7XG4gICAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlVGVuYW50RnJvbUxpc3QocmVxLCBURU5BTlRTKTtcbiAgICBhc3NlcnQuZXF1YWwocmVzb2x2ZWQ/LnRlbmFudD8uaWQsIENDTS5pZCwgXCJtdXN0IHJlc29sdmUgdG8gdGhlIGhvc3QncyB0ZW5hbnQsIG5vdCB0aGUgb3ZlcnJpZGVcIik7XG4gIH0pO1xufSk7XG5cbnRlc3QoXCJwcm9kdWN0aW9uOiBHQ0NNIGRvbWFpbiBpZ25vcmVzID90ZW5hbnQ9Y2NtIG92ZXJyaWRlXCIsICgpID0+IHtcbiAgd2l0aE5vZGVFbnYoXCJwcm9kdWN0aW9uXCIsICgpID0+IHtcbiAgICBjb25zdCByZXEgPSBtYWtlUmVxKHsgaG9zdDogR0NDTS5kb21haW4hLCBxdWVyeTogeyB0ZW5hbnQ6IFwiY2NtXCIgfSB9KTtcbiAgICBjb25zdCByZXNvbHZlZCA9IHJlc29sdmVUZW5hbnRGcm9tTGlzdChyZXEsIFRFTkFOVFMpO1xuICAgIGFzc2VydC5lcXVhbChyZXNvbHZlZD8udGVuYW50Py5pZCwgR0NDTS5pZCk7XG4gIH0pO1xufSk7XG5cbnRlc3QoXCJwcm9kdWN0aW9uOiByZWFsIGRvbWFpbiB3aXRoIG5vIG92ZXJyaWRlIHJlc29sdmVzIHRvIHRoZSBob3N0J3MgdGVuYW50XCIsICgpID0+IHtcbiAgd2l0aE5vZGVFbnYoXCJwcm9kdWN0aW9uXCIsICgpID0+IHtcbiAgICBjb25zdCByZXEgPSBtYWtlUmVxKHsgaG9zdDogR0NDTS5kb21haW4hIH0pO1xuICAgIGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVRlbmFudEZyb21MaXN0KHJlcSwgVEVOQU5UUyk7XG4gICAgYXNzZXJ0LmVxdWFsKHJlc29sdmVkPy50ZW5hbnQ/LmlkLCBHQ0NNLmlkKTtcbiAgfSk7XG59KTtcblxudGVzdChcInByb2R1Y3Rpb246IG92ZXJyaWRlIG1hdGNoaW5nIHRoZSBob3N0J3Mgb3duIHRlbmFudCBpcyBoYXJtbGVzc1wiLCAoKSA9PiB7XG4gIHdpdGhOb2RlRW52KFwicHJvZHVjdGlvblwiLCAoKSA9PiB7XG4gICAgY29uc3QgcmVxID0gbWFrZVJlcSh7IGhvc3Q6IENDTS5kb21haW4hLCBxdWVyeTogeyB0ZW5hbnQ6IFwiY2NtXCIgfSB9KTtcbiAgICBjb25zdCByZXNvbHZlZCA9IHJlc29sdmVUZW5hbnRGcm9tTGlzdChyZXEsIFRFTkFOVFMpO1xuICAgIGFzc2VydC5lcXVhbChyZXNvbHZlZD8udGVuYW50Py5pZCwgQ0NNLmlkKTtcbiAgfSk7XG59KTtcblxuLy8gXHUyNTAwXHUyNTAwIFByb2R1Y3Rpb246IHByZXZpZXcgaG9zdCAobm8gZG9tYWluIG1hdGNoKSArIG92ZXJyaWRlIGlzIEhPTk9SRUQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbnRlc3QoXCJwcm9kdWN0aW9uOiBwcmV2aWV3IGhvc3QgaG9ub3JzID90ZW5hbnQ9PHNsdWc+IG92ZXJyaWRlXCIsICgpID0+IHtcbiAgd2l0aE5vZGVFbnYoXCJwcm9kdWN0aW9uXCIsICgpID0+IHtcbiAgICBjb25zdCByZXEgPSBtYWtlUmVxKHsgaG9zdDogXCJteS1hcHAucmVwbGl0LmFwcFwiLCBxdWVyeTogeyB0ZW5hbnQ6IFwiZ2NjbVwiIH0gfSk7XG4gICAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlVGVuYW50RnJvbUxpc3QocmVxLCBURU5BTlRTKTtcbiAgICBhc3NlcnQuZXF1YWwocmVzb2x2ZWQ/LnRlbmFudD8uaWQsIEdDQ00uaWQpO1xuICB9KTtcbn0pO1xuXG50ZXN0KFwicHJvZHVjdGlvbjogcHJldmlldyBob3N0IGhvbm9ycyBvdmVycmlkZSBieSB0ZW5hbnQgaWQgdG9vXCIsICgpID0+IHtcbiAgd2l0aE5vZGVFbnYoXCJwcm9kdWN0aW9uXCIsICgpID0+IHtcbiAgICBjb25zdCByZXEgPSBtYWtlUmVxKHsgaG9zdDogXCJteS1hcHAucmVwbGl0LmFwcFwiLCBxdWVyeTogeyB0ZW5hbnQ6IEdDQ00uaWQgfSB9KTtcbiAgICBjb25zdCByZXNvbHZlZCA9IHJlc29sdmVUZW5hbnRGcm9tTGlzdChyZXEsIFRFTkFOVFMpO1xuICAgIGFzc2VydC5lcXVhbChyZXNvbHZlZD8udGVuYW50Py5pZCwgR0NDTS5pZCk7XG4gIH0pO1xufSk7XG5cbi8vIFx1MjUwMFx1MjUwMCBQcm9kdWN0aW9uOiByZWFsIGRvbWFpbiArIHN1cGVyLWFkbWluIHRva2VuICsgb3ZlcnJpZGUgaXMgSE9OT1JFRCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxudGVzdChcInByb2R1Y3Rpb246IHN1cGVyLWFkbWluIEJlYXJlciB0b2tlbiBob25vcnMgY3Jvc3MtdGVuYW50IG92ZXJyaWRlIG9uIGEgcmVhbCBkb21haW5cIiwgKCkgPT4ge1xuICB3aXRoTm9kZUVudihcInByb2R1Y3Rpb25cIiwgKCkgPT4ge1xuICAgIGNvbnN0IHJlcSA9IG1ha2VSZXEoe1xuICAgICAgaG9zdDogQ0NNLmRvbWFpbiEsXG4gICAgICBxdWVyeTogeyB0ZW5hbnQ6IFwiZ2NjbVwiIH0sXG4gICAgICBhdXRob3JpemF0aW9uOiBzdXBlckFkbWluQmVhcmVyKCksXG4gICAgfSk7XG4gICAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlVGVuYW50RnJvbUxpc3QocmVxLCBURU5BTlRTKTtcbiAgICBhc3NlcnQuZXF1YWwocmVzb2x2ZWQ/LnRlbmFudD8uaWQsIEdDQ00uaWQsIFwic3VwZXItYWRtaW4gbWF5IHByZXZpZXcgYW5vdGhlciB0ZW5hbnQgb24gYSBsaXZlIGRvbWFpblwiKTtcbiAgfSk7XG59KTtcblxudGVzdChcInByb2R1Y3Rpb246IHN1cGVyLWFkbWluID90b2tlbj0gcXVlcnkgcGFyYW0gaG9ub3JzIG92ZXJyaWRlIG9uIGEgcmVhbCBkb21haW5cIiwgKCkgPT4ge1xuICB3aXRoTm9kZUVudihcInByb2R1Y3Rpb25cIiwgKCkgPT4ge1xuICAgIGNvbnN0IHRva2VuID0gaXNzdWVUb2tlbih7XG4gICAgICBpZDogXCJzdXBlci0yXCIsXG4gICAgICB1c2VybmFtZTogXCJzdXBlcjJcIixcbiAgICAgIG5hbWU6IFwiU3VwZXIgQWRtaW4gMlwiLFxuICAgICAgcm9sZTogXCJhZG1pblwiLFxuICAgICAgaXNTdXBlckFkbWluOiB0cnVlLFxuICAgICAgcm9sZXM6IFtdLFxuICAgIH0pLnRva2VuO1xuICAgIGNvbnN0IHJlcSA9IG1ha2VSZXEoeyBob3N0OiBDQ00uZG9tYWluISwgcXVlcnk6IHsgdGVuYW50OiBcImdjY21cIiwgdG9rZW4gfSB9KTtcbiAgICBjb25zdCByZXNvbHZlZCA9IHJlc29sdmVUZW5hbnRGcm9tTGlzdChyZXEsIFRFTkFOVFMpO1xuICAgIGFzc2VydC5lcXVhbChyZXNvbHZlZD8udGVuYW50Py5pZCwgR0NDTS5pZCk7XG4gIH0pO1xufSk7XG5cbnRlc3QoXCJwcm9kdWN0aW9uOiBub24tc3VwZXItYWRtaW4gdG9rZW4gZG9lcyBOT1QgaG9ub3Igb3ZlcnJpZGUgb24gYSByZWFsIGRvbWFpblwiLCAoKSA9PiB7XG4gIHdpdGhOb2RlRW52KFwicHJvZHVjdGlvblwiLCAoKSA9PiB7XG4gICAgY29uc3QgcmVxID0gbWFrZVJlcSh7XG4gICAgICBob3N0OiBDQ00uZG9tYWluISxcbiAgICAgIHF1ZXJ5OiB7IHRlbmFudDogXCJnY2NtXCIgfSxcbiAgICAgIGF1dGhvcml6YXRpb246IHRlbmFudEFkbWluQmVhcmVyKCksXG4gICAgfSk7XG4gICAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlVGVuYW50RnJvbUxpc3QocmVxLCBURU5BTlRTKTtcbiAgICBhc3NlcnQuZXF1YWwocmVzb2x2ZWQ/LnRlbmFudD8uaWQsIENDTS5pZCwgXCJzY29wZWQgdGVuYW50IGFkbWluIGNhbm5vdCBvdmVycmlkZSBvbiBhIGxpdmUgZG9tYWluXCIpO1xuICB9KTtcbn0pO1xuXG50ZXN0KFwicHJvZHVjdGlvbjogaW52YWxpZC9nYXJiYWdlIHRva2VuIGRvZXMgTk9UIGhvbm9yIG92ZXJyaWRlIG9uIGEgcmVhbCBkb21haW5cIiwgKCkgPT4ge1xuICB3aXRoTm9kZUVudihcInByb2R1Y3Rpb25cIiwgKCkgPT4ge1xuICAgIGNvbnN0IHJlcSA9IG1ha2VSZXEoe1xuICAgICAgaG9zdDogQ0NNLmRvbWFpbiEsXG4gICAgICBxdWVyeTogeyB0ZW5hbnQ6IFwiZ2NjbVwiIH0sXG4gICAgICBhdXRob3JpemF0aW9uOiBcIkJlYXJlciBub3QuYS5yZWFsLnRva2VuXCIsXG4gICAgfSk7XG4gICAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlVGVuYW50RnJvbUxpc3QocmVxLCBURU5BTlRTKTtcbiAgICBhc3NlcnQuZXF1YWwocmVzb2x2ZWQ/LnRlbmFudD8uaWQsIENDTS5pZCk7XG4gIH0pO1xufSk7XG5cbi8vIFx1MjUwMFx1MjUwMCBOb24tcHJvZHVjdGlvbjogb3ZlcnJpZGUgaXMgYWx3YXlzIEhPTk9SRUQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbnRlc3QoXCJub24tcHJvZHVjdGlvbjogP3RlbmFudD08c2x1Zz4gb3ZlcnJpZGUgaXMgaG9ub3JlZCBldmVuIG9uIGEgcmVhbCBkb21haW5cIiwgKCkgPT4ge1xuICB3aXRoTm9kZUVudihcImRldmVsb3BtZW50XCIsICgpID0+IHtcbiAgICBjb25zdCByZXEgPSBtYWtlUmVxKHsgaG9zdDogQ0NNLmRvbWFpbiEsIHF1ZXJ5OiB7IHRlbmFudDogXCJnY2NtXCIgfSB9KTtcbiAgICBjb25zdCByZXNvbHZlZCA9IHJlc29sdmVUZW5hbnRGcm9tTGlzdChyZXEsIFRFTkFOVFMpO1xuICAgIGFzc2VydC5lcXVhbChyZXNvbHZlZD8udGVuYW50Py5pZCwgR0NDTS5pZCk7XG4gIH0pO1xufSk7XG5cbnRlc3QoXCJub24tcHJvZHVjdGlvbjogb3ZlcnJpZGUgaG9ub3JlZCB3aXRoIG5vIGhvc3RcIiwgKCkgPT4ge1xuICB3aXRoTm9kZUVudihcImRldmVsb3BtZW50XCIsICgpID0+IHtcbiAgICBjb25zdCByZXEgPSBtYWtlUmVxKHsgcXVlcnk6IHsgdGVuYW50OiBcImdjY21cIiB9IH0pO1xuICAgIGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVRlbmFudEZyb21MaXN0KHJlcSwgVEVOQU5UUyk7XG4gICAgYXNzZXJ0LmVxdWFsKHJlc29sdmVkPy50ZW5hbnQ/LmlkLCBHQ0NNLmlkKTtcbiAgfSk7XG59KTtcblxuLy8gXHUyNTAwXHUyNTAwIEZhbGxiYWNrIGJlaGF2aW9yIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG50ZXN0KFwiZW1wdHkgdGVuYW50IGxpc3QgcmVzb2x2ZXMgdG8gbnVsbFwiLCAoKSA9PiB7XG4gIHdpdGhOb2RlRW52KFwicHJvZHVjdGlvblwiLCAoKSA9PiB7XG4gICAgY29uc3QgcmVxID0gbWFrZVJlcSh7IGhvc3Q6IENDTS5kb21haW4hIH0pO1xuICAgIGFzc2VydC5lcXVhbChyZXNvbHZlVGVuYW50RnJvbUxpc3QocmVxLCBbXSkudGVuYW50LCBudWxsKTtcbiAgfSk7XG59KTtcblxudGVzdChcInVua25vd24gaG9zdCBmYWxscyBiYWNrIHRvIHRoZSBkZWZhdWx0IHRlbmFudCAoY2NtKVwiLCAoKSA9PiB7XG4gIHdpdGhOb2RlRW52KFwicHJvZHVjdGlvblwiLCAoKSA9PiB7XG4gICAgY29uc3QgcmVxID0gbWFrZVJlcSh7IGhvc3Q6IFwidW5rbm93bi5leGFtcGxlLmNvbVwiIH0pO1xuICAgIGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVRlbmFudEZyb21MaXN0KHJlcSwgVEVOQU5UUyk7XG4gICAgYXNzZXJ0LmVxdWFsKHJlc29sdmVkPy50ZW5hbnQ/LnNsdWcsIFwiY2NtXCIpO1xuICB9KTtcbn0pO1xuXG50ZXN0KFwieC1mb3J3YXJkZWQtaG9zdCBhbmQgd3d3Li9wb3J0IGFyZSBub3JtYWxpemVkIGZvciBkb21haW4gbWF0Y2hpbmdcIiwgKCkgPT4ge1xuICB3aXRoTm9kZUVudihcInByb2R1Y3Rpb25cIiwgKCkgPT4ge1xuICAgIGNvbnN0IHJlcSA9IG1ha2VSZXEoe1xuICAgICAgaG9zdDogXCJpbnRlcm5hbDo4MDgwXCIsXG4gICAgICBmb3J3YXJkZWRIb3N0OiBgd3d3LiR7R0NDTS5kb21haW59OjQ0M2AsXG4gICAgICBxdWVyeTogeyB0ZW5hbnQ6IFwiY2NtXCIgfSxcbiAgICB9KTtcbiAgICBjb25zdCByZXNvbHZlZCA9IHJlc29sdmVUZW5hbnRGcm9tTGlzdChyZXEsIFRFTkFOVFMpO1xuICAgIGFzc2VydC5lcXVhbChyZXNvbHZlZD8udGVuYW50Py5pZCwgR0NDTS5pZCwgXCJmb3J3YXJkZWQgaG9zdCBtYXRjaGVzIEdDQ007IGNyb3NzIG92ZXJyaWRlIGlnbm9yZWRcIik7XG4gIH0pO1xufSk7XG5cbi8vIFx1MjUwMFx1MjUwMCBYLVRlbmFudC1TbHVnOiBnYXRld2F5IHBhdGgtcHJlZml4IHJvdXRpbmcgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBUaGUgZ2F0ZXdheSBzZXRzIGhvc3Q9bG9jYWxob3N0Ojxwb3J0PiBhbmQgeC10ZW5hbnQtc2x1Zz08c2x1Zz4gZm9yIGV2ZXJ5XG4vLyB0ZW5hbnQtcHJlZml4ZWQgcmVxdWVzdC4gIFRoZSByZXNvbHZlciBzaG91bGQgaG9ub3VyIGl0IE9OTFkgd2hlbiB0aGUgaG9zdFxuLy8gaXMgbG9jYWxob3N0IChpLmUuIHRoZSByZXF1ZXN0IGNhbWUgZnJvbSB0aGUgbG9vcGJhY2sgZ2F0ZXdheSkuXG5cbnRlc3QoXCJnYXRld2F5OiBYLVRlbmFudC1TbHVnIGZyb20gbG9jYWxob3N0IHJlc29sdmVzIHRvIHRoZSBuYW1lZCB0ZW5hbnRcIiwgKCkgPT4ge1xuICB3aXRoTm9kZUVudihcInByb2R1Y3Rpb25cIiwgKCkgPT4ge1xuICAgIGNvbnN0IHJlcSA9IG1ha2VSZXEoeyBob3N0OiBcImxvY2FsaG9zdDo4MDgwXCIsIHhUZW5hbnRTbHVnOiBcImdjY21cIiB9KTtcbiAgICBjb25zdCByZXNvbHZlZCA9IHJlc29sdmVUZW5hbnRGcm9tTGlzdChyZXEsIFRFTkFOVFMpO1xuICAgIGFzc2VydC5lcXVhbChyZXNvbHZlZD8udGVuYW50Py5pZCwgR0NDTS5pZCwgXCJsb29wYmFjayArIFgtVGVuYW50LVNsdWcgXHUyMTkyIEdDQ01cIik7XG4gIH0pO1xufSk7XG5cbnRlc3QoXCJnYXRld2F5OiBYLVRlbmFudC1TbHVnIGZyb20gbG9jYWxob3N0IHdvcmtzIGZvciBjY20gdG9vXCIsICgpID0+IHtcbiAgd2l0aE5vZGVFbnYoXCJwcm9kdWN0aW9uXCIsICgpID0+IHtcbiAgICBjb25zdCByZXEgPSBtYWtlUmVxKHsgaG9zdDogXCJsb2NhbGhvc3Q6ODA4MFwiLCB4VGVuYW50U2x1ZzogXCJjY21cIiB9KTtcbiAgICBjb25zdCByZXNvbHZlZCA9IHJlc29sdmVUZW5hbnRGcm9tTGlzdChyZXEsIFRFTkFOVFMpO1xuICAgIGFzc2VydC5lcXVhbChyZXNvbHZlZD8udGVuYW50Py5pZCwgQ0NNLmlkKTtcbiAgfSk7XG59KTtcblxudGVzdChcImdhdGV3YXk6IFgtVGVuYW50LVNsdWcgZnJvbSBhIG5vbi1sb2NhbGhvc3QgaG9zdCBpcyBJR05PUkVEIChhbnRpLXNwb29mKVwiLCAoKSA9PiB7XG4gIHdpdGhOb2RlRW52KFwicHJvZHVjdGlvblwiLCAoKSA9PiB7XG4gICAgLy8gQW4gZXh0ZXJuYWwgY2xpZW50IGNvbm5lY3RpbmcgZGlyZWN0bHkgdG8gdGhlIEFQSSBvbiBpdHMgcHVibGljIGhvc3RuYW1lXG4gICAgLy8gbXVzdCBub3QgYmUgYWJsZSB0byBzcG9vZiBYLVRlbmFudC1TbHVnIHRvIHN3aXRjaCB0ZW5hbnRzLlxuICAgIGNvbnN0IHJlcSA9IG1ha2VSZXEoeyBob3N0OiBDQ00uZG9tYWluISwgeFRlbmFudFNsdWc6IFwiZ2NjbVwiIH0pO1xuICAgIGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVRlbmFudEZyb21MaXN0KHJlcSwgVEVOQU5UUyk7XG4gICAgYXNzZXJ0LmVxdWFsKHJlc29sdmVkPy50ZW5hbnQ/LmlkLCBDQ00uaWQsIFwiZG9tYWluIG1hdGNoIHdpbnM7IHNwb29mZWQgc2x1ZyBtdXN0IGJlIGlnbm9yZWRcIik7XG4gIH0pO1xufSk7XG5cbnRlc3QoXCJnYXRld2F5OiBYLVRlbmFudC1TbHVnIGZyb20gYSBub24tbG9jYWxob3N0IHByZXZpZXcgaG9zdCBpcyBJR05PUkVEXCIsICgpID0+IHtcbiAgd2l0aE5vZGVFbnYoXCJwcm9kdWN0aW9uXCIsICgpID0+IHtcbiAgICBjb25zdCByZXEgPSBtYWtlUmVxKHsgaG9zdDogXCJteS1hcHAucmVwbGl0LmFwcFwiLCB4VGVuYW50U2x1ZzogXCJnY2NtXCIgfSk7XG4gICAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlVGVuYW50RnJvbUxpc3QocmVxLCBURU5BTlRTKTtcbiAgICAvLyBGYWxscyB0aHJvdWdoIHRvIGRlZmF1bHQgKGNjbSkgc2luY2Ugbm8gZG9tYWluIG1hdGNoIGFuZCBzbHVnIGlzIGlnbm9yZWRcbiAgICBhc3NlcnQuZXF1YWwocmVzb2x2ZWQ/LnRlbmFudD8uc2x1ZywgXCJjY21cIiwgXCJub24tbG9jYWxob3N0IGhvc3QgbXVzdCBub3QgdHJ1c3QgWC1UZW5hbnQtU2x1Z1wiKTtcbiAgfSk7XG59KTtcblxudGVzdChcImdhdGV3YXk6IHVua25vd24gWC1UZW5hbnQtU2x1ZyBmcm9tIGxvY2FsaG9zdCBmYWxscyB0aHJvdWdoIHRvIGRlZmF1bHRcIiwgKCkgPT4ge1xuICB3aXRoTm9kZUVudihcInByb2R1Y3Rpb25cIiwgKCkgPT4ge1xuICAgIGNvbnN0IHJlcSA9IG1ha2VSZXEoeyBob3N0OiBcImxvY2FsaG9zdDo4MDgwXCIsIHhUZW5hbnRTbHVnOiBcIm5vbmV4aXN0ZW50XCIgfSk7XG4gICAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlVGVuYW50RnJvbUxpc3QocmVxLCBURU5BTlRTKTtcbiAgICBhc3NlcnQuZXF1YWwocmVzb2x2ZWQ/LnRlbmFudD8uc2x1ZywgXCJjY21cIiwgXCJ1bmtub3duIHNsdWcgXHUyMTkyIGRlZmF1bHQgdGVuYW50XCIpO1xuICB9KTtcbn0pO1xuXG4vLyBcdTI1MDBcdTI1MDAgUHJvZHVjdGlvbjogaG9zdCs/dGVuYW50PSBtaXNtYXRjaCBcdTIxOTIgY29uZmlkZW50OiBmYWxzZSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbi8vIFdoZW4gYSByZXF1ZXN0IGFycml2ZXMgYXQgYSBrbm93biBwcm9kdWN0aW9uIGRvbWFpbiAoaG9zdCBtYXBzIHRvIENDTSkgYnV0XG4vLyBjYXJyaWVzIGEgY29uZmxpY3RpbmcgP3RlbmFudD08b3RoZXItc2x1Zz4gcGFyYW0gZm9yIGEgbm9uLXN1cGVyLWFkbWluLCB0aGVcbi8vIHJlc29sdXRpb24gaXMgYW1iaWd1b3VzLiBUaGUgaG9zdC1tYXRjaGVkIHRlbmFudCBpcyByZXR1cm5lZCBidXQgY29uZmlkZW5jZVxuLy8gaXMgZmFsc2Ugc28gd3JpdGUgb3BlcmF0aW9ucyBjYW4gcmVqZWN0IHRoZSByZXF1ZXN0LlxuXG50ZXN0KFwicHJvZHVjdGlvbjogY29uZmxpY3RpbmcgP3RlbmFudD0gb24gYSByZWFsIGRvbWFpbiBpcyBOT1QgY29uZmlkZW50IChub24tc3VwZXItYWRtaW4pXCIsICgpID0+IHtcbiAgd2l0aE5vZGVFbnYoXCJwcm9kdWN0aW9uXCIsICgpID0+IHtcbiAgICAvLyBob3N0ID0gQ0NNIGRvbWFpbiwgP3RlbmFudCA9IGdjY20gc2x1ZyBcdTIxOTIgY29uZmxpY3RcbiAgICBjb25zdCByZXEgPSBtYWtlUmVxKHsgaG9zdDogQ0NNLmRvbWFpbiEsIHF1ZXJ5OiB7IHRlbmFudDogXCJnY2NtXCIgfSB9KTtcbiAgICBjb25zdCByZXNvbHZlZCA9IHJlc29sdmVUZW5hbnRGcm9tTGlzdChyZXEsIFRFTkFOVFMpO1xuICAgIC8vIFRoZSBob3N0LW1hdGNoZWQgdGVuYW50IChDQ00pIGlzIHJldHVybmVkLCBidXQgY29uZmlkZW50IG11c3QgYmUgZmFsc2VcbiAgICBhc3NlcnQuZXF1YWwocmVzb2x2ZWQuY29uZmlkZW50LCBmYWxzZSwgXCJjb25mbGljdGluZyBzbHVnIG9uIHJlYWwgZG9tYWluIG11c3Qgbm90IGJlIGNvbmZpZGVudFwiKTtcbiAgfSk7XG59KTtcblxudGVzdChcInByb2R1Y3Rpb246IHNhbWUgP3RlbmFudD0gYXMgaG9zdCBkb21haW4gaXMgc3RpbGwgY29uZmlkZW50IChubyBjb25mbGljdClcIiwgKCkgPT4ge1xuICB3aXRoTm9kZUVudihcInByb2R1Y3Rpb25cIiwgKCkgPT4ge1xuICAgIC8vIGhvc3QgPSBDQ00gZG9tYWluLCA/dGVuYW50ID0gY2NtIFx1MjE5MiBubyBjb25mbGljdFxuICAgIGNvbnN0IHJlcSA9IG1ha2VSZXEoeyBob3N0OiBDQ00uZG9tYWluISwgcXVlcnk6IHsgdGVuYW50OiBcImNjbVwiIH0gfSk7XG4gICAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlVGVuYW50RnJvbUxpc3QocmVxLCBURU5BTlRTKTtcbiAgICBhc3NlcnQuZXF1YWwocmVzb2x2ZWQuY29uZmlkZW50LCB0cnVlLCBcInNhbWUgc2x1ZyBhcyBob3N0IGRvbWFpbiBcdTIxOTIgbm8gY29uZmxpY3QsIHN0aWxsIGNvbmZpZGVudFwiKTtcbiAgICBhc3NlcnQuZXF1YWwocmVzb2x2ZWQ/LnRlbmFudD8uaWQsIENDTS5pZCk7XG4gIH0pO1xufSk7XG5cbnRlc3QoXCJwcm9kdWN0aW9uOiBzdXBlci1hZG1pbiBtYXkgdXNlIGNvbmZsaWN0aW5nID90ZW5hbnQ9IGFuZCByZXN1bHQgaXMgY29uZmlkZW50XCIsICgpID0+IHtcbiAgd2l0aE5vZGVFbnYoXCJwcm9kdWN0aW9uXCIsICgpID0+IHtcbiAgICAvLyBTdXBlci1hZG1pbiB3aXRoIGEgdmFsaWQgb3ZlcnJpZGUgdG9rZW46IHRoZWlyIGNyb3NzLWRvbWFpbiBvdmVycmlkZSBpcyB0cnVzdGVkXG4gICAgY29uc3QgcmVxID0gbWFrZVJlcSh7XG4gICAgICBob3N0OiBDQ00uZG9tYWluISxcbiAgICAgIHF1ZXJ5OiB7IHRlbmFudDogXCJnY2NtXCIgfSxcbiAgICAgIGF1dGhvcml6YXRpb246IHN1cGVyQWRtaW5CZWFyZXIoKSxcbiAgICB9KTtcbiAgICBjb25zdCByZXNvbHZlZCA9IHJlc29sdmVUZW5hbnRGcm9tTGlzdChyZXEsIFRFTkFOVFMpO1xuICAgIGFzc2VydC5lcXVhbChyZXNvbHZlZC5jb25maWRlbnQsIHRydWUsIFwic3VwZXItYWRtaW4gY3Jvc3MtdGVuYW50IG92ZXJyaWRlIG11c3QgYmUgY29uZmlkZW50XCIpO1xuICAgIGFzc2VydC5lcXVhbChyZXNvbHZlZD8udGVuYW50Py5pZCwgR0NDTS5pZCwgXCJzdXBlci1hZG1pbiByZXNvbHZlcyB0byB0aGUgb3ZlcnJpZGRlbiB0ZW5hbnRcIik7XG4gIH0pO1xufSk7XG5cbnRlc3QoXCJwcm9kdWN0aW9uOiBubyA/dGVuYW50PSBvbiBhIHJlYWwgZG9tYWluIFx1MjE5MiBjb25maWRlbnQgaG9zdCBtYXRjaCAobm8gYW1iaWd1aXR5KVwiLCAoKSA9PiB7XG4gIHdpdGhOb2RlRW52KFwicHJvZHVjdGlvblwiLCAoKSA9PiB7XG4gICAgY29uc3QgcmVxID0gbWFrZVJlcSh7IGhvc3Q6IEdDQ00uZG9tYWluISB9KTtcbiAgICBjb25zdCByZXNvbHZlZCA9IHJlc29sdmVUZW5hbnRGcm9tTGlzdChyZXEsIFRFTkFOVFMpO1xuICAgIGFzc2VydC5lcXVhbChyZXNvbHZlZC5jb25maWRlbnQsIHRydWUsIFwiaG9zdC1vbmx5IHJlc29sdXRpb24gaXMgYWx3YXlzIGNvbmZpZGVudFwiKTtcbiAgICBhc3NlcnQuZXF1YWwocmVzb2x2ZWQ/LnRlbmFudD8uaWQsIEdDQ00uaWQpO1xuICB9KTtcbn0pO1xuXG50ZXN0KFwicHJvZHVjdGlvbjogUmVmZXJlciBwYXRoIGJ5cGFzcyBpcyBibG9ja2VkIGJ5IG1pc21hdGNoIGd1YXJkIFx1MjAxNCBzdGlsbCBOT1QgY29uZmlkZW50XCIsICgpID0+IHtcbiAgd2l0aE5vZGVFbnYoXCJwcm9kdWN0aW9uXCIsICgpID0+IHtcbiAgICAvLyBBIGNyYWZ0ZWQgcmVxdWVzdDogaG9zdCA9IENDTSBkb21haW4gKHJlYWwgdGVuYW50IEEpLCA/dGVuYW50ID0gZ2NjbSAodGVuYW50IEIpLFxuICAgIC8vIEFORCBhIFJlZmVyZXIgd2hvc2UgZmlyc3Qgc2VnbWVudCBtYXRjaGVzIHRoZSA/dGVuYW50PSBzbHVnLlxuICAgIC8vIFdpdGhvdXQgdGhlIGVhcmx5IG1pc21hdGNoIGd1YXJkLCBTdGVwIDIgKFJlZmVyZXIpIHdvdWxkIHJldHVybiBjb25maWRlbnQ6IHRydWUuXG4gICAgLy8gV2l0aCB0aGUgZ3VhcmQsIHRoZSBtaXNtYXRjaCBpcyBkZXRlY3RlZCBmaXJzdCBhbmQgdGhlIHJlc3VsdCBtdXN0IGJlIGNvbmZpZGVudDogZmFsc2UuXG4gICAgY29uc3QgcmVxID0ge1xuICAgICAgaGVhZGVyczoge1xuICAgICAgICBob3N0OiBDQ00uZG9tYWluISxcbiAgICAgICAgcmVmZXJlcjogYGh0dHBzOi8vJHtDQ00uZG9tYWlufS9nY2NtL2FkbWlzc2lvbnNgLFxuICAgICAgfSxcbiAgICAgIHF1ZXJ5OiB7IHRlbmFudDogXCJnY2NtXCIgfSxcbiAgICB9IGFzIHVua25vd24gYXMgaW1wb3J0KFwiZXhwcmVzc1wiKS5SZXF1ZXN0O1xuICAgIGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVRlbmFudEZyb21MaXN0KHJlcSwgVEVOQU5UUyk7XG4gICAgYXNzZXJ0LmVxdWFsKFxuICAgICAgcmVzb2x2ZWQuY29uZmlkZW50LFxuICAgICAgZmFsc2UsXG4gICAgICBcImhvc3Qvc2x1ZyBtaXNtYXRjaCArIGNyYWZ0ZWQgUmVmZXJlciBtdXN0IHN0aWxsIGJlIGNvbmZpZGVudDogZmFsc2VcIixcbiAgICApO1xuICB9KTtcbn0pO1xuIiwgImltcG9ydCBjcnlwdG8gZnJvbSBcIm5vZGU6Y3J5cHRvXCI7XG5pbXBvcnQgYmNyeXB0IGZyb20gXCJiY3J5cHRqc1wiO1xuaW1wb3J0IHR5cGUgeyBSZXF1ZXN0LCBSZXNwb25zZSwgTmV4dEZ1bmN0aW9uIH0gZnJvbSBcImV4cHJlc3NcIjtcblxuLy8gXHUyNTAwXHUyNTAwIFNlY3JldCAvIGNyZWRlbnRpYWwgY2hlY2tzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gVE9LRU5fU0VDUkVUIHNpZ25zIGV2ZXJ5IGFkbWluIHNlc3Npb24gdG9rZW4gXHUyMDE0IGl0IE1VU1QgYmUgYSBzZWNyZXQgZW52IHZhci5cbi8vIElmIHRoZSBmYWxsYmFjayBpcyBpbiB1c2UsIGFueSBhdHRhY2tlciB3aG8gcmVhZHMgdGhlIHNvdXJjZSBjYW4gZm9yZ2UgdG9rZW5zLlxuY29uc3QgQURNSU5fVVNFUk5BTUUgPSBwcm9jZXNzLmVudltcIkFETUlOX1VTRVJOQU1FXCJdID8/IFwiYWRtaW5cIjtcbmNvbnN0IEFETUlOX1BBU1NXT1JEID0gcHJvY2Vzcy5lbnZbXCJBRE1JTl9QQVNTV09SRFwiXSA/PyBcImFkbWluMTIzXCI7XG5jb25zdCBBRE1JTl9OQU1FICAgICA9IHByb2Nlc3MuZW52W1wiQURNSU5fTkFNRVwiXSAgICAgPz8gXCJBZG1pc3Npb25zIE9mZmljZVwiO1xuXG5jb25zdCBUT0tFTl9TRUNSRVQgPSBwcm9jZXNzLmVudltcIkFETUlOX1RPS0VOX1NFQ1JFVFwiXSA/PyBcImNjbS1hZG1pbi1kZXYtc2VjcmV0LWNoYW5nZS1tZVwiO1xuXG5jb25zdCBfREVGQVVMVFNfSU5fVVNFOiBzdHJpbmdbXSA9IFtdO1xuaWYgKCFwcm9jZXNzLmVudltcIkFETUlOX1RPS0VOX1NFQ1JFVFwiXSkgX0RFRkFVTFRTX0lOX1VTRS5wdXNoKFwiQURNSU5fVE9LRU5fU0VDUkVUXCIpO1xuaWYgKCFwcm9jZXNzLmVudltcIkFETUlOX1BBU1NXT1JEXCJdKSAgICAgX0RFRkFVTFRTX0lOX1VTRS5wdXNoKFwiQURNSU5fUEFTU1dPUkRcIik7XG5pZiAoX0RFRkFVTFRTX0lOX1VTRS5sZW5ndGgpIHtcbiAgY29uc29sZS5lcnJvcihcbiAgICBcIlxcblx1MjZBMFx1RkUwRiAgU0VDVVJJVFkgV0FSTklORyBcdTI2QTBcdUZFMEZcXG5cIiArXG4gICAgYCAgIFRoZSBmb2xsb3dpbmcgc2VjcmV0cyBhcmUgdXNpbmcgaW5zZWN1cmUgZGVmYXVsdHM6ICR7X0RFRkFVTFRTX0lOX1VTRS5qb2luKFwiLCBcIil9XFxuYCArXG4gICAgXCIgICBBbnlvbmUgd2hvIHJlYWRzIHRoZSBzb3VyY2UgY29kZSBjYW4gbG9nIGluIG9yIGZvcmdlIHNlc3Npb24gdG9rZW5zLlxcblwiICtcbiAgICBcIiAgIEdvIHRvIFJlcGxpdCBTZWNyZXRzIGFuZCBzZXQgdGhlc2UgZW52IHZhcnMgTk9XIGJlZm9yZSBkZXBsb3lpbmcgdG8gcHJvZHVjdGlvbi5cXG5cIlxuICApO1xufVxuXG5jb25zdCBUT0tFTl9UVExfTVMgPSA3ICogMjQgKiA2MCAqIDYwICogMTAwMDsgLy8gNyBkYXlzXG5jb25zdCBCQ1JZUFRfUk9VTkRTID0gMTI7XG5jb25zdCBMRUdBQ1lfUFJFRklYID0gXCIkMlwiOyAvLyBiY3J5cHQgaGFzaGVzIHN0YXJ0IHdpdGggJDJhJCBvciAkMmIkXG5cbi8vIFx1MjUwMFx1MjUwMCBUeXBlcyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuZXhwb3J0IHR5cGUgQWRtaW5Vc2VyID0ge1xuICBpZDogc3RyaW5nO1xuICB1c2VybmFtZTogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIHJvbGU6IHN0cmluZztcbiAgaXNTdXBlckFkbWluOiBib29sZWFuO1xuICB0ZW5hbnRJZD86IHN0cmluZztcbiAgcm9sZXM6IEFycmF5PHsgbW9kdWxlOiBzdHJpbmc7IHBlcm1pc3Npb246IHN0cmluZyB9Pjtcbn07XG5cbmV4cG9ydCB0eXBlIEFkbWluVG9rZW5SZXN1bHQgPSB7XG4gIHRva2VuOiBzdHJpbmc7XG4gIGV4cGlyZXNBdDogRGF0ZTtcbiAgdXNlcjogQWRtaW5Vc2VyO1xufTtcblxuLy8gXHUyNTAwXHUyNTAwIENyeXB0byBoZWxwZXJzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5mdW5jdGlvbiBiYXNlNjR1cmwoaW5wdXQ6IEJ1ZmZlciB8IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBCdWZmZXIuZnJvbShpbnB1dClcbiAgICAudG9TdHJpbmcoXCJiYXNlNjRcIilcbiAgICAucmVwbGFjZSgvXFwrL2csIFwiLVwiKVxuICAgIC5yZXBsYWNlKC9cXC8vZywgXCJfXCIpXG4gICAgLnJlcGxhY2UoLz0rJC8sIFwiXCIpO1xufVxuXG5mdW5jdGlvbiBzaWduKHBheWxvYWQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBiYXNlNjR1cmwoXG4gICAgY3J5cHRvLmNyZWF0ZUhtYWMoXCJzaGEyNTZcIiwgVE9LRU5fU0VDUkVUKS51cGRhdGUocGF5bG9hZCkuZGlnZXN0KCksXG4gICk7XG59XG5cbmZ1bmN0aW9uIHRpbWluZ1NhZmVFcXVhbFN0cihhOiBzdHJpbmcsIGI6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBjb25zdCBidWZBID0gQnVmZmVyLmZyb20oYSk7XG4gIGNvbnN0IGJ1ZkIgPSBCdWZmZXIuZnJvbShiKTtcbiAgaWYgKGJ1ZkEubGVuZ3RoICE9PSBidWZCLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gY3J5cHRvLnRpbWluZ1NhZmVFcXVhbChidWZBLCBidWZCKTtcbn1cblxuY29uc3QgVVVJRF9SRSA9IC9eWzAtOWEtZl17OH0tWzAtOWEtZl17NH0tWzAtOWEtZl17NH0tWzAtOWEtZl17NH0tWzAtOWEtZl17MTJ9JC9pO1xuXG4vKipcbiAqIFJldHVybnMgYHVzZXIuaWRgIG9ubHkgd2hlbiBpdCBpcyBhIHJlYWwgcm93IGluIGBhZG1pbl91c2Vyc2AgKGEgVVVJRCksIG9yXG4gKiBgbnVsbGAgb3RoZXJ3aXNlLiBTZXZlcmFsIHNlc3Npb24gdHlwZXMgY2FycnkgYSBzeW50aGV0aWMsIG5vbi1VVUlEIGlkIHRoYXRcbiAqIGhhcyBubyBtYXRjaGluZyBgYWRtaW5fdXNlcnNgIHJvdyBcdTIwMTQgdGhlIGVudi12YXIgc3VwZXItYWRtaW4gKFwiZW52LWFkbWluXCIpXG4gKiBhbmQgU2FhUy1hZG1pbiB0ZW5hbnQgaW1wZXJzb25hdGlvbiBzZXNzaW9ucyAoXCJzYWFzLWltcGVyc29uYXRlLTx0ZW5hbnRJZD5cIilcbiAqIGFyZSB0aGUgdHdvIGtub3duIGNhc2VzIHRvZGF5LCBhbmQgbW9yZSBtYXkgYmUgYWRkZWQgbGF0ZXIuXG4gKlxuICogVXNlIHRoaXMgaW5zdGVhZCBvZiBhZC1ob2MgYHVzZXIuaWQgIT09IFwiZW52LWFkbWluXCJgIGNoZWNrcyB3aGVuZXZlciB0aGUgaWRcbiAqIGlzIHdyaXR0ZW4gaW50byBhIG1ha2VyL2NoZWNrZXIgY29sdW1uIHdpdGggYSBmb3JlaWduIGtleSB0byBhZG1pbl91c2Vyc1xuICogKHByZXBhcmVkQnksIGFwcHJvdmVkQnksIGNvbGxlY3RlZEJ5LCBtYXJrc0VudGVyZWRCeSwgZXRjLikgXHUyMDE0IGluc2VydGluZyBhXG4gKiBzeW50aGV0aWMgaWQgdGhlcmUgdmlvbGF0ZXMgdGhlIEZLIGNvbnN0cmFpbnQgYW5kIGZhaWxzIHRoZSB3aG9sZSByZXF1ZXN0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhbEFkbWluVXNlcklkKHVzZXI6IFBpY2s8QWRtaW5Vc2VyLCBcImlkXCI+IHwgbnVsbCB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IG51bGwge1xuICBjb25zdCBpZCA9IHVzZXI/LmlkO1xuICByZXR1cm4gaWQgJiYgVVVJRF9SRS50ZXN0KGlkKSA/IGlkIDogbnVsbDtcbn1cblxuLyoqIEhhc2ggYSBwYXNzd29yZCB3aXRoIGJjcnlwdCAodXNlIGZvciBuZXcgcGFzc3dvcmRzIGFuZCByZS1oYXNoaW5nKS4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYXNoUGFzc3dvcmQocGFzc3dvcmQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gIHJldHVybiBiY3J5cHQuaGFzaChwYXNzd29yZCwgQkNSWVBUX1JPVU5EUyk7XG59XG5cbi8qKlxuICogVmVyaWZ5IGEgcGFzc3dvcmQgYWdhaW5zdCBhIHN0b3JlZCBoYXNoLlxuICogU3VwcG9ydHMgYm90aCBiY3J5cHQgaGFzaGVzIChuZXcpIGFuZCBsZWdhY3kgSE1BQy1TSEEyNTYgaGFzaGVzLlxuICogUmV0dXJucyB7IHZhbGlkLCBuZWVkc1JlaGFzaCB9IFx1MjAxNCBpZiBuZWVkc1JlaGFzaCBpcyB0cnVlLCBjYWxsZXIgc2hvdWxkXG4gKiByZS1oYXNoIHRoZSBwbGFpbnRleHQgcGFzc3dvcmQgd2l0aCBiY3J5cHQgYW5kIHNhdmUgaXQgdG8gdGhlIERCLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdmVyaWZ5UGFzc3dvcmQoXG4gIHBhc3N3b3JkOiBzdHJpbmcsXG4gIHN0b3JlZEhhc2g6IHN0cmluZyxcbik6IFByb21pc2U8eyB2YWxpZDogYm9vbGVhbjsgbmVlZHNSZWhhc2g6IGJvb2xlYW4gfT4ge1xuICBpZiAoc3RvcmVkSGFzaC5zdGFydHNXaXRoKExFR0FDWV9QUkVGSVgpKSB7XG4gICAgLy8gTW9kZXJuIGJjcnlwdCBoYXNoXG4gICAgY29uc3QgdmFsaWQgPSBhd2FpdCBiY3J5cHQuY29tcGFyZShwYXNzd29yZCwgc3RvcmVkSGFzaCk7XG4gICAgcmV0dXJuIHsgdmFsaWQsIG5lZWRzUmVoYXNoOiBmYWxzZSB9O1xuICB9XG4gIC8vIExlZ2FjeSBITUFDLVNIQTI1NiBoYXNoIFx1MjAxNCB2ZXJpZnkgYW5kIGZsYWcgZm9yIHJlLWhhc2hcbiAgY29uc3QgbGVnYWN5SGFzaCA9IGNyeXB0b1xuICAgIC5jcmVhdGVIbWFjKFwic2hhMjU2XCIsIFRPS0VOX1NFQ1JFVClcbiAgICAudXBkYXRlKHBhc3N3b3JkKVxuICAgIC5kaWdlc3QoXCJoZXhcIik7XG4gIGNvbnN0IHZhbGlkID0gdGltaW5nU2FmZUVxdWFsU3RyKGxlZ2FjeUhhc2gsIHN0b3JlZEhhc2gpO1xuICByZXR1cm4geyB2YWxpZCwgbmVlZHNSZWhhc2g6IHZhbGlkIH07IC8vIG9ubHkgcmUtaGFzaCBpZiBwYXNzd29yZCB3YXMgYWN0dWFsbHkgY29ycmVjdFxufVxuXG4vKiogU3luY2hyb25vdXMgYmNyeXB0IGhhc2ggXHUyMDE0IG9ubHkgZm9yIHVzZSBpbiBzdGFydHVwIG1pZ3JhdGlvbiBzY3JpcHRzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhhc2hQYXNzd29yZFN5bmMocGFzc3dvcmQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBiY3J5cHQuaGFzaFN5bmMocGFzc3dvcmQsIEJDUllQVF9ST1VORFMpO1xufVxuXG4vLyBcdTI1MDBcdTI1MDAgRW52LXZhciBjcmVkZW50aWFsIGNoZWNrIChsZWdhY3kgc3VwZXItYWRtaW4pIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5leHBvcnQgZnVuY3Rpb24gdmVyaWZ5RW52Q3JlZGVudGlhbHMoXG4gIHVzZXJuYW1lOiBzdHJpbmcsXG4gIHBhc3N3b3JkOiBzdHJpbmcsXG4pOiBBZG1pblVzZXIgfCBudWxsIHtcbiAgY29uc3QgdXNlck9rID0gdGltaW5nU2FmZUVxdWFsU3RyKHVzZXJuYW1lLCBBRE1JTl9VU0VSTkFNRSk7XG4gIGNvbnN0IHBhc3NPayA9IHRpbWluZ1NhZmVFcXVhbFN0cihwYXNzd29yZCwgQURNSU5fUEFTU1dPUkQpO1xuICBpZiAodXNlck9rICYmIHBhc3NPaykge1xuICAgIHJldHVybiB7XG4gICAgICBpZDogXCJlbnYtYWRtaW5cIixcbiAgICAgIHVzZXJuYW1lOiBBRE1JTl9VU0VSTkFNRSxcbiAgICAgIG5hbWU6IEFETUlOX05BTUUsXG4gICAgICByb2xlOiBcImFkbWluXCIsXG4gICAgICBpc1N1cGVyQWRtaW46IHRydWUsXG4gICAgICByb2xlczogW10sXG4gICAgfTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuLy8gXHUyNTAwXHUyNTAwIFRva2VuIGlzc3VlIC8gdmVyaWZ5IFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5leHBvcnQgZnVuY3Rpb24gaXNzdWVUb2tlbih1c2VyOiBBZG1pblVzZXIpOiBBZG1pblRva2VuUmVzdWx0IHtcbiAgY29uc3QgZXhwaXJlc0F0ID0gbmV3IERhdGUoRGF0ZS5ub3coKSArIFRPS0VOX1RUTF9NUyk7XG4gIGNvbnN0IGJvZHkgPSB7XG4gICAgc3ViOiAgICAgICAgICB1c2VyLnVzZXJuYW1lLFxuICAgIHVpZDogICAgICAgICAgdXNlci5pZCxcbiAgICBuYW1lOiAgICAgICAgIHVzZXIubmFtZSxcbiAgICByb2xlOiAgICAgICAgIHVzZXIucm9sZSxcbiAgICBpc1N1cGVyQWRtaW46IHVzZXIuaXNTdXBlckFkbWluLFxuICAgIHRlbmFudElkOiAgICAgdXNlci50ZW5hbnRJZCxcbiAgICByb2xlczogICAgICAgIHVzZXIucm9sZXMsXG4gICAgZXhwOiAgICAgICAgICBleHBpcmVzQXQuZ2V0VGltZSgpLFxuICB9O1xuICBjb25zdCBwYXlsb2FkICAgPSBiYXNlNjR1cmwoSlNPTi5zdHJpbmdpZnkoYm9keSkpO1xuICBjb25zdCBzaWduYXR1cmUgPSBzaWduKHBheWxvYWQpO1xuICByZXR1cm4geyB0b2tlbjogYCR7cGF5bG9hZH0uJHtzaWduYXR1cmV9YCwgZXhwaXJlc0F0LCB1c2VyIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2ZXJpZnlUb2tlbih0b2tlbjogc3RyaW5nKTogQWRtaW5Vc2VyIHwgbnVsbCB7XG4gIGNvbnN0IHBhcnRzID0gdG9rZW4uc3BsaXQoXCIuXCIpO1xuICBpZiAocGFydHMubGVuZ3RoICE9PSAyKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgW3BheWxvYWQsIHNpZ25hdHVyZV0gPSBwYXJ0cztcbiAgaWYgKCFwYXlsb2FkIHx8ICFzaWduYXR1cmUpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IGV4cGVjdGVkID0gc2lnbihwYXlsb2FkKTtcbiAgaWYgKCF0aW1pbmdTYWZlRXF1YWxTdHIoc2lnbmF0dXJlLCBleHBlY3RlZCkpIHJldHVybiBudWxsO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UoXG4gICAgICBCdWZmZXIuZnJvbShwYXlsb2FkLCBcImJhc2U2NFwiKS50b1N0cmluZyhcInV0ZjhcIiksXG4gICAgKSBhcyB7XG4gICAgICBzdWI/OiBzdHJpbmc7IHVpZD86IHN0cmluZzsgbmFtZT86IHN0cmluZzsgcm9sZT86IHN0cmluZztcbiAgICAgIGlzU3VwZXJBZG1pbj86IGJvb2xlYW47IHRlbmFudElkPzogc3RyaW5nO1xuICAgICAgcm9sZXM/OiBBcnJheTx7IG1vZHVsZTogc3RyaW5nOyBwZXJtaXNzaW9uOiBzdHJpbmcgfT47XG4gICAgICBleHA/OiBudW1iZXI7XG4gICAgfTtcbiAgICBpZiAoIWJvZHkuc3ViIHx8ICFib2R5LmV4cCB8fCB0eXBlb2YgYm9keS5leHAgIT09IFwibnVtYmVyXCIpIHJldHVybiBudWxsO1xuICAgIGlmIChib2R5LmV4cCA8PSBEYXRlLm5vdygpKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6ICAgICAgICAgICBib2R5LnVpZCA/PyBcImVudi1hZG1pblwiLFxuICAgICAgdXNlcm5hbWU6ICAgICBib2R5LnN1YixcbiAgICAgIG5hbWU6ICAgICAgICAgYm9keS5uYW1lID8/IEFETUlOX05BTUUsXG4gICAgICByb2xlOiAgICAgICAgIGJvZHkucm9sZSA/PyBcImFkbWluXCIsXG4gICAgICBpc1N1cGVyQWRtaW46IGJvZHkuaXNTdXBlckFkbWluID8/IGZhbHNlLFxuICAgICAgdGVuYW50SWQ6ICAgICBib2R5LnRlbmFudElkLFxuICAgICAgcm9sZXM6ICAgICAgICBib2R5LnJvbGVzID8/IFtdLFxuICAgIH07XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbi8vIFx1MjUwMFx1MjUwMCBFeHByZXNzIG1pZGRsZXdhcmUgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmRlY2xhcmUgZ2xvYmFsIHtcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1uYW1lc3BhY2VcbiAgbmFtZXNwYWNlIEV4cHJlc3Mge1xuICAgIGludGVyZmFjZSBSZXF1ZXN0IHtcbiAgICAgIGFkbWluVXNlcj86IEFkbWluVXNlcjtcbiAgICB9XG4gIH1cbn1cblxuLyoqIFJlcXVpcmVzIGFueSB2YWxpZCBhZG1pbiB0b2tlbi4gQXR0YWNoZXMgdXNlciB0byByZXEuYWRtaW5Vc2VyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlcXVpcmVBZG1pbihcbiAgcmVxOiBSZXF1ZXN0LFxuICByZXM6IFJlc3BvbnNlLFxuICBuZXh0OiBOZXh0RnVuY3Rpb24sXG4pOiB2b2lkIHtcbiAgY29uc3QgaGVhZGVyID0gcmVxLmhlYWRlcnMuYXV0aG9yaXphdGlvbiA/PyBcIlwiO1xuICBjb25zdCBtYXRjaCA9IC9eQmVhcmVyXFxzKyguKykkL2kuZXhlYyhoZWFkZXIpO1xuICAvLyBBbHNvIGFjY2VwdCA/dG9rZW49IHF1ZXJ5IHBhcmFtIHNvIGJyb3dzZXItbmF2aWdhdGVkIGRvd25sb2FkIGxpbmtzIHdvcmtcbiAgY29uc3QgcmF3VG9rZW4gPSBtYXRjaD8uWzFdPy50cmltKCkgPz8gKHJlcS5xdWVyeVtcInRva2VuXCJdIGFzIHN0cmluZyB8IHVuZGVmaW5lZCk7XG4gIGlmICghcmF3VG9rZW4pIHtcbiAgICByZXMuc3RhdHVzKDQwMSkuanNvbih7IGVycm9yOiBcIkF1dGhlbnRpY2F0aW9uIHJlcXVpcmVkXCIgfSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHVzZXIgPSB2ZXJpZnlUb2tlbihyYXdUb2tlbik7XG4gIGlmICghdXNlcikge1xuICAgIHJlcy5zdGF0dXMoNDAxKS5qc29uKHsgZXJyb3I6IFwiSW52YWxpZCBvciBleHBpcmVkIHNlc3Npb25cIiB9KTtcbiAgICByZXR1cm47XG4gIH1cbiAgcmVxLmFkbWluVXNlciA9IHVzZXI7XG4gIG5leHQoKTtcbn1cblxuLyoqIFJlcXVpcmVzIHN1cGVyLWFkbWluLiBVc2UgZm9yIHVzZXItbWFuYWdlbWVudCByb3V0ZXMuICovXG5leHBvcnQgZnVuY3Rpb24gcmVxdWlyZVN1cGVyQWRtaW4oXG4gIHJlcTogUmVxdWVzdCxcbiAgcmVzOiBSZXNwb25zZSxcbiAgbmV4dDogTmV4dEZ1bmN0aW9uLFxuKTogdm9pZCB7XG4gIGNvbnN0IGhlYWRlciA9IHJlcS5oZWFkZXJzLmF1dGhvcml6YXRpb24gPz8gXCJcIjtcbiAgY29uc3QgbWF0Y2ggPSAvXkJlYXJlclxccysoLispJC9pLmV4ZWMoaGVhZGVyKTtcbiAgaWYgKCFtYXRjaCB8fCAhbWF0Y2hbMV0pIHtcbiAgICByZXMuc3RhdHVzKDQwMSkuanNvbih7IGVycm9yOiBcIkF1dGhlbnRpY2F0aW9uIHJlcXVpcmVkXCIgfSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHVzZXIgPSB2ZXJpZnlUb2tlbihtYXRjaFsxXS50cmltKCkpO1xuICBpZiAoIXVzZXIpIHtcbiAgICByZXMuc3RhdHVzKDQwMSkuanNvbih7IGVycm9yOiBcIkludmFsaWQgb3IgZXhwaXJlZCBzZXNzaW9uXCIgfSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghdXNlci5pc1N1cGVyQWRtaW4pIHtcbiAgICByZXMuc3RhdHVzKDQwMykuanNvbih7IGVycm9yOiBcIlN1cGVyLWFkbWluIGFjY2VzcyByZXF1aXJlZFwiIH0pO1xuICAgIHJldHVybjtcbiAgfVxuICByZXEuYWRtaW5Vc2VyID0gdXNlcjtcbiAgbmV4dCgpO1xufVxuXG5leHBvcnQgY29uc3QgUEVSTUlTU0lPTl9ISUVSQVJDSFk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7XG4gIHZpZXc6IDEsIGRyYWZ0OiAyLCBwb3N0OiAzLCBlZGl0OiA0LCBkZWxldGU6IDUsXG59O1xuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgdXNlciBoYXMgYXQgbGVhc3QgdGhlIGdpdmVuIHBlcm1pc3Npb24gbGV2ZWwgaW4gdGhlXG4gKiBnaXZlbiBtb2R1bGUgKG9yIGlzIGEgc3VwZXItYWRtaW4pLiBVc2UgdGhpcyBpbnNpZGUgcm91dGUgaGFuZGxlcnMgdGhhdCBuZWVkXG4gKiB0byBjb25kaXRpb25hbGx5IGJ5cGFzcyBwb3N0ZWQtcmVjb3JkIGxvY2tzIGZvciBlZGl0b3JzL2RlbGV0ZXJzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaGFzTW9kdWxlUm9sZShcbiAgdXNlcjogQWRtaW5Vc2VyLFxuICBtb2R1bGU6IHN0cmluZyxcbiAgcGVybWlzc2lvbjogXCJ2aWV3XCIgfCBcImRyYWZ0XCIgfCBcInBvc3RcIiB8IFwiZWRpdFwiIHwgXCJkZWxldGVcIixcbik6IGJvb2xlYW4ge1xuICBpZiAodXNlci5pc1N1cGVyQWRtaW4pIHJldHVybiB0cnVlO1xuICBjb25zdCByZXF1aXJlZCA9IFBFUk1JU1NJT05fSElFUkFSQ0hZW3Blcm1pc3Npb25dID8/IDE7XG4gIHJldHVybiB1c2VyLnJvbGVzLnNvbWUoXG4gICAgKHIpID0+XG4gICAgICAoci5tb2R1bGUgPT09IG1vZHVsZSB8fCByLm1vZHVsZSA9PT0gXCIqXCIpICYmXG4gICAgICAoUEVSTUlTU0lPTl9ISUVSQVJDSFlbci5wZXJtaXNzaW9uXSA/PyAwKSA+PSByZXF1aXJlZCxcbiAgKTtcbn1cblxuLyoqXG4gKiBNaWRkbGV3YXJlIGZhY3RvcnkgXHUyMDE0IHJlcXVpcmVzIHRoZSBjdXJyZW50IHVzZXIgdG8gaGF2ZSB0aGUgZ2l2ZW4gcGVybWlzc2lvblxuICogaW4gdGhlIGdpdmVuIG1vZHVsZSAob3IgYmUgYSBzdXBlci1hZG1pbiwgd2hvIGJ5cGFzc2VzIGFsbCBjaGVja3MpLlxuICpcbiAqIElmIHJlcS5hZG1pblVzZXIgaXMgYWxyZWFkeSBwb3B1bGF0ZWQgKGUuZy4gYnkgYSBEQi1yZWZyZXNoIG1pZGRsZXdhcmUgdGhhdFxuICogcmUtaHlkcmF0ZWQgaXNTdXBlckFkbWluIGZyb20gdGhlIGxpdmUgZGF0YWJhc2Ugcm93KSwgdGhhdCB2YWx1ZSBpcyB0cnVzdGVkXG4gKiBkaXJlY3RseSBpbnN0ZWFkIG9mIHJlLXZlcmlmeWluZyB0aGUgdG9rZW4uICBUaGlzIGxldHMgYSBwcm9tb3Rpb24gdGFrZSBlZmZlY3RcbiAqIGltbWVkaWF0ZWx5IHdpdGhvdXQgZm9yY2luZyBhIHJlLWxvZ2luLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVxdWlyZVJvbGUobW9kdWxlOiBzdHJpbmcsIHBlcm1pc3Npb246IFwidmlld1wiIHwgXCJkcmFmdFwiIHwgXCJwb3N0XCIgfCBcImVkaXRcIiB8IFwiZGVsZXRlXCIpIHtcbiAgcmV0dXJuIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UsIG5leHQ6IE5leHRGdW5jdGlvbik6IHZvaWQgPT4ge1xuICAgIC8vIFByZWZlciBhIHByZS1oeWRyYXRlZCB1c2VyIChtYXkgaGF2ZSByZWZyZXNoZWQgaXNTdXBlckFkbWluIGZyb20gREIpXG4gICAgbGV0IHVzZXIgPSByZXEuYWRtaW5Vc2VyO1xuICAgIGlmICghdXNlcikge1xuICAgICAgY29uc3QgaGVhZGVyID0gcmVxLmhlYWRlcnMuYXV0aG9yaXphdGlvbiA/PyBcIlwiO1xuICAgICAgY29uc3QgbWF0Y2ggPSAvXkJlYXJlclxccysoLispJC9pLmV4ZWMoaGVhZGVyKTtcbiAgICAgIGlmICghbWF0Y2ggfHwgIW1hdGNoWzFdKSB7XG4gICAgICAgIHJlcy5zdGF0dXMoNDAxKS5qc29uKHsgZXJyb3I6IFwiQXV0aGVudGljYXRpb24gcmVxdWlyZWRcIiB9KTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdmVyaWZpZWQgPSB2ZXJpZnlUb2tlbihtYXRjaFsxXS50cmltKCkpO1xuICAgICAgaWYgKCF2ZXJpZmllZCkge1xuICAgICAgICByZXMuc3RhdHVzKDQwMSkuanNvbih7IGVycm9yOiBcIkludmFsaWQgb3IgZXhwaXJlZCBzZXNzaW9uXCIgfSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHJlcS5hZG1pblVzZXIgPSB2ZXJpZmllZDtcbiAgICAgIHVzZXIgPSB2ZXJpZmllZDtcbiAgICB9XG5cbiAgICBpZiAodXNlci5pc1N1cGVyQWRtaW4pIHsgbmV4dCgpOyByZXR1cm47IH1cblxuICAgIC8vIFRlbmFudCBhZG1pbiB1c2VycyAoY3JlYXRlZCB2aWEgU2FhUyBBZG1pbiwgcm9sZSAhPT0gXCJzdGFmZlwiKSBhY3QgYXNcbiAgICAvLyBkaXJlY3RvcnMgZm9yIGFsbCBtb2R1bGVzIHdpdGhpbiB0aGVpciBvd24gdGVuYW50LiBTdGFmZiB1c2VycyBoYXZlXG4gICAgLy8gcm9sZSA9PT0gXCJzdGFmZlwiIGFuZCBuZWVkIGV4cGxpY2l0IG1vZHVsZSByb2xlcyBpbiBhZG1pbl91c2VyX3JvbGVzLlxuICAgIGlmICh1c2VyLnRlbmFudElkICYmIHVzZXIucm9sZSAhPT0gXCJzdGFmZlwiKSB7IG5leHQoKTsgcmV0dXJuOyB9XG5cbiAgICBjb25zdCByZXF1aXJlZExldmVsID0gUEVSTUlTU0lPTl9ISUVSQVJDSFlbcGVybWlzc2lvbl0gPz8gMTtcblxuICAgIGNvbnN0IGhhc1JvbGUgPSB1c2VyLnJvbGVzLnNvbWUoXG4gICAgICAocikgPT5cbiAgICAgICAgKHIubW9kdWxlID09PSBtb2R1bGUgfHwgci5tb2R1bGUgPT09IFwiKlwiKSAmJlxuICAgICAgICAoUEVSTUlTU0lPTl9ISUVSQVJDSFlbci5wZXJtaXNzaW9uXSA/PyAwKSA+PSByZXF1aXJlZExldmVsLFxuICAgICk7XG5cbiAgICBpZiAoIWhhc1JvbGUpIHtcbiAgICAgIHJlcy5zdGF0dXMoNDAzKS5qc29uKHtcbiAgICAgICAgZXJyb3I6IGBSZXF1aXJlcyAke3Blcm1pc3Npb259IHBlcm1pc3Npb24gaW4gbW9kdWxlIFwiJHttb2R1bGV9XCJgLFxuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIG5leHQoKTtcbiAgfTtcbn1cblxuLyoqXG4gKiBNaWRkbGV3YXJlIGZhY3RvcnkgXHUyMDE0IGxpa2UgYHJlcXVpcmVSb2xlYCwgYnV0IFdJVEhPVVQgdGhlIHRlbmFudC1kaXJlY3RvclxuICogYXV0by1ieXBhc3MgKGB1c2VyLnRlbmFudElkICYmIHVzZXIucm9sZSAhPT0gXCJzdGFmZlwiYCkuXG4gKlxuICogVXNlIHRoaXMgZm9yIHJvdXRlcyB0aGF0IGFyZSBub3Qgc2NvcGVkIHRvIHRoZSBjYWxsZXIncyBvd24gdGVuYW50IFx1MjAxNCBtb3N0XG4gKiBpbXBvcnRhbnRseSBnbG9iYWwgYWRtaW4tdXNlciBtYW5hZ2VtZW50IChgL2FkbWluL2FkbWluLXVzZXJzYCksIHdoaWNoXG4gKiByZWFkcy93cml0ZXMgdGhlIHBsYXRmb3JtLXdpZGUgYGFkbWluX3VzZXJzYCB0YWJsZSBhY3Jvc3MgYWxsIHRlbmFudHMuXG4gKiBUaGUgdGVuYW50LWRpcmVjdG9yIHNob3J0Y3V0IGluIGByZXF1aXJlUm9sZWAgaXMgbWVhbnQgdG8gZ2l2ZSBhIHRlbmFudCdzXG4gKiBvd24gZGlyZWN0b3IgZnVsbCBhY2Nlc3MgdG8gbW9kdWxlcyAqd2l0aGluIHRoZWlyIHRlbmFudCogKGZlZXMsIHBheXJvbGwsXG4gKiBldGMuKSBcdTIwMTQgaXQgbXVzdCBuZXZlciBiZSB0cmVhdGVkIGFzIGVxdWl2YWxlbnQgdG8gYW4gZXhwbGljaXRcbiAqIGBhZG1pbl91c2VyX3JvbGVzYCBncmFudCBvbiBhIGdsb2JhbCwgY3Jvc3MtdGVuYW50IHJvdXRlLCBvciBhbnkgdGVuYW50XG4gKiBkaXJlY3RvciBhY2NvdW50IGNvdWxkIG1hbmFnZSBldmVyeSB0ZW5hbnQncyBhZG1pbiB1c2Vycy5cbiAqXG4gKiBPbmx5IGFuIGV4cGxpY2l0IGBhZG1pbl91c2VyX3JvbGVzYCBncmFudCAoY2hlY2tlZCB2aWEgYGhhc01vZHVsZVJvbGVgLFxuICogd2hpY2ggc3RpbGwgbGV0cyB0cnVlIHN1cGVyLWFkbWlucyBieXBhc3MpIGlzIGFjY2VwdGVkIGhlcmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXF1aXJlR2xvYmFsUm9sZShtb2R1bGU6IHN0cmluZywgcGVybWlzc2lvbjogXCJ2aWV3XCIgfCBcImRyYWZ0XCIgfCBcInBvc3RcIiB8IFwiZWRpdFwiIHwgXCJkZWxldGVcIikge1xuICByZXR1cm4gKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKTogdm9pZCA9PiB7XG4gICAgbGV0IHVzZXIgPSByZXEuYWRtaW5Vc2VyO1xuICAgIGlmICghdXNlcikge1xuICAgICAgY29uc3QgaGVhZGVyID0gcmVxLmhlYWRlcnMuYXV0aG9yaXphdGlvbiA/PyBcIlwiO1xuICAgICAgY29uc3QgbWF0Y2ggPSAvXkJlYXJlclxccysoLispJC9pLmV4ZWMoaGVhZGVyKTtcbiAgICAgIGlmICghbWF0Y2ggfHwgIW1hdGNoWzFdKSB7XG4gICAgICAgIHJlcy5zdGF0dXMoNDAxKS5qc29uKHsgZXJyb3I6IFwiQXV0aGVudGljYXRpb24gcmVxdWlyZWRcIiB9KTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdmVyaWZpZWQgPSB2ZXJpZnlUb2tlbihtYXRjaFsxXS50cmltKCkpO1xuICAgICAgaWYgKCF2ZXJpZmllZCkge1xuICAgICAgICByZXMuc3RhdHVzKDQwMSkuanNvbih7IGVycm9yOiBcIkludmFsaWQgb3IgZXhwaXJlZCBzZXNzaW9uXCIgfSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHJlcS5hZG1pblVzZXIgPSB2ZXJpZmllZDtcbiAgICAgIHVzZXIgPSB2ZXJpZmllZDtcbiAgICB9XG5cbiAgICBpZiAoIWhhc01vZHVsZVJvbGUodXNlciwgbW9kdWxlLCBwZXJtaXNzaW9uKSkge1xuICAgICAgcmVzLnN0YXR1cyg0MDMpLmpzb24oe1xuICAgICAgICBlcnJvcjogYFJlcXVpcmVzICR7cGVybWlzc2lvbn0gcGVybWlzc2lvbiBpbiBtb2R1bGUgXCIke21vZHVsZX1cImAsXG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbmV4dCgpO1xuICB9O1xufVxuIiwgImltcG9ydCB0eXBlIHsgUmVxdWVzdCB9IGZyb20gXCJleHByZXNzXCI7XG5pbXBvcnQgeyB2ZXJpZnlUb2tlbiB9IGZyb20gXCIuL2FkbWluLWF1dGguanNcIjtcblxuLy8gXHUyNTAwXHUyNTAwIFB1cmUgdGVuYW50LXJlc29sdXRpb24gbG9naWMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBUaGlzIG1vZHVsZSBob2xkcyB0aGUgaG9zdC9vdmVycmlkZSByZXNvbHV0aW9uIGFsZ29yaXRobSB3aXRoIE5PIGRhdGFiYXNlXG4vLyBkZXBlbmRlbmN5LCBzbyBpdCBjYW4gYmUgdW5pdC10ZXN0ZWQgaW4gaXNvbGF0aW9uLiBUaGUgREItYmFja2VkIGxvYWRpbmcgYW5kXG4vLyBjYWNoaW5nIGxpdmUgaW4gdGVuYW50LnRzLCB3aGljaCBkZWxlZ2F0ZXMgdGhlIGFjdHVhbCBkZWNpc2lvbi1tYWtpbmcgaGVyZS5cblxuZXhwb3J0IHR5cGUgVGVuYW50SW5mbyA9IHtcbiAgaWQ6IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xuICBzbHVnOiBzdHJpbmc7XG4gIGRvbWFpbjogc3RyaW5nIHwgbnVsbDtcbiAgc2l0ZVRoZW1lOiBzdHJpbmc7XG4gIGlzQWN0aXZlOiBib29sZWFuO1xufTtcblxuLyoqXG4gKiBSZXNvbHV0aW9uIHJlc3VsdC4gYGNvbmZpZGVudGAgaXMgdHJ1ZSB3aGVuIHRoZSB0ZW5hbnQgd2FzIHJlc29sdmVkIHZpYSBhblxuICogdW5hbWJpZ3VvdXMsIHNlbGYtY29uc2lzdGVudCBzaWduYWwuIEl0IGlzIGZhbHNlIHdoZW46XG4gKiAgIGEpIFRoZSBmYWxsYmFjayBERUZBVUxUX1NMVUcgb3IgZmlyc3QtYWN0aXZlLXRlbmFudCBwYXRocyB3ZXJlIHVzZWQuXG4gKiAgIGIpIEEgYD90ZW5hbnQ9YCBzbHVnIGlzIHByZXNlbnQgaW4gcHJvZHVjdGlvbiB0aGF0IGRpc2FncmVlcyB3aXRoIHRoZVxuICogICAgICBob3N0LW1hdGNoZWQgdGVuYW50IChhbmQgdGhlIHJlcXVlc3RlciBpcyBub3QgYSBzdXBlci1hZG1pbikuXG4gKlxuICogQ29uZmxpY3Rpbmcgc2lnbmFscyBhcmUgZGV0ZWN0ZWQgZWFybHkgKGJlZm9yZSBBTlkgcmVzb2x1dGlvbiBicmFuY2ggcnVucylcbiAqIHNvIHRoYXQgUmVmZXJlciwgZ2F0ZXdheSBoZWFkZXIsIG9yIG90aGVyIHBhdGhzIGNhbm5vdCBzaWxlbnRseSBvdmVycmlkZSBhXG4gKiBkZXRlY3RlZCBtaXNtYXRjaCBhbmQgcHJvZHVjZSBhIHNwdXJpb3VzbHkgY29uZmlkZW50IHJlc3VsdC5cbiAqXG4gKiBXcml0ZSBvcGVyYXRpb25zIE1VU1QgcmVqZWN0IHJlcXVlc3RzIChIVFRQIDQwMCkgd2hlbiBgY29uZmlkZW50YCBpcyBmYWxzZS5cbiAqIFJlYWQgb3BlcmF0aW9ucyBtYXkgcHJvY2VlZCB1c2luZyB0aGUgcmVzb2x2ZWQgdGVuYW50IGV2ZW4gd2hlbiBub3QgY29uZmlkZW50LlxuICovXG5leHBvcnQgdHlwZSBUZW5hbnRSZXNvbHV0aW9uID0ge1xuICB0ZW5hbnQ6IFRlbmFudEluZm8gfCBudWxsO1xuICBjb25maWRlbnQ6IGJvb2xlYW47XG59O1xuXG5leHBvcnQgY29uc3QgREVGQVVMVF9TTFVHID0gKHByb2Nlc3MuZW52W1wiREVGQVVMVF9URU5BTlRfU0xVR1wiXSA/PyBcImNjbVwiKS50b0xvd2VyQ2FzZSgpO1xuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplSG9zdChob3N0OiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gaG9zdC5zcGxpdChcIjpcIilbMF0hLnRyaW0oKS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhvc3RGcm9tUmVxKHJlcTogUmVxdWVzdCk6IHN0cmluZyB7XG4gIGNvbnN0IHhmID0gKHJlcS5oZWFkZXJzW1wieC1mb3J3YXJkZWQtaG9zdFwiXSBhcyBzdHJpbmcgfCB1bmRlZmluZWQpPy5zcGxpdChcIixcIilbMF0/LnRyaW0oKTtcbiAgcmV0dXJuIG5vcm1hbGl6ZUhvc3QoeGYgfHwgcmVxLmhlYWRlcnMuaG9zdCB8fCBcIlwiKTtcbn1cblxuLyoqXG4gKiBXaGV0aGVyIHRoZSByZXF1ZXN0IGNhcnJpZXMgYSB2YWxpZCBzdXBlci1hZG1pbiB0b2tlbi4gU3VwZXItYWRtaW5zIG1heSB1c2VcbiAqIHRoZSA/dGVuYW50PSBvdmVycmlkZSBhbnl3aGVyZSAoaW5jbHVkaW5nIG9uIGEgcmVhbCBwcm9kdWN0aW9uIGRvbWFpbikgc28gdGhleVxuICogY2FuIHByZXZpZXcgYSB0ZW5hbnQncyBzaXRlLiBBY2NlcHRzIGJvdGggdGhlIEF1dGhvcml6YXRpb246IEJlYXJlciBoZWFkZXJcbiAqIGFuZCBhID90b2tlbj0gcXVlcnkgcGFyYW0gKGZvciBicm93c2VyLW5hdmlnYXRlZCBsaW5rcykuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1N1cGVyQWRtaW5SZXF1ZXN0KHJlcTogUmVxdWVzdCk6IGJvb2xlYW4ge1xuICBjb25zdCBoZWFkZXIgPSByZXEuaGVhZGVycy5hdXRob3JpemF0aW9uID8/IFwiXCI7XG4gIGNvbnN0IG1hdGNoID0gL15CZWFyZXJcXHMrKC4rKSQvaS5leGVjKGhlYWRlcik7XG4gIGNvbnN0IHJhd1Rva2VuID0gbWF0Y2g/LlsxXT8udHJpbSgpID8/IChyZXEucXVlcnlbXCJ0b2tlblwiXSBhcyBzdHJpbmcgfCB1bmRlZmluZWQpO1xuICBpZiAoIXJhd1Rva2VuKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IHVzZXIgPSB2ZXJpZnlUb2tlbihyYXdUb2tlbik7XG4gIHJldHVybiB1c2VyPy5pc1N1cGVyQWRtaW4gPT09IHRydWU7XG59XG5cbi8qKlxuICogV2hldGhlciB0aGUgP3RlbmFudD0gb3ZlcnJpZGUgc2hvdWxkIGJlIGhvbm9yZWQgZm9yIHRoaXMgcmVxdWVzdC5cbiAqICAtIEluIG5vbi1wcm9kdWN0aW9uIChkZXYgLyBSZXBsaXQgcHJldmlldykgaXQgaXMgYWx3YXlzIGhvbm9yZWQsIHNvIGEgdGVuYW50XG4gKiAgICBjYW4gYmUgcHJldmlld2VkIGJ5IHNsdWcgd2hlcmUgdGhlIHJlcXVlc3QgaG9zdCBtYXBzIHRvIG5vIHRlbmFudCBkb21haW4uXG4gKiAgLSBJbiBwcm9kdWN0aW9uIGl0IGlzIGhvbm9yZWQgb25seSB3aGVuIHRoZSBob3N0IGRvZXMgTk9UIHJlc29sdmUgdG8gYSByZWFsXG4gKiAgICB0ZW5hbnQgZG9tYWluIChlLmcuIGEgKi5yZXBsaXQuYXBwIHByZXZpZXcgaG9zdCksIG9yIGZvciBzdXBlci1hZG1pbnMuXG4gKiBUaGlzIHN0b3BzIGEgdmlzaXRvciBmcm9tIGFwcGVuZGluZyA/dGVuYW50PTxvdGhlcj4gdG8gYSBsaXZlIHRlbmFudCBkb21haW5cbiAqIGFuZCBzZWVpbmcgdGhlIHdyb25nIHNjaG9vbCdzIGNvbnRlbnQgdW5kZXIgdGhhdCBkb21haW4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvdmVycmlkZUFsbG93ZWQocmVxOiBSZXF1ZXN0LCBieURvbWFpbjogVGVuYW50SW5mbyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgIT09IFwicHJvZHVjdGlvblwiKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKCFieURvbWFpbikgcmV0dXJuIHRydWU7XG4gIHJldHVybiBpc1N1cGVyQWRtaW5SZXF1ZXN0KHJlcSk7XG59XG5cbi8qKlxuICogV2hldGhlciB0aGUgcmVxdWVzdCBvcmlnaW5hdGVkIGZyb20gdGhlIGxvY2FsIGdhdGV3YXkgKGxvb3BiYWNrKS5cbiAqIFRoZSBnYXRld2F5IHNldHMgYGhvc3Q6IGxvY2FsaG9zdDo8cG9ydD5gIG9uIGV2ZXJ5IHByb3hpZWQgcmVxdWVzdCwgc28gdGhpc1xuICogaXMgYSByZWxpYWJsZSBzaWduYWwgdGhhdCBYLVRlbmFudC1TbHVnIHdhcyBpbmplY3RlZCBieSBvdXIgb3duIGdhdGV3YXkgYW5kXG4gKiBub3Qgc3Bvb2ZlZCBieSBhbiBleHRlcm5hbCBjbGllbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0dhdGV3YXlSZXF1ZXN0KHJlcTogUmVxdWVzdCk6IGJvb2xlYW4ge1xuICBjb25zdCBob3N0ID0gcmVxLmhlYWRlcnMuaG9zdCA/PyBcIlwiO1xuICByZXR1cm4gaG9zdC5zdGFydHNXaXRoKFwibG9jYWxob3N0OlwiKSB8fCBob3N0ID09PSBcImxvY2FsaG9zdFwiO1xufVxuXG4vKipcbiAqIFJlc29sdmUgd2hpY2ggdGVuYW50IGEgcHVibGljIHJlcXVlc3QgYmVsb25ncyB0bywgZ2l2ZW4gdGhlIGZ1bGwgdGVuYW50IGxpc3QuXG4gKiBSZXR1cm5zIGB7IHRlbmFudCwgY29uZmlkZW50IH1gIHdoZXJlIGBjb25maWRlbnRgIGlzIGZhbHNlIHdoZW4gcmVzb2x1dGlvblxuICogaXMgYW1iaWd1b3VzLiBXcml0ZSBvcGVyYXRpb25zIE1VU1QgcmVqZWN0IChIVFRQIDQwMCkgd2hlbiBgY29uZmlkZW50YCBpcyBmYWxzZS5cbiAqXG4gKiBNSVNNQVRDSCBHVUFSRCAoZXZhbHVhdGVkIGZpcnN0LCBiZWZvcmUgYW55IGJyYW5jaCk6XG4gKiBJbiBwcm9kdWN0aW9uLCBpZiB0aGUgcmVxdWVzdCBob3N0IG1hdGNoZXMgdGVuYW50IEEgYnV0IGA/dGVuYW50PWAgY2xhaW1zXG4gKiB0ZW5hbnQgQiwgYW5kIHRoZSByZXF1ZXN0ZXIgaXMgbm90IGEgc3VwZXItYWRtaW4sIHRoaXMgaXMgdHJlYXRlZCBhc1xuICogZnVuZGFtZW50YWxseSBhbWJpZ3VvdXMuIFJlc29sdXRpb24gc2hvcnQtY2lyY3VpdHMgaW1tZWRpYXRlbHkgd2l0aCB0aGVcbiAqIGhvc3QtbWF0Y2hlZCB0ZW5hbnQgYW5kIGBjb25maWRlbnQ6IGZhbHNlYC4gTm8gc3Vic2VxdWVudCBicmFuY2ggKFJlZmVyZXIsXG4gKiBnYXRld2F5IGhlYWRlciwgZXRjLikgY2FuIHVwZ3JhZGUgdGhpcyB0byBjb25maWRlbnQsIGJlY2F1c2UgYW55IHN1Y2ggYnJhbmNoXG4gKiB3b3VsZCBzdGlsbCBiZSBvcGVyYXRpbmcgdW5kZXIgY29uZmxpY3Rpbmcgc2lnbmFscy5cbiAqXG4gKiBPcmRlciBvZiBwcmVjZWRlbmNlIChhZnRlciBtaXNtYXRjaCBndWFyZCBwYXNzZXMpOlxuICogIDEuID90ZW5hbnQ9PHNsdWd8aWQ+IG92ZXJyaWRlIChvbmx5IHdoZW4gYWxsb3dlZCBcdTIwMTQgc2VlIG92ZXJyaWRlQWxsb3dlZCkuXG4gKiAgMi4gUmVmZXJlciBwYXRoLXByZWZpeDogL2djY20vXHUyMDI2IGNyb3NzLWNoZWNrZWQgYWdhaW5zdCA/dGVuYW50PSBwYXJhbS5cbiAqICAzLiBSZXF1ZXN0IGhvc3QgbWF0Y2hlZCBhZ2FpbnN0IHRlbmFudHMuZG9tYWluIFx1MjE5MiBjb25maWRlbnQ6IHRydWUuXG4gKiAgNC4gWC1UZW5hbnQtU2x1ZyBoZWFkZXIgKG9ubHkgdHJ1c3RlZCBmcm9tIHRoZSBsb29wYmFjayBnYXRld2F5KS5cbiAqICA1LiBERUZBVUxUX1RFTkFOVF9TTFVHIGVudiAoZGVmYXVsdCBcImNjbVwiKSAgICAgXHUyMTkyIGNvbmZpZGVudDogZmFsc2VcbiAqICA2LiBGaXJzdCBhY3RpdmUgdGVuYW50IChsYXN0LXJlc29ydCBmYWxsYmFjaykgICBcdTIxOTIgY29uZmlkZW50OiBmYWxzZVxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZVRlbmFudEZyb21MaXN0KFxuICByZXE6IFJlcXVlc3QsXG4gIHRlbmFudHM6IFRlbmFudEluZm9bXSxcbik6IFRlbmFudFJlc29sdXRpb24ge1xuICBpZiAodGVuYW50cy5sZW5ndGggPT09IDApIHJldHVybiB7IHRlbmFudDogbnVsbCwgY29uZmlkZW50OiBmYWxzZSB9O1xuXG4gIGNvbnN0IGhvc3QgPSBob3N0RnJvbVJlcShyZXEpO1xuICBjb25zdCBieURvbWFpbiA9IGhvc3RcbiAgICA/IHRlbmFudHMuZmluZCgodCkgPT4gdC5kb21haW4gJiYgbm9ybWFsaXplSG9zdCh0LmRvbWFpbikgPT09IGhvc3QpXG4gICAgOiB1bmRlZmluZWQ7XG5cbiAgY29uc3Qgb3ZlcnJpZGUgPSAocmVxLnF1ZXJ5W1widGVuYW50XCJdIGFzIHN0cmluZyB8IHVuZGVmaW5lZCk/LnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICBjb25zdCBpc1N1cGVyQWRtaW4gPSBpc1N1cGVyQWRtaW5SZXF1ZXN0KHJlcSk7XG5cbiAgLy8gXHUyNTAwXHUyNTAwIE1JU01BVENIIEdVQVJEIFx1MjAxNCBldmFsdWF0ZWQgYmVmb3JlIGFueSByZXNvbHV0aW9uIGJyYW5jaCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgLy8gSW4gcHJvZHVjdGlvbiwgaWYgdGhlIGhvc3QgbWFwcyB0byBhIGtub3duIHRlbmFudCBidXQgdGhlIGA/dGVuYW50PWAgcGFyYW1cbiAgLy8gY2xhaW1zIGEgRElGRkVSRU5UIHRlbmFudCAoYW5kIHRoZSByZXF1ZXN0ZXIgaXMgbm90IGEgc3VwZXItYWRtaW4pLCB0aGVcbiAgLy8gc2lnbmFscyBhcmUgaW4gY29uZmxpY3QuIFNob3J0LWNpcmN1aXQgaW1tZWRpYXRlbHkgd2l0aCBgY29uZmlkZW50OiBmYWxzZWBcbiAgLy8gc28gd3JpdGUgb3BlcmF0aW9ucyBhcmUgYmxvY2tlZCByZWdhcmRsZXNzIG9mIFJlZmVyZXIsIGdhdGV3YXksIG9yIGFueVxuICAvLyBvdGhlciBzdWJzZXF1ZW50IHNpZ25hbC4gVGhpcyBwcmV2ZW50cyBieXBhc3MgdmlhIGNyYWZ0ZWQgUmVmZXJlciBoZWFkZXJzLlxuICBpZiAoXG4gICAgcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09IFwicHJvZHVjdGlvblwiICYmXG4gICAgYnlEb21haW4gJiZcbiAgICBvdmVycmlkZSAmJlxuICAgICFpc1N1cGVyQWRtaW5cbiAgKSB7XG4gICAgY29uc3Qgb3ZlcnJpZGVNYXRjaCA9IHRlbmFudHMuZmluZChcbiAgICAgICh0KSA9PiB0LnNsdWcudG9Mb3dlckNhc2UoKSA9PT0gb3ZlcnJpZGUgfHwgdC5pZC50b0xvd2VyQ2FzZSgpID09PSBvdmVycmlkZSxcbiAgICApO1xuICAgIGlmIChvdmVycmlkZU1hdGNoICYmIG92ZXJyaWRlTWF0Y2guaWQgIT09IGJ5RG9tYWluLmlkKSB7XG4gICAgICAvLyBSZXR1cm4gdGhlIGhvc3QtbWF0Y2hlZCB0ZW5hbnQgKG1vc3QgdHJ1c3R3b3J0aHkgc2lnbmFsKSBidXQgbWFyayBhc1xuICAgICAgLy8gbm90IGNvbmZpZGVudCBzbyBjYWxsZXJzIGNhbiByZWplY3Qgd3JpdGVzLlxuICAgICAgcmV0dXJuIHsgdGVuYW50OiBieURvbWFpbiwgY29uZmlkZW50OiBmYWxzZSB9O1xuICAgIH1cbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMCBTdGVwIDE6ID90ZW5hbnQ9IG92ZXJyaWRlIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICBpZiAob3ZlcnJpZGUgJiYgb3ZlcnJpZGVBbGxvd2VkKHJlcSwgYnlEb21haW4pKSB7XG4gICAgY29uc3QgbWF0Y2ggPSB0ZW5hbnRzLmZpbmQoXG4gICAgICAodCkgPT4gdC5zbHVnLnRvTG93ZXJDYXNlKCkgPT09IG92ZXJyaWRlIHx8IHQuaWQudG9Mb3dlckNhc2UoKSA9PT0gb3ZlcnJpZGUsXG4gICAgKTtcbiAgICBpZiAobWF0Y2gpIHJldHVybiB7IHRlbmFudDogbWF0Y2gsIGNvbmZpZGVudDogdHJ1ZSB9O1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwIFN0ZXAgMjogUmVmZXJlciBwYXRoLXByZWZpeCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgLy8gQWxsb3dzIGEgaHViIGRvbWFpbiAoZS5nLiBjY20uZXJwMzYwLm9yZykgdG8gc2VydmUgbXVsdGlwbGUgdGVuYW50c1xuICAvLyBhdCAvY2NtLyBhbmQgL2djY20vIGJ5IGxldHRpbmcgdGhlIGJyb3dzZXIncyBSZWZlcmVyIGd1aWRlIHJlc29sdXRpb24uXG4gIC8vIENyb3NzLWNoZWNrZWQgYWdhaW5zdCB0aGUgP3RlbmFudD0gcGFyYW06IHNwb29maW5nIHJlcXVpcmVzIGJvdGguXG4gIC8vIE5vdGU6IHRoaXMgYnJhbmNoIG9ubHkgZXhlY3V0ZXMgaWYgdGhlIG1pc21hdGNoIGd1YXJkIHBhc3NlZCAobm8gY29uZmxpY3RpbmdcbiAgLy8gaG9zdCtzbHVnIHBhaXIgaW4gcHJvZHVjdGlvbiksIHNvIGl0cyBjb25maWRlbnQ6IHRydWUgaXMgc2FmZS5cbiAgaWYgKG92ZXJyaWRlKSB7XG4gICAgY29uc3QgcmVmZXJlciA9IChyZXEuaGVhZGVyc1tcInJlZmVyZXJcIl0gPz8gcmVxLmhlYWRlcnNbXCJyZWZlcnJlclwiXSA/PyBcIlwiKSBhcyBzdHJpbmc7XG4gICAgaWYgKHJlZmVyZXIpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlZlBhdGggPSBuZXcgVVJMKHJlZmVyZXIpLnBhdGhuYW1lO1xuICAgICAgICBjb25zdCByZWZGaXJzdFNlZyA9IHJlZlBhdGguc3BsaXQoXCIvXCIpLmZpbHRlcihCb29sZWFuKVswXT8udG9Mb3dlckNhc2UoKSA/PyBcIlwiO1xuICAgICAgICBpZiAocmVmRmlyc3RTZWcgPT09IG92ZXJyaWRlKSB7XG4gICAgICAgICAgY29uc3QgbWF0Y2ggPSB0ZW5hbnRzLmZpbmQoXG4gICAgICAgICAgICAodCkgPT4gdC5zbHVnLnRvTG93ZXJDYXNlKCkgPT09IG92ZXJyaWRlIHx8IHQuaWQudG9Mb3dlckNhc2UoKSA9PT0gb3ZlcnJpZGUsXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAobWF0Y2gpIHJldHVybiB7IHRlbmFudDogbWF0Y2gsIGNvbmZpZGVudDogdHJ1ZSB9O1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gTWFsZm9ybWVkIFJlZmVyZXIgXHUyMDE0IGlnbm9yZSBhbmQgZmFsbCB0aHJvdWdoXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwIFN0ZXAgMzogSG9zdCBkb21haW4gbWF0Y2ggXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIGlmIChieURvbWFpbikgcmV0dXJuIHsgdGVuYW50OiBieURvbWFpbiwgY29uZmlkZW50OiB0cnVlIH07XG5cbiAgLy8gXHUyNTAwXHUyNTAwIFN0ZXAgNDogWC1UZW5hbnQtU2x1ZyAoZ2F0ZXdheSBvbmx5KSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgLy8gT25seSBob25vdXIgaXQgd2hlbiB0aGUgcmVxdWVzdCBjb21lcyBmcm9tIHRoZSBsb29wYmFjayBnYXRld2F5IHRvIHByZXZlbnRcbiAgLy8gZXh0ZXJuYWwgY2xpZW50cyBmcm9tIHNwb29maW5nIHRoZWlyIHRlbmFudC5cbiAgY29uc3QgeFNsdWcgPSAocmVxLmhlYWRlcnNbXCJ4LXRlbmFudC1zbHVnXCJdIGFzIHN0cmluZyB8IHVuZGVmaW5lZCk/LnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICBpZiAoeFNsdWcgJiYgaXNHYXRld2F5UmVxdWVzdChyZXEpKSB7XG4gICAgY29uc3QgbWF0Y2ggPSB0ZW5hbnRzLmZpbmQoKHQpID0+IHQuc2x1Zy50b0xvd2VyQ2FzZSgpID09PSB4U2x1Zyk7XG4gICAgaWYgKG1hdGNoKSByZXR1cm4geyB0ZW5hbnQ6IG1hdGNoLCBjb25maWRlbnQ6IHRydWUgfTtcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMCBTdGVwcyA1XHUyMDEzNjogRmFsbGJhY2sgcGF0aHMgXHUyMDE0IE5PVCBjb25maWRlbnQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIC8vIE11c3Qgbm90IGJlIHVzZWQgZm9yIHdyaXRlIG9wZXJhdGlvbnMuXG5cbiAgY29uc3QgYnlEZWZhdWx0ID0gdGVuYW50cy5maW5kKCh0KSA9PiB0LnNsdWcudG9Mb3dlckNhc2UoKSA9PT0gREVGQVVMVF9TTFVHKTtcbiAgaWYgKGJ5RGVmYXVsdCkgcmV0dXJuIHsgdGVuYW50OiBieURlZmF1bHQsIGNvbmZpZGVudDogZmFsc2UgfTtcblxuICBjb25zdCBmaXJzdEFjdGl2ZSA9IHRlbmFudHMuZmluZCgodCkgPT4gdC5pc0FjdGl2ZSkgPz8gdGVuYW50c1swXSE7XG4gIHJldHVybiB7IHRlbmFudDogZmlyc3RBY3RpdmUsIGNvbmZpZGVudDogZmFsc2UgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBQSxPQUFPLFVBQVU7QUFDakIsT0FBTyxZQUFZOzs7QUNEbkIsT0FBTyxZQUFZO0FBQ25CLE9BQU8sWUFBWTtBQU1uQixJQUFNLGlCQUFpQixRQUFRLElBQUksZ0JBQWdCLEtBQUs7QUFDeEQsSUFBTSxpQkFBaUIsUUFBUSxJQUFJLGdCQUFnQixLQUFLO0FBQ3hELElBQU0sYUFBaUIsUUFBUSxJQUFJLFlBQVksS0FB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QUFDdEYsY0FBWSxjQUFjLE1BQU07QUFFOUIsVUFBTSxNQUFNLFFBQVEsRUFBRSxNQUFNLElBQUksUUFBUyxPQUFPLEVBQUUsUUFBUSxNQUFNLEVBQUUsQ0FBQztBQUNuRSxVQUFNLFdBQVcsc0JBQXNCLEtBQUssT0FBTztBQUNuRCxXQUFPLE1BQU0sU0FBUyxXQUFXLE1BQU0sOERBQXlEO0FBQ2hHLFdBQU8sTUFBTSxVQUFVLFFBQVEsSUFBSSxJQUFJLEVBQUU7QUFBQSxFQUMzQyxDQUFDO0FBQ0gsQ0FBQztBQUVELEtBQUssZ0ZBQWdGLE1BQU07QUFDekYsY0FBWSxjQUFjLE1BQU07QUFFOUIsVUFBTSxNQUFNLFFBQVE7QUFBQSxNQUNsQixNQUFNLElBQUk7QUFBQSxNQUNWLE9BQU8sRUFBRSxRQUFRLE9BQU87QUFBQSxNQUN4QixlQUFlLGlCQUFpQjtBQUFBLElBQ2xDLENBQUM7QUFDRCxVQUFNLFdBQVcsc0JBQXNCLEtBQUssT0FBTztBQUNuRCxXQUFPLE1BQU0sU0FBUyxXQUFXLE1BQU0scURBQXFEO0FBQzVGLFdBQU8sTUFBTSxVQUFVLFFBQVEsSUFBSSxLQUFLLElBQUksK0NBQStDO0FBQUEsRUFDN0YsQ0FBQztBQUNILENBQUM7QUFFRCxLQUFLLHVGQUFrRixNQUFNO0FBQzNGLGNBQVksY0FBYyxNQUFNO0FBQzlCLFVBQU0sTUFBTSxRQUFRLEVBQUUsTUFBTSxLQUFLLE9BQVEsQ0FBQztBQUMxQyxVQUFNLFdBQVcsc0JBQXNCLEtBQUssT0FBTztBQUNuRCxXQUFPLE1BQU0sU0FBUyxXQUFXLE1BQU0sMENBQTBDO0FBQ2pGLFdBQU8sTUFBTSxVQUFVLFFBQVEsSUFBSSxLQUFLLEVBQUU7QUFBQSxFQUM1QyxDQUFDO0FBQ0gsQ0FBQztBQUVELEtBQUssMkZBQXNGLE1BQU07QUFDL0YsY0FBWSxjQUFjLE1BQU07QUFLOUIsVUFBTSxNQUFNO0FBQUEsTUFDVixTQUFTO0FBQUEsUUFDUCxNQUFNLElBQUk7QUFBQSxRQUNWLFNBQVMsV0FBVyxJQUFJLE1BQU07QUFBQSxNQUNoQztBQUFBLE1BQ0EsT0FBTyxFQUFFLFFBQVEsT0FBTztBQUFBLElBQzFCO0FBQ0EsVUFBTSxXQUFXLHNCQUFzQixLQUFLLE9BQU87QUFDbkQsV0FBTztBQUFBLE1BQ0wsU0FBUztBQUFBLE1BQ1Q7QUFBQSxNQUNBO0FBQUEsSUFDRjtBQUFBLEVBQ0YsQ0FBQztBQUNILENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
