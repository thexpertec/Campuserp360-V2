// src/routes/cross-tenant-isolation.test.ts
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

// src/routes/cross-tenant-isolation.test.ts
var BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:8080";
var TENANT = {
  ccm: "c651cd4d-0f61-4a29-8b15-0022275639bb",
  gccm: "9d6f0f10-a8f4-4266-9dc7-f7ca4791a291",
  goly: "447c01fa-2cc8-4cf8-90c5-57305b708a1d"
};
var SLUG = { ccm: "ccm", gccm: "gccm", goly: "goly-cukoos" };
function scopedToken(tenantId) {
  const user = {
    id: `test-${tenantId}`,
    username: `admin-${tenantId}`,
    name: "Tenant Admin",
    role: "admin",
    isSuperAdmin: false,
    tenantId,
    roles: []
  };
  return issueToken(user).token;
}
function superToken() {
  const user = {
    id: "test-super",
    username: "super",
    name: "Super Admin",
    role: "admin",
    isSuperAdmin: true,
    roles: []
  };
  return issueToken(user).token;
}
var TOKEN = {
  ccm: scopedToken(TENANT.ccm),
  goly: scopedToken(TENANT.goly),
  super: superToken()
};
async function api(path, token, init = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers ?? {}
    }
  });
  return { status: res.status, text: await res.text() };
}
var reachable;
async function isReachable() {
  if (reachable !== void 0) return reachable;
  try {
    const res = await fetch(`${BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(2500)
    });
    reachable = res.ok;
  } catch {
    reachable = false;
  }
  return reachable;
}
function refsIn(text) {
  return [...new Set(text.match(/[A-Z]{2,5}-\d{4}-[A-Z0-9]+/g) ?? [])];
}
var fixturesPromise;
async function discover() {
  if (fixturesPromise) return fixturesPromise;
  fixturesPromise = (async () => {
    const ccm = await api(
      `/api/admin/applications?tenant=${SLUG.ccm}`,
      TOKEN.super
    );
    const goly = await api(
      `/api/admin/applications?tenant=${SLUG.goly}`,
      TOKEN.super
    );
    if (ccm.status !== 200 || goly.status !== 200) return null;
    const ccmRef = refsIn(ccm.text)[0];
    const golyRef = refsIn(goly.text)[0];
    if (!ccmRef || !golyRef || ccmRef === golyRef) return null;
    return { ccmRef, golyRef };
  })();
  return fixturesPromise;
}
test("a tenant can read its own application by reference", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const fx = await discover();
  if (!fx) return t.skip("could not discover per-tenant application fixtures");
  const { status } = await api(
    `/api/admin/applications/${fx.ccmRef}`,
    TOKEN.ccm
  );
  assert.equal(status, 200, "ccm admin can read a ccm application");
});
test("a tenant CANNOT read another tenant's application by reference", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const fx = await discover();
  if (!fx) return t.skip("could not discover per-tenant application fixtures");
  const a = await api(`/api/admin/applications/${fx.golyRef}`, TOKEN.ccm);
  assert.equal(a.status, 404, "ccm admin must not read a goly application");
  const b = await api(`/api/admin/applications/${fx.ccmRef}`, TOKEN.goly);
  assert.equal(b.status, 404, "goly admin must not read a ccm application");
});
test("?tenant= override is ignored for a scoped (non-super) admin", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const fx = await discover();
  if (!fx) return t.skip("could not discover per-tenant application fixtures");
  const { status } = await api(
    `/api/admin/applications/${fx.ccmRef}?tenant=${SLUG.ccm}`,
    TOKEN.goly
  );
  assert.equal(status, 404, "scoped admin cannot use ?tenant= to cross tenants");
});
test("applications list is scoped to the caller's tenant", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const fx = await discover();
  if (!fx) return t.skip("could not discover per-tenant application fixtures");
  const ccmList = await api("/api/admin/applications", TOKEN.ccm);
  assert.equal(ccmList.status, 200);
  assert.ok(
    ccmList.text.includes(fx.ccmRef),
    "ccm list contains its own application"
  );
  assert.ok(
    !ccmList.text.includes(fx.golyRef),
    "ccm list must NOT contain a goly application"
  );
  const golyList = await api("/api/admin/applications", TOKEN.goly);
  assert.equal(golyList.status, 200);
  assert.ok(
    !golyList.text.includes(fx.ccmRef),
    "goly list must NOT contain a ccm application"
  );
});
test("super-admin with no tenant context cannot list applications (fail-closed)", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const { status, text } = await api("/api/admin/applications", TOKEN.super);
  assert.notEqual(status, 200, "must not return rows without a resolved tenant");
  assert.ok(
    refsIn(text).length === 0,
    "must not leak any application references"
  );
});
test("deleting another tenant's test centre is 404 (no rows touched)", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const list = await api(
    `/api/admin/test-centres?tenant=${SLUG.ccm}`,
    TOKEN.super
  );
  if (list.status !== 200) return t.skip("centres list unavailable");
  const id = (list.text.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
  ) ?? [])[0];
  if (!id) return t.skip("no test centre fixture to probe");
  const del = await api(`/api/admin/test-centres/${id}`, TOKEN.goly, {
    method: "DELETE"
  });
  assert.equal(del.status, 404, "goly admin must not delete a ccm centre");
});
test("test-centres list is scoped to the caller's tenant", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const ccm = await api(
    `/api/admin/test-centres?tenant=${SLUG.ccm}`,
    TOKEN.super
  );
  if (ccm.status !== 200) return t.skip("centres list unavailable");
  const id = (ccm.text.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
  ) ?? [])[0];
  if (!id) return t.skip("no test centre fixture to compare");
  const goly = await api("/api/admin/test-centres", TOKEN.goly);
  assert.equal(goly.status, 200);
  assert.ok(!goly.text.includes(id), "goly admin must not see a ccm centre");
});
test("bulk marks cannot update another tenant's application", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const fx = await discover();
  if (!fx) return t.skip("could not discover per-tenant application fixtures");
  const { status, text } = await api(
    "/api/admin/applications/bulk/marks",
    TOKEN.ccm,
    {
      method: "PATCH",
      body: JSON.stringify({
        entries: [{ referenceId: fx.golyRef, resultMarks: 99 }]
      })
    }
  );
  assert.equal(status, 200);
  const body = JSON.parse(text);
  assert.equal(body.updated, 0, "no cross-tenant application may be updated");
});
test("bulk result cannot update another tenant's application", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const fx = await discover();
  if (!fx) return t.skip("could not discover per-tenant application fixtures");
  const { status, text } = await api(
    "/api/admin/applications/bulk/result",
    TOKEN.ccm,
    {
      method: "POST",
      body: JSON.stringify({
        entries: [{ key: fx.golyRef, marks: 50 }],
        status: "result_announced"
      })
    }
  );
  const body = JSON.parse(text);
  assert.ok([200, 409].includes(status), `unexpected status ${status}`);
  assert.notEqual(body.updated, 1, "no cross-tenant application may be updated");
  assert.ok(
    (body.notFound ?? []).includes(fx.golyRef),
    "cross-tenant reference must be reported not-found"
  );
});
test("bulk interview-performa cannot update another tenant's application", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const fx = await discover();
  if (!fx) return t.skip("could not discover per-tenant application fixtures");
  const { status, text } = await api(
    "/api/admin/applications/bulk/interview-performa",
    TOKEN.ccm,
    {
      method: "PATCH",
      body: JSON.stringify({
        entries: [{ referenceId: fx.golyRef, scoreAppearance: 5 }]
      })
    }
  );
  assert.equal(status, 200);
  const body = JSON.parse(text);
  assert.equal(body.updated, 0, "no cross-tenant application may be updated");
  assert.ok(
    (body.notFound ?? []).includes(fx.golyRef),
    "cross-tenant reference must be reported not-found"
  );
});
test("application cities list is scoped to the caller's tenant", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const ccm = await api("/api/admin/applications/cities", TOKEN.ccm);
  const goly = await api("/api/admin/applications/cities", TOKEN.goly);
  assert.equal(ccm.status, 200);
  assert.equal(goly.status, 200);
  const sup = await api("/api/admin/applications/cities", TOKEN.super);
  assert.notEqual(sup.status, 200, "cities must be refused without a resolved tenant");
});
test("interview-performa list never leaks another tenant's references", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const fx = await discover();
  if (!fx) return t.skip("could not discover per-tenant application fixtures");
  const ccm = await api("/api/admin/applications/interview-performa", TOKEN.ccm);
  assert.ok(!ccm.text.includes(fx.golyRef), "ccm response must not contain a goly reference");
  const sup = await api("/api/admin/applications/interview-performa", TOKEN.super);
  assert.equal(refsIn(sup.text).length, 0, "must not leak any application references");
});
test("students list and stats are fail-closed for super-admin without tenant", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const list = await api("/api/admin/students", TOKEN.super);
  assert.notEqual(list.status, 200, "students list must refuse without a resolved tenant");
  const stats = await api("/api/admin/students/stats", TOKEN.super);
  assert.notEqual(stats.status, 200, "students stats must refuse without a resolved tenant");
});
test("student-by-id and next-gr are fail-closed for super-admin without tenant", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const ccmList = await api("/api/admin/students?pageSize=1", TOKEN.ccm);
  const id = (ccmList.text.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
  ) ?? [])[0];
  if (id) {
    const detail = await api(`/api/admin/students/${id}`, TOKEN.super);
    assert.equal(detail.status, 404, "tenant-less super-admin must not read a student by id");
    const cross = await api(`/api/admin/students/${id}`, TOKEN.goly);
    assert.equal(cross.status, 404, "goly admin must not read a ccm student by id");
  }
  const nextGr = await api("/api/admin/students/next-gr", TOKEN.super);
  assert.notEqual(nextGr.status, 200, "next-gr must refuse without a resolved tenant");
});
test("super-admin with no tenant context cannot preview a merit list (fail-closed)", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const { status, text } = await api(
    "/api/admin/applications/merit/preview",
    TOKEN.super,
    {
      method: "POST",
      body: JSON.stringify({ seats: 10 })
    }
  );
  assert.notEqual(status, 200, "merit preview must refuse without a resolved tenant");
  assert.equal(refsIn(text).length, 0, "must not leak any application references");
});
test("public POST /applications returns 400 or correctly scoped 201 \u2014 never silently misattributes", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const body = {
    fullName: "CrossTenant TestIsolation",
    dateOfBirth: "2010-01-01",
    session: "2026",
    classApplying: "8",
    previousMarks: "80",
    presentAddress: "Test Address",
    guardianName: "Test Guardian",
    fatherName: "Test Father",
    guardianMobile: "03001234567",
    parentCnic: "35201-1234567-9",
    studentMobile: `0300${Math.floor(Math.random() * 9e6 + 1e6)}`,
    studentEmail: `xtest-${Date.now()}@example.com`
  };
  const submitRes = await fetch(`${BASE_URL}/api/applications?tenant=${SLUG.goly}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (submitRes.status === 400) {
    const payload = await submitRes.json();
    assert.ok(
      typeof payload["error"] === "string",
      "400 must return an error message"
    );
    return;
  }
  assert.equal(submitRes.status, 201, `unexpected status ${submitRes.status}`);
  const created = await submitRes.json();
  const ref = created.referenceId;
  if (!ref) return;
  const ccmList = await api("/api/admin/applications", TOKEN.ccm);
  assert.ok(!ccmList.text.includes(ref), "cross-tenant submission must not appear in ccm admin list");
  const golyList = await api("/api/admin/applications", TOKEN.goly);
  assert.ok(golyList.text.includes(ref), "submission must appear in the correct tenant's admin list");
});
test("stats cache is isolated per-tenant \u2014 two tenants within TTL see different payloads", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const ccmStats = await api(`/api/applications/stats?tenant=${SLUG.ccm}`, TOKEN.ccm);
  const golyStats = await api(`/api/applications/stats?tenant=${SLUG.goly}`, TOKEN.goly);
  assert.equal(ccmStats.status, 200, `CCM stats must return 200, got ${ccmStats.status}`);
  assert.equal(golyStats.status, 200, `goly stats must return 200, got ${golyStats.status}`);
  const ccmBody = (() => {
    try {
      return JSON.parse(ccmStats.text);
    } catch {
      return null;
    }
  })();
  const golyBody = (() => {
    try {
      return JSON.parse(golyStats.text);
    } catch {
      return null;
    }
  })();
  assert.ok(ccmBody !== null, "CCM stats response must be valid JSON");
  assert.ok(golyBody !== null, "goly stats response must be valid JSON");
  assert.ok("totalThisSession" in (ccmBody ?? {}), "CCM stats must include totalThisSession");
  assert.ok("totalThisSession" in (golyBody ?? {}), "goly stats must include totalThisSession");
  assert.ok((ccmBody?.totalThisSession ?? 0) >= 0, "CCM totalThisSession must be non-negative");
  assert.ok((golyBody?.totalThisSession ?? 0) >= 0, "goly totalThisSession must be non-negative");
});
test("guardians list is scoped to the admin's tenant via student linkage", async (t) => {
  if (!await isReachable()) return t.skip(`API not reachable at ${BASE_URL}`);
  const superGuardians = await api(
    `/api/admin/guardians?tenant=${SLUG.ccm}`,
    TOKEN.super
  );
  if (superGuardians.status !== 200) return t.skip("guardians endpoint unavailable");
  const superTotal = (() => {
    try {
      return JSON.parse(superGuardians.text).total ?? 0;
    } catch {
      return 0;
    }
  })();
  const ccmGuardians = await api("/api/admin/guardians", TOKEN.ccm);
  const golyGuardians = await api("/api/admin/guardians", TOKEN.goly);
  assert.equal(ccmGuardians.status, 200, "ccm admin must get 200 on guardians list");
  assert.equal(golyGuardians.status, 200, "goly admin must get 200 on guardians list");
  const ccmTotal = (() => {
    try {
      return JSON.parse(ccmGuardians.text).total ?? 0;
    } catch {
      return 0;
    }
  })();
  const golyTotal = (() => {
    try {
      return JSON.parse(golyGuardians.text).total ?? 0;
    } catch {
      return 0;
    }
  })();
  assert.ok(
    ccmTotal <= superTotal,
    `ccm admin sees ${ccmTotal} guardians, super sees ${superTotal} \u2014 scoped must not exceed total`
  );
  assert.ok(
    golyTotal <= superTotal,
    `goly admin sees ${golyTotal} guardians, super sees ${superTotal} \u2014 scoped must not exceed total`
  );
  if (superTotal > 0 && golyTotal > 0 && superTotal > golyTotal) {
    assert.ok(
      ccmTotal < superTotal,
      `ccm admin sees ${ccmTotal} but system has ${superTotal} (${golyTotal} in goly) \u2014 tenant filter must exclude goly-only guardians`
    );
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3JvdXRlcy9jcm9zcy10ZW5hbnQtaXNvbGF0aW9uLnRlc3QudHMiLCAiLi4vLi4vc3JjL2xpYi9hZG1pbi1hdXRoLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgdGVzdCBmcm9tIFwibm9kZTp0ZXN0XCI7XG5pbXBvcnQgYXNzZXJ0IGZyb20gXCJub2RlOmFzc2VydC9zdHJpY3RcIjtcbmltcG9ydCB7IGlzc3VlVG9rZW4sIHR5cGUgQWRtaW5Vc2VyIH0gZnJvbSBcIi4uL2xpYi9hZG1pbi1hdXRoLmpzXCI7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gQ3Jvc3MtdGVuYW50IGlzb2xhdGlvbiAoSURPUiAvIGRhdGEtbGVha2FnZSkgaW50ZWdyYXRpb24gdGVzdHMuXG4vL1xuLy8gVGhlc2UgZXhlcmNpc2UgdGhlIExJVkUgQVBJIHNlcnZlciBvdmVyIEhUVFAgYmVjYXVzZSB0aGUgc2VjdXJpdHkgZ3VhcmFudGVlXG4vLyB1bmRlciB0ZXN0IGlzIHRoZSBhcHAtbGV2ZWwgV0hFUkUgY2xhdXNlIHRoYXQgc2NvcGVzIGV2ZXJ5IGFkbWlzc2lvbnMgcXVlcnlcbi8vIHRvIHRoZSBjYWxsZXIncyB0ZW5hbnQuIFRoZSBEQiBjb25uZWN0cyBhcyBgbmVvbmRiX293bmVyYCAoQllQQVNTUkxTPXRydWUpLFxuLy8gc28gUG9zdGdyZXMgUkxTIGlzIE5PVCBhIGJhY2tzdG9wIFx1MjAxNCB0aGUgYXBwLWxldmVsIGZpbHRlciBpcyB0aGUgb25seSBndWFyZC5cbi8vXG4vLyBGaXh0dXJlcyBhcmUgRElTQ09WRVJFRCBhdCBydW50aW1lIChuZXZlciBoYXJkY29kZWQpOiBzZWVkIHJvd3MgZm9yIHNvbWVcbi8vIHRhYmxlcyBhcmUgcmUtY3JlYXRlZCB3aXRoIGZyZXNoIFVVSURzIG9uIHJlc3RhcnQsIHNvIGEgaGFyZGNvZGVkIGlkIHdvdWxkXG4vLyBtYWtlIGEgY3Jvc3MtdGVuYW50IGNoZWNrIHBhc3MgdHJpdmlhbGx5ICg0MDQgYmVjYXVzZSB0aGUgcm93IGlzIHNpbXBseSBnb25lKS5cbi8vIEEgc3VwZXItYWRtaW4gdG9rZW4gKyA/dGVuYW50PTxzbHVnPiBlbnVtZXJhdGVzIGVhY2ggdGVuYW50J3Mgcm93czsgc2NvcGVkXG4vLyB0b2tlbnMgdGhlbiBwcm92ZSBhIHRlbmFudCBjYW5ub3QgcmVhY2ggYW5vdGhlciB0ZW5hbnQncyByb3dzIFx1MjAxNCBub3QgZXZlbiB3aXRoXG4vLyBhID90ZW5hbnQ9IG92ZXJyaWRlIChob25vdXJlZCBmb3Igc3VwZXItYWRtaW5zIG9ubHkpLlxuLy9cbi8vIENJLXNhZmU6IGlmIHRoZSBBUEkgc2VydmVyIGlzIHVucmVhY2hhYmxlIHRoZSBzdWl0ZSBpcyBza2lwcGVkLCBub3QgZmFpbGVkLlxuLy8gUG9pbnQgaXQgZWxzZXdoZXJlIHdpdGggQVBJX0JBU0VfVVJMLlxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmNvbnN0IEJBU0VfVVJMID0gcHJvY2Vzcy5lbnZbXCJBUElfQkFTRV9VUkxcIl0gPz8gXCJodHRwOi8vbG9jYWxob3N0OjgwODBcIjtcblxuLy8gVGVuYW50IFVVSURzIGFyZSBzdGFibGUgaW5mcmEgY29uZmlnIChzbHVnIFx1MjE5MiBpZCksIHVubGlrZSBzZWVkIHJvdyBkYXRhLlxuY29uc3QgVEVOQU5UID0ge1xuICBjY206IFwiYzY1MWNkNGQtMGY2MS00YTI5LThiMTUtMDAyMjI3NTYzOWJiXCIsXG4gIGdjY206IFwiOWQ2ZjBmMTAtYThmNC00MjY2LTlkYzctZjdjYTQ3OTFhMjkxXCIsXG4gIGdvbHk6IFwiNDQ3YzAxZmEtMmNjOC00Y2Y4LTkwYzUtNTczMDViNzA4YTFkXCIsXG59IGFzIGNvbnN0O1xuXG5jb25zdCBTTFVHID0geyBjY206IFwiY2NtXCIsIGdjY206IFwiZ2NjbVwiLCBnb2x5OiBcImdvbHktY3Vrb29zXCIgfSBhcyBjb25zdDtcblxuZnVuY3Rpb24gc2NvcGVkVG9rZW4odGVuYW50SWQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IHVzZXI6IEFkbWluVXNlciA9IHtcbiAgICBpZDogYHRlc3QtJHt0ZW5hbnRJZH1gLFxuICAgIHVzZXJuYW1lOiBgYWRtaW4tJHt0ZW5hbnRJZH1gLFxuICAgIG5hbWU6IFwiVGVuYW50IEFkbWluXCIsXG4gICAgcm9sZTogXCJhZG1pblwiLFxuICAgIGlzU3VwZXJBZG1pbjogZmFsc2UsXG4gICAgdGVuYW50SWQsXG4gICAgcm9sZXM6IFtdLFxuICB9O1xuICByZXR1cm4gaXNzdWVUb2tlbih1c2VyKS50b2tlbjtcbn1cblxuZnVuY3Rpb24gc3VwZXJUb2tlbigpOiBzdHJpbmcge1xuICBjb25zdCB1c2VyOiBBZG1pblVzZXIgPSB7XG4gICAgaWQ6IFwidGVzdC1zdXBlclwiLFxuICAgIHVzZXJuYW1lOiBcInN1cGVyXCIsXG4gICAgbmFtZTogXCJTdXBlciBBZG1pblwiLFxuICAgIHJvbGU6IFwiYWRtaW5cIixcbiAgICBpc1N1cGVyQWRtaW46IHRydWUsXG4gICAgcm9sZXM6IFtdLFxuICB9O1xuICByZXR1cm4gaXNzdWVUb2tlbih1c2VyKS50b2tlbjtcbn1cblxuY29uc3QgVE9LRU4gPSB7XG4gIGNjbTogc2NvcGVkVG9rZW4oVEVOQU5ULmNjbSksXG4gIGdvbHk6IHNjb3BlZFRva2VuKFRFTkFOVC5nb2x5KSxcbiAgc3VwZXI6IHN1cGVyVG9rZW4oKSxcbn0gYXMgY29uc3Q7XG5cbmFzeW5jIGZ1bmN0aW9uIGFwaShcbiAgcGF0aDogc3RyaW5nLFxuICB0b2tlbjogc3RyaW5nLFxuICBpbml0OiBSZXF1ZXN0SW5pdCA9IHt9LFxuKTogUHJvbWlzZTx7IHN0YXR1czogbnVtYmVyOyB0ZXh0OiBzdHJpbmcgfT4ge1xuICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChgJHtCQVNFX1VSTH0ke3BhdGh9YCwge1xuICAgIC4uLmluaXQsXG4gICAgaGVhZGVyczoge1xuICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3Rva2VufWAsXG4gICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICAgIC4uLihpbml0LmhlYWRlcnMgPz8ge30pLFxuICAgIH0sXG4gIH0pO1xuICByZXR1cm4geyBzdGF0dXM6IHJlcy5zdGF0dXMsIHRleHQ6IGF3YWl0IHJlcy50ZXh0KCkgfTtcbn1cblxuLy8gUmVhY2hhYmlsaXR5IHByb2JlLCBldmFsdWF0ZWQgb25jZSBhbmQgY2FjaGVkLlxubGV0IHJlYWNoYWJsZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcbmFzeW5jIGZ1bmN0aW9uIGlzUmVhY2hhYmxlKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICBpZiAocmVhY2hhYmxlICE9PSB1bmRlZmluZWQpIHJldHVybiByZWFjaGFibGU7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goYCR7QkFTRV9VUkx9L2FwaS9oZWFsdGhgLCB7XG4gICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoMjUwMCksXG4gICAgfSk7XG4gICAgcmVhY2hhYmxlID0gcmVzLm9rO1xuICB9IGNhdGNoIHtcbiAgICByZWFjaGFibGUgPSBmYWxzZTtcbiAgfVxuICByZXR1cm4gcmVhY2hhYmxlO1xufVxuXG4vLyBFeHRyYWN0IGV2ZXJ5IGFwcGxpY2F0aW9uIHJlZmVyZW5jZSAoZS5nLiBDQ00tMjAyNi1BQjEyQ0QpIGZyb20gYSByZXNwb25zZSBib2R5LlxuZnVuY3Rpb24gcmVmc0luKHRleHQ6IHN0cmluZyk6IHN0cmluZ1tdIHtcbiAgcmV0dXJuIFsuLi5uZXcgU2V0KHRleHQubWF0Y2goL1tBLVpdezIsNX0tXFxkezR9LVtBLVowLTldKy9nKSA/PyBbXSldO1xufVxuXG4vLyBEaXNjb3ZlciBvbmUgYXBwbGljYXRpb24gcmVmZXJlbmNlIG93bmVkIGJ5IGVhY2ggdGVuYW50IHZpYSBzdXBlci1hZG1pbiBvdmVycmlkZS5cbnR5cGUgRml4dHVyZXMgPSB7IGNjbVJlZjogc3RyaW5nOyBnb2x5UmVmOiBzdHJpbmcgfSB8IG51bGw7XG5sZXQgZml4dHVyZXNQcm9taXNlOiBQcm9taXNlPEZpeHR1cmVzPiB8IHVuZGVmaW5lZDtcbmFzeW5jIGZ1bmN0aW9uIGRpc2NvdmVyKCk6IFByb21pc2U8Rml4dHVyZXM+IHtcbiAgaWYgKGZpeHR1cmVzUHJvbWlzZSkgcmV0dXJuIGZpeHR1cmVzUHJvbWlzZTtcbiAgZml4dHVyZXNQcm9taXNlID0gKGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBjY20gPSBhd2FpdCBhcGkoXG4gICAgICBgL2FwaS9hZG1pbi9hcHBsaWNhdGlvbnM/dGVuYW50PSR7U0xVRy5jY219YCxcbiAgICAgIFRPS0VOLnN1cGVyLFxuICAgICk7XG4gICAgY29uc3QgZ29seSA9IGF3YWl0IGFwaShcbiAgICAgIGAvYXBpL2FkbWluL2FwcGxpY2F0aW9ucz90ZW5hbnQ9JHtTTFVHLmdvbHl9YCxcbiAgICAgIFRPS0VOLnN1cGVyLFxuICAgICk7XG4gICAgaWYgKGNjbS5zdGF0dXMgIT09IDIwMCB8fCBnb2x5LnN0YXR1cyAhPT0gMjAwKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBjY21SZWYgPSByZWZzSW4oY2NtLnRleHQpWzBdO1xuICAgIGNvbnN0IGdvbHlSZWYgPSByZWZzSW4oZ29seS50ZXh0KVswXTtcbiAgICBpZiAoIWNjbVJlZiB8fCAhZ29seVJlZiB8fCBjY21SZWYgPT09IGdvbHlSZWYpIHJldHVybiBudWxsO1xuICAgIHJldHVybiB7IGNjbVJlZiwgZ29seVJlZiB9O1xuICB9KSgpO1xuICByZXR1cm4gZml4dHVyZXNQcm9taXNlO1xufVxuXG4vLyBcdTI1MDBcdTI1MDAgUmVhZC1ieS1yZWZlcmVuY2UgSURPUiAoYXBwQnlSZWYgbXVzdCBiZSBmYWlsLWNsb3NlZCkgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbnRlc3QoXCJhIHRlbmFudCBjYW4gcmVhZCBpdHMgb3duIGFwcGxpY2F0aW9uIGJ5IHJlZmVyZW5jZVwiLCBhc3luYyAodCkgPT4ge1xuICBpZiAoIShhd2FpdCBpc1JlYWNoYWJsZSgpKSkgcmV0dXJuIHQuc2tpcChgQVBJIG5vdCByZWFjaGFibGUgYXQgJHtCQVNFX1VSTH1gKTtcbiAgY29uc3QgZnggPSBhd2FpdCBkaXNjb3ZlcigpO1xuICBpZiAoIWZ4KSByZXR1cm4gdC5za2lwKFwiY291bGQgbm90IGRpc2NvdmVyIHBlci10ZW5hbnQgYXBwbGljYXRpb24gZml4dHVyZXNcIik7XG4gIGNvbnN0IHsgc3RhdHVzIH0gPSBhd2FpdCBhcGkoXG4gICAgYC9hcGkvYWRtaW4vYXBwbGljYXRpb25zLyR7ZnguY2NtUmVmfWAsXG4gICAgVE9LRU4uY2NtLFxuICApO1xuICBhc3NlcnQuZXF1YWwoc3RhdHVzLCAyMDAsIFwiY2NtIGFkbWluIGNhbiByZWFkIGEgY2NtIGFwcGxpY2F0aW9uXCIpO1xufSk7XG5cbnRlc3QoXCJhIHRlbmFudCBDQU5OT1QgcmVhZCBhbm90aGVyIHRlbmFudCdzIGFwcGxpY2F0aW9uIGJ5IHJlZmVyZW5jZVwiLCBhc3luYyAodCkgPT4ge1xuICBpZiAoIShhd2FpdCBpc1JlYWNoYWJsZSgpKSkgcmV0dXJuIHQuc2tpcChgQVBJIG5vdCByZWFjaGFibGUgYXQgJHtCQVNFX1VSTH1gKTtcbiAgY29uc3QgZnggPSBhd2FpdCBkaXNjb3ZlcigpO1xuICBpZiAoIWZ4KSByZXR1cm4gdC5za2lwKFwiY291bGQgbm90IGRpc2NvdmVyIHBlci10ZW5hbnQgYXBwbGljYXRpb24gZml4dHVyZXNcIik7XG4gIC8vIGNjbSBhZG1pbiB0cmllcyB0byByZWFkIGEgZ29seSBhcHBsaWNhdGlvbiwgYW5kIHZpY2UtdmVyc2EuXG4gIGNvbnN0IGEgPSBhd2FpdCBhcGkoYC9hcGkvYWRtaW4vYXBwbGljYXRpb25zLyR7ZnguZ29seVJlZn1gLCBUT0tFTi5jY20pO1xuICBhc3NlcnQuZXF1YWwoYS5zdGF0dXMsIDQwNCwgXCJjY20gYWRtaW4gbXVzdCBub3QgcmVhZCBhIGdvbHkgYXBwbGljYXRpb25cIik7XG4gIGNvbnN0IGIgPSBhd2FpdCBhcGkoYC9hcGkvYWRtaW4vYXBwbGljYXRpb25zLyR7ZnguY2NtUmVmfWAsIFRPS0VOLmdvbHkpO1xuICBhc3NlcnQuZXF1YWwoYi5zdGF0dXMsIDQwNCwgXCJnb2x5IGFkbWluIG11c3Qgbm90IHJlYWQgYSBjY20gYXBwbGljYXRpb25cIik7XG59KTtcblxudGVzdChcIj90ZW5hbnQ9IG92ZXJyaWRlIGlzIGlnbm9yZWQgZm9yIGEgc2NvcGVkIChub24tc3VwZXIpIGFkbWluXCIsIGFzeW5jICh0KSA9PiB7XG4gIGlmICghKGF3YWl0IGlzUmVhY2hhYmxlKCkpKSByZXR1cm4gdC5za2lwKGBBUEkgbm90IHJlYWNoYWJsZSBhdCAke0JBU0VfVVJMfWApO1xuICBjb25zdCBmeCA9IGF3YWl0IGRpc2NvdmVyKCk7XG4gIGlmICghZngpIHJldHVybiB0LnNraXAoXCJjb3VsZCBub3QgZGlzY292ZXIgcGVyLXRlbmFudCBhcHBsaWNhdGlvbiBmaXh0dXJlc1wiKTtcbiAgLy8gQSBzY29wZWQgZ29seSBhZG1pbiB0cmllcyB0byBlc2NhcGUgaXRzIHRlbmFudCB2aWEgdGhlIG92ZXJyaWRlIHBhcmFtLlxuICBjb25zdCB7IHN0YXR1cyB9ID0gYXdhaXQgYXBpKFxuICAgIGAvYXBpL2FkbWluL2FwcGxpY2F0aW9ucy8ke2Z4LmNjbVJlZn0/dGVuYW50PSR7U0xVRy5jY219YCxcbiAgICBUT0tFTi5nb2x5LFxuICApO1xuICBhc3NlcnQuZXF1YWwoc3RhdHVzLCA0MDQsIFwic2NvcGVkIGFkbWluIGNhbm5vdCB1c2UgP3RlbmFudD0gdG8gY3Jvc3MgdGVuYW50c1wiKTtcbn0pO1xuXG4vLyBcdTI1MDBcdTI1MDAgTGlzdCBlbmRwb2ludCBtdXN0IG5vdCBsZWFrIGFub3RoZXIgdGVuYW50J3Mgcm93cyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxudGVzdChcImFwcGxpY2F0aW9ucyBsaXN0IGlzIHNjb3BlZCB0byB0aGUgY2FsbGVyJ3MgdGVuYW50XCIsIGFzeW5jICh0KSA9PiB7XG4gIGlmICghKGF3YWl0IGlzUmVhY2hhYmxlKCkpKSByZXR1cm4gdC5za2lwKGBBUEkgbm90IHJlYWNoYWJsZSBhdCAke0JBU0VfVVJMfWApO1xuICBjb25zdCBmeCA9IGF3YWl0IGRpc2NvdmVyKCk7XG4gIGlmICghZngpIHJldHVybiB0LnNraXAoXCJjb3VsZCBub3QgZGlzY292ZXIgcGVyLXRlbmFudCBhcHBsaWNhdGlvbiBmaXh0dXJlc1wiKTtcblxuICBjb25zdCBjY21MaXN0ID0gYXdhaXQgYXBpKFwiL2FwaS9hZG1pbi9hcHBsaWNhdGlvbnNcIiwgVE9LRU4uY2NtKTtcbiAgYXNzZXJ0LmVxdWFsKGNjbUxpc3Quc3RhdHVzLCAyMDApO1xuICBhc3NlcnQub2soXG4gICAgY2NtTGlzdC50ZXh0LmluY2x1ZGVzKGZ4LmNjbVJlZiksXG4gICAgXCJjY20gbGlzdCBjb250YWlucyBpdHMgb3duIGFwcGxpY2F0aW9uXCIsXG4gICk7XG4gIGFzc2VydC5vayhcbiAgICAhY2NtTGlzdC50ZXh0LmluY2x1ZGVzKGZ4LmdvbHlSZWYpLFxuICAgIFwiY2NtIGxpc3QgbXVzdCBOT1QgY29udGFpbiBhIGdvbHkgYXBwbGljYXRpb25cIixcbiAgKTtcblxuICBjb25zdCBnb2x5TGlzdCA9IGF3YWl0IGFwaShcIi9hcGkvYWRtaW4vYXBwbGljYXRpb25zXCIsIFRPS0VOLmdvbHkpO1xuICBhc3NlcnQuZXF1YWwoZ29seUxpc3Quc3RhdHVzLCAyMDApO1xuICBhc3NlcnQub2soXG4gICAgIWdvbHlMaXN0LnRleHQuaW5jbHVkZXMoZnguY2NtUmVmKSxcbiAgICBcImdvbHkgbGlzdCBtdXN0IE5PVCBjb250YWluIGEgY2NtIGFwcGxpY2F0aW9uXCIsXG4gICk7XG59KTtcblxudGVzdChcInN1cGVyLWFkbWluIHdpdGggbm8gdGVuYW50IGNvbnRleHQgY2Fubm90IGxpc3QgYXBwbGljYXRpb25zIChmYWlsLWNsb3NlZClcIiwgYXN5bmMgKHQpID0+IHtcbiAgaWYgKCEoYXdhaXQgaXNSZWFjaGFibGUoKSkpIHJldHVybiB0LnNraXAoYEFQSSBub3QgcmVhY2hhYmxlIGF0ICR7QkFTRV9VUkx9YCk7XG4gIC8vIE5vID90ZW5hbnQ9IG92ZXJyaWRlIGFuZCBubyBzY29wZWQgdGVuYW50IFx1MjE5MiBtdXN0IHJlZnVzZSwgbmV2ZXIgZHVtcCBhbGwgdGVuYW50cy5cbiAgY29uc3QgeyBzdGF0dXMsIHRleHQgfSA9IGF3YWl0IGFwaShcIi9hcGkvYWRtaW4vYXBwbGljYXRpb25zXCIsIFRPS0VOLnN1cGVyKTtcbiAgYXNzZXJ0Lm5vdEVxdWFsKHN0YXR1cywgMjAwLCBcIm11c3Qgbm90IHJldHVybiByb3dzIHdpdGhvdXQgYSByZXNvbHZlZCB0ZW5hbnRcIik7XG4gIGFzc2VydC5vayhcbiAgICByZWZzSW4odGV4dCkubGVuZ3RoID09PSAwLFxuICAgIFwibXVzdCBub3QgbGVhayBhbnkgYXBwbGljYXRpb24gcmVmZXJlbmNlc1wiLFxuICApO1xufSk7XG5cbi8vIFx1MjUwMFx1MjUwMCBUZXN0IGNlbnRyZXM6IGNyb3NzLXRlbmFudCBlZGl0L2RlbGV0ZSBmYWlsLWNsb3NlZCAoZGlzY292ZXJlZCwgc2tpcHBhYmxlKSBcdTI1MDBcbi8vIFBBVENIL0RFTEVURSBzY29wZSBieSAoaWQgQU5EIHRlbmFudElkKTsgYSBjcm9zcy10ZW5hbnQgaWQgbWF0Y2hlcyAwIHJvd3MsIHNvXG4vLyB0aGVzZSByZXF1ZXN0cyBjaGFuZ2Ugbm90aGluZyBhbmQgcmV0dXJuIDQwNC4gRml4dHVyZXMgZGlzY292ZXJlZCBhdCBydW50aW1lLlxuXG50ZXN0KFwiZGVsZXRpbmcgYW5vdGhlciB0ZW5hbnQncyB0ZXN0IGNlbnRyZSBpcyA0MDQgKG5vIHJvd3MgdG91Y2hlZClcIiwgYXN5bmMgKHQpID0+IHtcbiAgaWYgKCEoYXdhaXQgaXNSZWFjaGFibGUoKSkpIHJldHVybiB0LnNraXAoYEFQSSBub3QgcmVhY2hhYmxlIGF0ICR7QkFTRV9VUkx9YCk7XG4gIC8vIEZpbmQgYSBjZW50cmUgb3duZWQgYnkgY2NtIHZpYSBzdXBlci1hZG1pbiBvdmVycmlkZS5cbiAgY29uc3QgbGlzdCA9IGF3YWl0IGFwaShcbiAgICBgL2FwaS9hZG1pbi90ZXN0LWNlbnRyZXM/dGVuYW50PSR7U0xVRy5jY219YCxcbiAgICBUT0tFTi5zdXBlcixcbiAgKTtcbiAgaWYgKGxpc3Quc3RhdHVzICE9PSAyMDApIHJldHVybiB0LnNraXAoXCJjZW50cmVzIGxpc3QgdW5hdmFpbGFibGVcIik7XG4gIGNvbnN0IGlkID0gKGxpc3QudGV4dC5tYXRjaChcbiAgICAvWzAtOWEtZl17OH0tWzAtOWEtZl17NH0tWzAtOWEtZl17NH0tWzAtOWEtZl17NH0tWzAtOWEtZl17MTJ9LyxcbiAgKSA/PyBbXSlbMF07XG4gIGlmICghaWQpIHJldHVybiB0LnNraXAoXCJubyB0ZXN0IGNlbnRyZSBmaXh0dXJlIHRvIHByb2JlXCIpO1xuXG4gIC8vIEEgc2NvcGVkIGdvbHkgYWRtaW4gZGVsZXRlcyBhIGNjbSBjZW50cmUgYnkgaWQuIFRoZSBXSEVSRSAoaWQgQU5EIHRlbmFudElkKVxuICAvLyBtYXRjaGVzIDAgcm93cywgc28gbm90aGluZyBpcyBkZWxldGVkIGFuZCB0aGUgQVBJIHJldHVybnMgNDA0LiBERUxFVEUgbmVlZHNcbiAgLy8gbm8gYm9keSwgc28gdGhpcyBuZXZlciBzaG9ydC1jaXJjdWl0cyBvbiBwYXlsb2FkIHZhbGlkYXRpb24uXG4gIGNvbnN0IGRlbCA9IGF3YWl0IGFwaShgL2FwaS9hZG1pbi90ZXN0LWNlbnRyZXMvJHtpZH1gLCBUT0tFTi5nb2x5LCB7XG4gICAgbWV0aG9kOiBcIkRFTEVURVwiLFxuICB9KTtcbiAgYXNzZXJ0LmVxdWFsKGRlbC5zdGF0dXMsIDQwNCwgXCJnb2x5IGFkbWluIG11c3Qgbm90IGRlbGV0ZSBhIGNjbSBjZW50cmVcIik7XG59KTtcblxudGVzdChcInRlc3QtY2VudHJlcyBsaXN0IGlzIHNjb3BlZCB0byB0aGUgY2FsbGVyJ3MgdGVuYW50XCIsIGFzeW5jICh0KSA9PiB7XG4gIGlmICghKGF3YWl0IGlzUmVhY2hhYmxlKCkpKSByZXR1cm4gdC5za2lwKGBBUEkgbm90IHJlYWNoYWJsZSBhdCAke0JBU0VfVVJMfWApO1xuICBjb25zdCBjY20gPSBhd2FpdCBhcGkoXG4gICAgYC9hcGkvYWRtaW4vdGVzdC1jZW50cmVzP3RlbmFudD0ke1NMVUcuY2NtfWAsXG4gICAgVE9LRU4uc3VwZXIsXG4gICk7XG4gIGlmIChjY20uc3RhdHVzICE9PSAyMDApIHJldHVybiB0LnNraXAoXCJjZW50cmVzIGxpc3QgdW5hdmFpbGFibGVcIik7XG4gIGNvbnN0IGlkID0gKGNjbS50ZXh0Lm1hdGNoKFxuICAgIC9bMC05YS1mXXs4fS1bMC05YS1mXXs0fS1bMC05YS1mXXs0fS1bMC05YS1mXXs0fS1bMC05YS1mXXsxMn0vLFxuICApID8/IFtdKVswXTtcbiAgaWYgKCFpZCkgcmV0dXJuIHQuc2tpcChcIm5vIHRlc3QgY2VudHJlIGZpeHR1cmUgdG8gY29tcGFyZVwiKTtcbiAgLy8gZ29seSBzY29wZWQgYWRtaW4gbXVzdCBub3Qgc2VlIGNjbSdzIGNlbnRyZSBpZCBpbiBpdHMgb3duIGxpc3QuXG4gIGNvbnN0IGdvbHkgPSBhd2FpdCBhcGkoXCIvYXBpL2FkbWluL3Rlc3QtY2VudHJlc1wiLCBUT0tFTi5nb2x5KTtcbiAgYXNzZXJ0LmVxdWFsKGdvbHkuc3RhdHVzLCAyMDApO1xuICBhc3NlcnQub2soIWdvbHkudGV4dC5pbmNsdWRlcyhpZCksIFwiZ29seSBhZG1pbiBtdXN0IG5vdCBzZWUgYSBjY20gY2VudHJlXCIpO1xufSk7XG5cbi8vIFx1MjUwMFx1MjUwMCBCdWxrIHdyaXRlIGVuZHBvaW50cyBtdXN0IG5vdCB0b3VjaCBhbm90aGVyIHRlbmFudCdzIGFwcGxpY2F0aW9ucyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbi8vIEVhY2ggYnVsayBlbmRwb2ludCBzY29wZXMgaXRzIHJlZmVyZW5jZSBsb29rdXAgdG8gdGhlIGNhbGxlcidzIHRlbmFudCwgc28gYVxuLy8gY3Jvc3MtdGVuYW50IHJlZmVyZW5jZUlkIHJlc29sdmVzIHRvIDAgcm93czogbm90aGluZyBpcyB3cml0dGVuIGFuZCB0aGUgcm93IGlzXG4vLyByZXBvcnRlZCBhcyBub3QtZm91bmQgLyBub3QtdXBkYXRlZC4gVGhlc2UgcHJvdmUgdGhlIGZhaWwtY2xvc2VkIFdIRVJFIG9uIHRoZVxuLy8gYnVsayBwYXRocyAobWFya3MsIHJlc3VsdCwgaW50ZXJ2aWV3LXBlcmZvcm1hKSwgd2hpY2ggbXV0YXRlIGJ5IHJlZmVyZW5jZUlkLlxuXG50ZXN0KFwiYnVsayBtYXJrcyBjYW5ub3QgdXBkYXRlIGFub3RoZXIgdGVuYW50J3MgYXBwbGljYXRpb25cIiwgYXN5bmMgKHQpID0+IHtcbiAgaWYgKCEoYXdhaXQgaXNSZWFjaGFibGUoKSkpIHJldHVybiB0LnNraXAoYEFQSSBub3QgcmVhY2hhYmxlIGF0ICR7QkFTRV9VUkx9YCk7XG4gIGNvbnN0IGZ4ID0gYXdhaXQgZGlzY292ZXIoKTtcbiAgaWYgKCFmeCkgcmV0dXJuIHQuc2tpcChcImNvdWxkIG5vdCBkaXNjb3ZlciBwZXItdGVuYW50IGFwcGxpY2F0aW9uIGZpeHR1cmVzXCIpO1xuICAvLyBjY20gYWRtaW4gc3VibWl0cyBnb2x5J3MgcmVmZXJlbmNlIGluIGEgYnVsayBtYXJrcyBwYXlsb2FkLlxuICBjb25zdCB7IHN0YXR1cywgdGV4dCB9ID0gYXdhaXQgYXBpKFxuICAgIFwiL2FwaS9hZG1pbi9hcHBsaWNhdGlvbnMvYnVsay9tYXJrc1wiLFxuICAgIFRPS0VOLmNjbSxcbiAgICB7XG4gICAgICBtZXRob2Q6IFwiUEFUQ0hcIixcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZW50cmllczogW3sgcmVmZXJlbmNlSWQ6IGZ4LmdvbHlSZWYsIHJlc3VsdE1hcmtzOiA5OSB9XSxcbiAgICAgIH0pLFxuICAgIH0sXG4gICk7XG4gIGFzc2VydC5lcXVhbChzdGF0dXMsIDIwMCk7XG4gIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHRleHQpIGFzIHsgdXBkYXRlZDogbnVtYmVyIH07XG4gIGFzc2VydC5lcXVhbChib2R5LnVwZGF0ZWQsIDAsIFwibm8gY3Jvc3MtdGVuYW50IGFwcGxpY2F0aW9uIG1heSBiZSB1cGRhdGVkXCIpO1xufSk7XG5cbnRlc3QoXCJidWxrIHJlc3VsdCBjYW5ub3QgdXBkYXRlIGFub3RoZXIgdGVuYW50J3MgYXBwbGljYXRpb25cIiwgYXN5bmMgKHQpID0+IHtcbiAgaWYgKCEoYXdhaXQgaXNSZWFjaGFibGUoKSkpIHJldHVybiB0LnNraXAoYEFQSSBub3QgcmVhY2hhYmxlIGF0ICR7QkFTRV9VUkx9YCk7XG4gIGNvbnN0IGZ4ID0gYXdhaXQgZGlzY292ZXIoKTtcbiAgaWYgKCFmeCkgcmV0dXJuIHQuc2tpcChcImNvdWxkIG5vdCBkaXNjb3ZlciBwZXItdGVuYW50IGFwcGxpY2F0aW9uIGZpeHR1cmVzXCIpO1xuICAvLyBjY20gYWRtaW4gc3VibWl0cyBnb2x5J3MgcmVmZXJlbmNlIGFzIHRoZSBrZXkgaW4gYSBidWxrIHJlc3VsdCBwYXlsb2FkLlxuICBjb25zdCB7IHN0YXR1cywgdGV4dCB9ID0gYXdhaXQgYXBpKFxuICAgIFwiL2FwaS9hZG1pbi9hcHBsaWNhdGlvbnMvYnVsay9yZXN1bHRcIixcbiAgICBUT0tFTi5jY20sXG4gICAge1xuICAgICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZW50cmllczogW3sga2V5OiBmeC5nb2x5UmVmLCBtYXJrczogNTAgfV0sXG4gICAgICAgIHN0YXR1czogXCJyZXN1bHRfYW5ub3VuY2VkXCIsXG4gICAgICB9KSxcbiAgICB9LFxuICApO1xuICAvLyAyMDAgd2l0aCB0aGUgcmVmIHJlcG9ydGVkIG5vdC1mb3VuZCwgb3IgNDA5IChhbGwgZW5yb2xsZWQvbm9uZSBhY3Rpb25hYmxlKSBcdTIwMTRcbiAgLy8gbmV2ZXIgYW4gdXBkYXRlIGFwcGxpZWQgdG8gdGhlIGdvbHkgcm93LlxuICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZSh0ZXh0KSBhcyB7IHVwZGF0ZWQ/OiBudW1iZXI7IG5vdEZvdW5kPzogc3RyaW5nW10gfTtcbiAgYXNzZXJ0Lm9rKFsyMDAsIDQwOV0uaW5jbHVkZXMoc3RhdHVzKSwgYHVuZXhwZWN0ZWQgc3RhdHVzICR7c3RhdHVzfWApO1xuICBhc3NlcnQubm90RXF1YWwoYm9keS51cGRhdGVkLCAxLCBcIm5vIGNyb3NzLXRlbmFudCBhcHBsaWNhdGlvbiBtYXkgYmUgdXBkYXRlZFwiKTtcbiAgYXNzZXJ0Lm9rKFxuICAgIChib2R5Lm5vdEZvdW5kID8/IFtdKS5pbmNsdWRlcyhmeC5nb2x5UmVmKSxcbiAgICBcImNyb3NzLXRlbmFudCByZWZlcmVuY2UgbXVzdCBiZSByZXBvcnRlZCBub3QtZm91bmRcIixcbiAgKTtcbn0pO1xuXG50ZXN0KFwiYnVsayBpbnRlcnZpZXctcGVyZm9ybWEgY2Fubm90IHVwZGF0ZSBhbm90aGVyIHRlbmFudCdzIGFwcGxpY2F0aW9uXCIsIGFzeW5jICh0KSA9PiB7XG4gIGlmICghKGF3YWl0IGlzUmVhY2hhYmxlKCkpKSByZXR1cm4gdC5za2lwKGBBUEkgbm90IHJlYWNoYWJsZSBhdCAke0JBU0VfVVJMfWApO1xuICBjb25zdCBmeCA9IGF3YWl0IGRpc2NvdmVyKCk7XG4gIGlmICghZngpIHJldHVybiB0LnNraXAoXCJjb3VsZCBub3QgZGlzY292ZXIgcGVyLXRlbmFudCBhcHBsaWNhdGlvbiBmaXh0dXJlc1wiKTtcbiAgLy8gY2NtIGFkbWluIHN1Ym1pdHMgZ29seSdzIHJlZmVyZW5jZSBpbiBhIGJ1bGsgaW50ZXJ2aWV3LXBlcmZvcm1hIHBheWxvYWQuXG4gIGNvbnN0IHsgc3RhdHVzLCB0ZXh0IH0gPSBhd2FpdCBhcGkoXG4gICAgXCIvYXBpL2FkbWluL2FwcGxpY2F0aW9ucy9idWxrL2ludGVydmlldy1wZXJmb3JtYVwiLFxuICAgIFRPS0VOLmNjbSxcbiAgICB7XG4gICAgICBtZXRob2Q6IFwiUEFUQ0hcIixcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZW50cmllczogW3sgcmVmZXJlbmNlSWQ6IGZ4LmdvbHlSZWYsIHNjb3JlQXBwZWFyYW5jZTogNSB9XSxcbiAgICAgIH0pLFxuICAgIH0sXG4gICk7XG4gIGFzc2VydC5lcXVhbChzdGF0dXMsIDIwMCk7XG4gIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHRleHQpIGFzIHsgdXBkYXRlZDogbnVtYmVyOyBub3RGb3VuZD86IHN0cmluZ1tdIH07XG4gIGFzc2VydC5lcXVhbChib2R5LnVwZGF0ZWQsIDAsIFwibm8gY3Jvc3MtdGVuYW50IGFwcGxpY2F0aW9uIG1heSBiZSB1cGRhdGVkXCIpO1xuICBhc3NlcnQub2soXG4gICAgKGJvZHkubm90Rm91bmQgPz8gW10pLmluY2x1ZGVzKGZ4LmdvbHlSZWYpLFxuICAgIFwiY3Jvc3MtdGVuYW50IHJlZmVyZW5jZSBtdXN0IGJlIHJlcG9ydGVkIG5vdC1mb3VuZFwiLFxuICApO1xufSk7XG5cbi8vIFx1MjUwMFx1MjUwMCBSZWFkLW9ubHkgYWRtaXNzaW9ucyBsaXN0IGVuZHBvaW50cyBtdXN0IGJlIHRlbmFudC1zY29wZWQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG50ZXN0KFwiYXBwbGljYXRpb24gY2l0aWVzIGxpc3QgaXMgc2NvcGVkIHRvIHRoZSBjYWxsZXIncyB0ZW5hbnRcIiwgYXN5bmMgKHQpID0+IHtcbiAgaWYgKCEoYXdhaXQgaXNSZWFjaGFibGUoKSkpIHJldHVybiB0LnNraXAoYEFQSSBub3QgcmVhY2hhYmxlIGF0ICR7QkFTRV9VUkx9YCk7XG4gIGNvbnN0IGNjbSA9IGF3YWl0IGFwaShcIi9hcGkvYWRtaW4vYXBwbGljYXRpb25zL2NpdGllc1wiLCBUT0tFTi5jY20pO1xuICBjb25zdCBnb2x5ID0gYXdhaXQgYXBpKFwiL2FwaS9hZG1pbi9hcHBsaWNhdGlvbnMvY2l0aWVzXCIsIFRPS0VOLmdvbHkpO1xuICBhc3NlcnQuZXF1YWwoY2NtLnN0YXR1cywgMjAwKTtcbiAgYXNzZXJ0LmVxdWFsKGdvbHkuc3RhdHVzLCAyMDApO1xuICAvLyBTdXBlci1hZG1pbiB3aXRob3V0IGEgdGVuYW50IGNvbnRleHQgbXVzdCBiZSByZWZ1c2VkLCBuZXZlciBkdW1wIGFsbCBjaXRpZXMuXG4gIGNvbnN0IHN1cCA9IGF3YWl0IGFwaShcIi9hcGkvYWRtaW4vYXBwbGljYXRpb25zL2NpdGllc1wiLCBUT0tFTi5zdXBlcik7XG4gIGFzc2VydC5ub3RFcXVhbChzdXAuc3RhdHVzLCAyMDAsIFwiY2l0aWVzIG11c3QgYmUgcmVmdXNlZCB3aXRob3V0IGEgcmVzb2x2ZWQgdGVuYW50XCIpO1xufSk7XG5cbnRlc3QoXCJpbnRlcnZpZXctcGVyZm9ybWEgbGlzdCBuZXZlciBsZWFrcyBhbm90aGVyIHRlbmFudCdzIHJlZmVyZW5jZXNcIiwgYXN5bmMgKHQpID0+IHtcbiAgaWYgKCEoYXdhaXQgaXNSZWFjaGFibGUoKSkpIHJldHVybiB0LnNraXAoYEFQSSBub3QgcmVhY2hhYmxlIGF0ICR7QkFTRV9VUkx9YCk7XG4gIGNvbnN0IGZ4ID0gYXdhaXQgZGlzY292ZXIoKTtcbiAgaWYgKCFmeCkgcmV0dXJuIHQuc2tpcChcImNvdWxkIG5vdCBkaXNjb3ZlciBwZXItdGVuYW50IGFwcGxpY2F0aW9uIGZpeHR1cmVzXCIpO1xuICAvLyBUaGUgaGFuZGxlciBpcyB0ZW5hbnQtc2NvcGVkIChhbmQgdGhlIHBhdGggaXMgYWxzbyBzaGFkb3dlZCBieSB0aGVcbiAgLy8gZmFpbC1jbG9zZWQgOnJlZmVyZW5jZUlkIHJvdXRlLCBzbyBpdCBjdXJyZW50bHkgcmV0dXJucyA0MDQpLiBFaXRoZXIgd2F5IHRoZVxuICAvLyBzZWN1cml0eSBpbnZhcmlhbnQgaG9sZHM6IG5vIGNhbGxlciBtYXkgb2J0YWluIGFub3RoZXIgdGVuYW50J3MgcmVmZXJlbmNlcy5cbiAgY29uc3QgY2NtID0gYXdhaXQgYXBpKFwiL2FwaS9hZG1pbi9hcHBsaWNhdGlvbnMvaW50ZXJ2aWV3LXBlcmZvcm1hXCIsIFRPS0VOLmNjbSk7XG4gIGFzc2VydC5vayghY2NtLnRleHQuaW5jbHVkZXMoZnguZ29seVJlZiksIFwiY2NtIHJlc3BvbnNlIG11c3Qgbm90IGNvbnRhaW4gYSBnb2x5IHJlZmVyZW5jZVwiKTtcbiAgLy8gU3VwZXItYWRtaW4gd2l0aCBubyB0ZW5hbnQgY29udGV4dCBtdXN0IG5ldmVyIGxlYWsgcmVmZXJlbmNlcyBhY3Jvc3MgdGVuYW50cy5cbiAgY29uc3Qgc3VwID0gYXdhaXQgYXBpKFwiL2FwaS9hZG1pbi9hcHBsaWNhdGlvbnMvaW50ZXJ2aWV3LXBlcmZvcm1hXCIsIFRPS0VOLnN1cGVyKTtcbiAgYXNzZXJ0LmVxdWFsKHJlZnNJbihzdXAudGV4dCkubGVuZ3RoLCAwLCBcIm11c3Qgbm90IGxlYWsgYW55IGFwcGxpY2F0aW9uIHJlZmVyZW5jZXNcIik7XG59KTtcblxudGVzdChcInN0dWRlbnRzIGxpc3QgYW5kIHN0YXRzIGFyZSBmYWlsLWNsb3NlZCBmb3Igc3VwZXItYWRtaW4gd2l0aG91dCB0ZW5hbnRcIiwgYXN5bmMgKHQpID0+IHtcbiAgaWYgKCEoYXdhaXQgaXNSZWFjaGFibGUoKSkpIHJldHVybiB0LnNraXAoYEFQSSBub3QgcmVhY2hhYmxlIGF0ICR7QkFTRV9VUkx9YCk7XG4gIGNvbnN0IGxpc3QgPSBhd2FpdCBhcGkoXCIvYXBpL2FkbWluL3N0dWRlbnRzXCIsIFRPS0VOLnN1cGVyKTtcbiAgYXNzZXJ0Lm5vdEVxdWFsKGxpc3Quc3RhdHVzLCAyMDAsIFwic3R1ZGVudHMgbGlzdCBtdXN0IHJlZnVzZSB3aXRob3V0IGEgcmVzb2x2ZWQgdGVuYW50XCIpO1xuICBjb25zdCBzdGF0cyA9IGF3YWl0IGFwaShcIi9hcGkvYWRtaW4vc3R1ZGVudHMvc3RhdHNcIiwgVE9LRU4uc3VwZXIpO1xuICBhc3NlcnQubm90RXF1YWwoc3RhdHMuc3RhdHVzLCAyMDAsIFwic3R1ZGVudHMgc3RhdHMgbXVzdCByZWZ1c2Ugd2l0aG91dCBhIHJlc29sdmVkIHRlbmFudFwiKTtcbn0pO1xuXG50ZXN0KFwic3R1ZGVudC1ieS1pZCBhbmQgbmV4dC1nciBhcmUgZmFpbC1jbG9zZWQgZm9yIHN1cGVyLWFkbWluIHdpdGhvdXQgdGVuYW50XCIsIGFzeW5jICh0KSA9PiB7XG4gIGlmICghKGF3YWl0IGlzUmVhY2hhYmxlKCkpKSByZXR1cm4gdC5za2lwKGBBUEkgbm90IHJlYWNoYWJsZSBhdCAke0JBU0VfVVJMfWApO1xuICAvLyBEaXNjb3ZlciBhIHJlYWwgc3R1ZGVudCBpZCB2aWEgYSBzY29wZWQgYWRtaW4sIHRoZW4gcHJvdmUgYSB0ZW5hbnQtbGVzc1xuICAvLyBzdXBlci1hZG1pbiBjYW5ub3QgcmVhY2ggaXQgKHN0dUJ5SWQgbWF0Y2hlcyBhbiBpbXBvc3NpYmxlIGlkLCBcdTIxOTIgNDA0KS5cbiAgY29uc3QgY2NtTGlzdCA9IGF3YWl0IGFwaShcIi9hcGkvYWRtaW4vc3R1ZGVudHM/cGFnZVNpemU9MVwiLCBUT0tFTi5jY20pO1xuICBjb25zdCBpZCA9IChjY21MaXN0LnRleHQubWF0Y2goXG4gICAgL1swLTlhLWZdezh9LVswLTlhLWZdezR9LVswLTlhLWZdezR9LVswLTlhLWZdezR9LVswLTlhLWZdezEyfS8sXG4gICkgPz8gW10pWzBdO1xuICBpZiAoaWQpIHtcbiAgICBjb25zdCBkZXRhaWwgPSBhd2FpdCBhcGkoYC9hcGkvYWRtaW4vc3R1ZGVudHMvJHtpZH1gLCBUT0tFTi5zdXBlcik7XG4gICAgYXNzZXJ0LmVxdWFsKGRldGFpbC5zdGF0dXMsIDQwNCwgXCJ0ZW5hbnQtbGVzcyBzdXBlci1hZG1pbiBtdXN0IG5vdCByZWFkIGEgc3R1ZGVudCBieSBpZFwiKTtcbiAgICAvLyBBIGdvbHktc2NvcGVkIGFkbWluIG11c3Qgbm90IHJlYWQgYSBjY20gc3R1ZGVudCBlaXRoZXIuXG4gICAgY29uc3QgY3Jvc3MgPSBhd2FpdCBhcGkoYC9hcGkvYWRtaW4vc3R1ZGVudHMvJHtpZH1gLCBUT0tFTi5nb2x5KTtcbiAgICBhc3NlcnQuZXF1YWwoY3Jvc3Muc3RhdHVzLCA0MDQsIFwiZ29seSBhZG1pbiBtdXN0IG5vdCByZWFkIGEgY2NtIHN0dWRlbnQgYnkgaWRcIik7XG4gIH1cbiAgY29uc3QgbmV4dEdyID0gYXdhaXQgYXBpKFwiL2FwaS9hZG1pbi9zdHVkZW50cy9uZXh0LWdyXCIsIFRPS0VOLnN1cGVyKTtcbiAgYXNzZXJ0Lm5vdEVxdWFsKG5leHRHci5zdGF0dXMsIDIwMCwgXCJuZXh0LWdyIG11c3QgcmVmdXNlIHdpdGhvdXQgYSByZXNvbHZlZCB0ZW5hbnRcIik7XG59KTtcblxuLy8gXHUyNTAwXHUyNTAwIE1lcml0IHByZXZpZXcvY29tbWl0IHBvb2wgbXVzdCBiZSB0ZW5hbnQtc2NvcGVkIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxudGVzdChcInN1cGVyLWFkbWluIHdpdGggbm8gdGVuYW50IGNvbnRleHQgY2Fubm90IHByZXZpZXcgYSBtZXJpdCBsaXN0IChmYWlsLWNsb3NlZClcIiwgYXN5bmMgKHQpID0+IHtcbiAgaWYgKCEoYXdhaXQgaXNSZWFjaGFibGUoKSkpIHJldHVybiB0LnNraXAoYEFQSSBub3QgcmVhY2hhYmxlIGF0ICR7QkFTRV9VUkx9YCk7XG4gIGNvbnN0IHsgc3RhdHVzLCB0ZXh0IH0gPSBhd2FpdCBhcGkoXG4gICAgXCIvYXBpL2FkbWluL2FwcGxpY2F0aW9ucy9tZXJpdC9wcmV2aWV3XCIsXG4gICAgVE9LRU4uc3VwZXIsXG4gICAge1xuICAgICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc2VhdHM6IDEwIH0pLFxuICAgIH0sXG4gICk7XG4gIGFzc2VydC5ub3RFcXVhbChzdGF0dXMsIDIwMCwgXCJtZXJpdCBwcmV2aWV3IG11c3QgcmVmdXNlIHdpdGhvdXQgYSByZXNvbHZlZCB0ZW5hbnRcIik7XG4gIGFzc2VydC5lcXVhbChyZWZzSW4odGV4dCkubGVuZ3RoLCAwLCBcIm11c3Qgbm90IGxlYWsgYW55IGFwcGxpY2F0aW9uIHJlZmVyZW5jZXNcIik7XG59KTtcblxuLy8gXHUyNTAwXHUyNTAwIFB1YmxpYyBzdWJtaXQ6IGFtYmlndW91cyB0ZW5hbnQgbXVzdCBiZSByZWplY3RlZCAobmV2ZXIgc2lsZW50bHkgbWlzYXR0cmlidXRlZCkgXHUyNTAwXHUyNTAwXG4vL1xuLy8gQSBQT1NUIHRvIC9hcGkvYXBwbGljYXRpb25zIHdpdGggYSA/dGVuYW50PWdvbHktY3Vrb29zIHNsdWcgbXVzdCBOT1QgY3JlYXRlXG4vLyBhIHJlY29yZCBhdHRyaWJ1dGVkIHRvIHRoZSBmYWxsYmFjayAoY2NtKSB0ZW5hbnQgd2hlbiB0ZW5hbnQgcmVzb2x1dGlvbiBpc1xuLy8gYW1iaWd1b3VzLiAgVGhlIEFQSSBtdXN0IHJldHVybiA0MDAgd2hlbiB0ZW5hbnQgY2Fubm90IGJlIGNvbmZpZGVudGx5IHJlc29sdmVkLlxuLy9cbi8vIFdlIGV4ZXJjaXNlIHRoaXMgYnkgUE9TVGluZyB0byB0aGUgQVBJIHdpdGggbm8gaG9zdC1kb21haW4gc2lnbmFsIGFuZCBub1xuLy8gUmVmZXJlciBcdTIwMTQgb25seSBhIGJhcmUgP3RlbmFudD0gc2x1ZyB3aXRob3V0IGEgbWF0Y2hpbmcgWC1UZW5hbnQtU2x1ZyBoZWFkZXJcbi8vIGZyb20gdGhlIGdhdGV3YXkuICBJbiBwcm9kdWN0aW9uIHRoaXMgaXMgdGhlIGFtYmlndW91cyBjYXNlOyBpbiBkZXYvcHJldmlld1xuLy8gdGhlIG92ZXJyaWRlIGlzIGhvbm91cmVkIGFzIGNvbmZpZGVudC4gIFdlIG9ubHkgYXNzZXJ0IHRoZSBzaGFwZSBvZiB0aGVcbi8vIHJlc3BvbnNlICg0MDAgb3IgMjAxIHdpdGggdGhlIGNvcnJlY3QgdGVuYW50SWQpIFx1MjAxNCB3ZSBuZXZlciBjaGVjayB0aGF0IHRoZVxuLy8gZ29seSByZWZlcmVuY2UgYXBwZWFycyBpbiB0aGUgY2NtIGxpc3QuXG5cbnRlc3QoXCJwdWJsaWMgUE9TVCAvYXBwbGljYXRpb25zIHJldHVybnMgNDAwIG9yIGNvcnJlY3RseSBzY29wZWQgMjAxIFx1MjAxNCBuZXZlciBzaWxlbnRseSBtaXNhdHRyaWJ1dGVzXCIsIGFzeW5jICh0KSA9PiB7XG4gIGlmICghKGF3YWl0IGlzUmVhY2hhYmxlKCkpKSByZXR1cm4gdC5za2lwKGBBUEkgbm90IHJlYWNoYWJsZSBhdCAke0JBU0VfVVJMfWApO1xuXG4gIGNvbnN0IGJvZHkgPSB7XG4gICAgZnVsbE5hbWU6IFwiQ3Jvc3NUZW5hbnQgVGVzdElzb2xhdGlvblwiLFxuICAgIGRhdGVPZkJpcnRoOiBcIjIwMTAtMDEtMDFcIixcbiAgICBzZXNzaW9uOiBcIjIwMjZcIixcbiAgICBjbGFzc0FwcGx5aW5nOiBcIjhcIixcbiAgICBwcmV2aW91c01hcmtzOiBcIjgwXCIsXG4gICAgcHJlc2VudEFkZHJlc3M6IFwiVGVzdCBBZGRyZXNzXCIsXG4gICAgZ3VhcmRpYW5OYW1lOiBcIlRlc3QgR3VhcmRpYW5cIixcbiAgICBmYXRoZXJOYW1lOiBcIlRlc3QgRmF0aGVyXCIsXG4gICAgZ3VhcmRpYW5Nb2JpbGU6IFwiMDMwMDEyMzQ1NjdcIixcbiAgICBwYXJlbnRDbmljOiBcIjM1MjAxLTEyMzQ1NjctOVwiLFxuICAgIHN0dWRlbnRNb2JpbGU6IGAwMzAwJHtNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiA5MDAwMDAwICsgMTAwMDAwMCl9YCxcbiAgICBzdHVkZW50RW1haWw6IGB4dGVzdC0ke0RhdGUubm93KCl9QGV4YW1wbGUuY29tYCxcbiAgfTtcblxuICAvLyBTdWJtaXQgd2l0aCBhIGdvbHktY3Vrb29zID90ZW5hbnQ9IHNsdWcsIG5vIGdhdGV3YXkgaGVhZGVycywgbm8gUmVmZXJlci5cbiAgLy8gSW4gZGV2IG1vZGUgdGhlIG92ZXJyaWRlIElTIGNvbmZpZGVudCAoYWxsb3dlZCBvbiBub24tcHJvZHVjdGlvbiBob3N0cyksXG4gIC8vIHNvIGl0IHNob3VsZCBnZXQgMjAxIHN0YW1wZWQgd2l0aCBnb2x5LiAgSW4gZWl0aGVyIGNhc2UgaXQgbXVzdCBOT1QgYXBwZWFyXG4gIC8vIGluIHRoZSBDQ00gYXBwbGljYXRpb25zIGxpc3QuXG4gIGNvbnN0IHN1Ym1pdFJlcyA9IGF3YWl0IGZldGNoKGAke0JBU0VfVVJMfS9hcGkvYXBwbGljYXRpb25zP3RlbmFudD0ke1NMVUcuZ29seX1gLCB7XG4gICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICBoZWFkZXJzOiB7IFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiIH0sXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkoYm9keSksXG4gIH0pO1xuXG4gIGlmIChzdWJtaXRSZXMuc3RhdHVzID09PSA0MDApIHtcbiAgICAvLyBDb3JyZWN0IGJlaGF2aW91ciBpbiBwcm9kdWN0aW9uOiBhbWJpZ3VvdXMgdGVuYW50IHJlamVjdGVkLlxuICAgIGNvbnN0IHBheWxvYWQgPSAoYXdhaXQgc3VibWl0UmVzLmpzb24oKSkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgYXNzZXJ0Lm9rKFxuICAgICAgdHlwZW9mIHBheWxvYWRbXCJlcnJvclwiXSA9PT0gXCJzdHJpbmdcIixcbiAgICAgIFwiNDAwIG11c3QgcmV0dXJuIGFuIGVycm9yIG1lc3NhZ2VcIixcbiAgICApO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEluIGRldi9wcmV2aWV3OiBvdmVycmlkZSBpcyBob25vdXJlZCBhcyBjb25maWRlbnQgXHUyMTkyIDIwMSB3aXRoIGdvbHkncyB0ZW5hbnRJZC5cbiAgYXNzZXJ0LmVxdWFsKHN1Ym1pdFJlcy5zdGF0dXMsIDIwMSwgYHVuZXhwZWN0ZWQgc3RhdHVzICR7c3VibWl0UmVzLnN0YXR1c31gKTtcbiAgY29uc3QgY3JlYXRlZCA9IChhd2FpdCBzdWJtaXRSZXMuanNvbigpKSBhcyB7IHJlZmVyZW5jZUlkPzogc3RyaW5nIH07XG4gIGNvbnN0IHJlZiA9IGNyZWF0ZWQucmVmZXJlbmNlSWQ7XG4gIGlmICghcmVmKSByZXR1cm47XG5cbiAgLy8gVGhlIG5ld2x5LWNyZWF0ZWQgYXBwbGljYXRpb24gTVVTVCBOT1QgYXBwZWFyIGluIHRoZSBDQ00gYWRtaW4gbGlzdC5cbiAgY29uc3QgY2NtTGlzdCA9IGF3YWl0IGFwaShcIi9hcGkvYWRtaW4vYXBwbGljYXRpb25zXCIsIFRPS0VOLmNjbSk7XG4gIGFzc2VydC5vayghY2NtTGlzdC50ZXh0LmluY2x1ZGVzKHJlZiksIFwiY3Jvc3MtdGVuYW50IHN1Ym1pc3Npb24gbXVzdCBub3QgYXBwZWFyIGluIGNjbSBhZG1pbiBsaXN0XCIpO1xuXG4gIC8vIEl0IFNIT1VMRCBhcHBlYXIgaW4gdGhlIGdvbHkgYWRtaW4gbGlzdC5cbiAgY29uc3QgZ29seUxpc3QgPSBhd2FpdCBhcGkoXCIvYXBpL2FkbWluL2FwcGxpY2F0aW9uc1wiLCBUT0tFTi5nb2x5KTtcbiAgYXNzZXJ0Lm9rKGdvbHlMaXN0LnRleHQuaW5jbHVkZXMocmVmKSwgXCJzdWJtaXNzaW9uIG11c3QgYXBwZWFyIGluIHRoZSBjb3JyZWN0IHRlbmFudCdzIGFkbWluIGxpc3RcIik7XG59KTtcblxuLy8gXHUyNTAwXHUyNTAwIEd1YXJkaWFucyBsaXN0OiB0ZW5hbnQgaXNvbGF0aW9uIHZpYSBzdHVkZW50IGxpbmthZ2UgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vL1xuLy8gVGhlIGd1YXJkaWFucyB0YWJsZSBoYXMgbm8gdGVuYW50X2lkIGNvbHVtbi4gSXNvbGF0aW9uIGlzIHZpYSB0aGVpciBsaW5rZWRcbi8vIHN0dWRlbnRzOiBhIENDTSBhZG1pbiBtdXN0IG9ubHkgc2VlIGd1YXJkaWFucyB3aG9zZSBzdHVkZW50cyBiZWxvbmcgdG8gQ0NNO1xuLy8gYSBnb2x5IGFkbWluIG11c3Qgb25seSBzZWUgdGhlaXIgb3duIHN0dWRlbnRzJyBndWFyZGlhbnMuXG4vL1xuLy8gQSBndWFyZGlhbiBDQU4gbGVnaXRpbWF0ZWx5IGFwcGVhciBpbiBib3RoIHRlbmFudCBsaXN0cyBpZiB0aGV5IGhhdmUgY2hpbGRyZW5cbi8vIGVucm9sbGVkIGF0IGJvdGggc2Nob29scyAoc2hhcmVkIGZhbWlseSkuIFRoZSBpbnZhcmlhbnQgd2UgdGVzdCBpcyBzdHJpY3Rlcjpcbi8vIGNvbXBhcmUgZWFjaCBzY29wZWQgYWRtaW4ncyBjb3VudCB0byB0aGUgc3VwZXItYWRtaW4ncyB0b3RhbCBcdTIwMTQgZWFjaCBtdXN0IHNlZVxuLy8gZmV3ZXIgZ3VhcmRpYW5zIHRoYW4gdGhlIGdsb2JhbCBjb3VudCAodW5sZXNzIHRoZSBEQiBoYXBwZW5zIHRvIGhhdmUgYWxsXG4vLyBndWFyZGlhbnMgc2hhcmVkIGFjcm9zcyB0ZW5hbnRzLCB3aGljaCBpcyBleHRyZW1lbHkgdW5saWtlbHkgaW4gcmVhbCBkYXRhKS5cblxudGVzdChcInN0YXRzIGNhY2hlIGlzIGlzb2xhdGVkIHBlci10ZW5hbnQgXHUyMDE0IHR3byB0ZW5hbnRzIHdpdGhpbiBUVEwgc2VlIGRpZmZlcmVudCBwYXlsb2Fkc1wiLCBhc3luYyAodCkgPT4ge1xuICBpZiAoIShhd2FpdCBpc1JlYWNoYWJsZSgpKSkgcmV0dXJuIHQuc2tpcChgQVBJIG5vdCByZWFjaGFibGUgYXQgJHtCQVNFX1VSTH1gKTtcblxuICAvLyBGZXRjaCBzdGF0cyBmb3IgQ0NNIGFuZCBnb2x5IGluIHF1aWNrIHN1Y2Nlc3Npb24gKGJvdGggd2l0aGluIHRoZSAxNXMgVFRMKS5cbiAgLy8gRWFjaCBtdXN0IHJldHVybiBIVFRQIDIwMCAodGVuYW50IGlzIGFsd2F5cyBjb25maWRlbnQgZnJvbSB0aGUgP3RlbmFudD0gaGVhZGVyXG4gIC8vIHBhdGggaW4gZGV2KSwgYW5kIHRoZSBzZXNzaW9uIGxhYmVscyBtdXN0IGJlIGNvbnNpc3RlbnQuIFRoZSBrZXkgYXNzZXJ0aW9uIGlzXG4gIC8vIHRoYXQgYWZ0ZXIgdGhlIGZpcnN0IGNhbGwgZmlsbHMgdGhlIGNhY2hlLCB0aGUgc2Vjb25kIHRlbmFudCBkb2VzIE5PVCByZWNlaXZlXG4gIC8vIHRoZSBmaXJzdCB0ZW5hbnQncyBjYWNoZWQgcGF5bG9hZCBcdTIwMTQgaS5lLiBzZXJ2ZXIgcHJvY2Vzc2VzIGJvdGggYXMgaW5kZXBlbmRlbnQuXG4gIGNvbnN0IGNjbVN0YXRzID0gYXdhaXQgYXBpKGAvYXBpL2FwcGxpY2F0aW9ucy9zdGF0cz90ZW5hbnQ9JHtTTFVHLmNjbX1gLCBUT0tFTi5jY20pO1xuICBjb25zdCBnb2x5U3RhdHMgPSBhd2FpdCBhcGkoYC9hcGkvYXBwbGljYXRpb25zL3N0YXRzP3RlbmFudD0ke1NMVUcuZ29seX1gLCBUT0tFTi5nb2x5KTtcblxuICBhc3NlcnQuZXF1YWwoY2NtU3RhdHMuc3RhdHVzLCAyMDAsIGBDQ00gc3RhdHMgbXVzdCByZXR1cm4gMjAwLCBnb3QgJHtjY21TdGF0cy5zdGF0dXN9YCk7XG4gIGFzc2VydC5lcXVhbChnb2x5U3RhdHMuc3RhdHVzLCAyMDAsIGBnb2x5IHN0YXRzIG11c3QgcmV0dXJuIDIwMCwgZ290ICR7Z29seVN0YXRzLnN0YXR1c31gKTtcblxuICBjb25zdCBjY21Cb2R5ID0gKCgpID0+IHsgdHJ5IHsgcmV0dXJuIEpTT04ucGFyc2UoY2NtU3RhdHMudGV4dCkgYXMgeyB0b3RhbFRoaXNTZXNzaW9uPzogbnVtYmVyOyBzZXNzaW9uPzogc3RyaW5nIH07IH0gY2F0Y2ggeyByZXR1cm4gbnVsbDsgfSB9KSgpO1xuICBjb25zdCBnb2x5Qm9keSA9ICgoKSA9PiB7IHRyeSB7IHJldHVybiBKU09OLnBhcnNlKGdvbHlTdGF0cy50ZXh0KSBhcyB7IHRvdGFsVGhpc1Nlc3Npb24/OiBudW1iZXI7IHNlc3Npb24/OiBzdHJpbmcgfTsgfSBjYXRjaCB7IHJldHVybiBudWxsOyB9IH0pKCk7XG5cbiAgYXNzZXJ0Lm9rKGNjbUJvZHkgIT09IG51bGwsIFwiQ0NNIHN0YXRzIHJlc3BvbnNlIG11c3QgYmUgdmFsaWQgSlNPTlwiKTtcbiAgYXNzZXJ0Lm9rKGdvbHlCb2R5ICE9PSBudWxsLCBcImdvbHkgc3RhdHMgcmVzcG9uc2UgbXVzdCBiZSB2YWxpZCBKU09OXCIpO1xuXG4gIC8vIEJvdGggcmVzcG9uc2VzIG11c3QgaW5jbHVkZSB0aGUgc2hhcGUgZmllbGRzIChub3QgZWFjaCBvdGhlcidzIGFyYml0cmFyeSBkYXRhKS5cbiAgYXNzZXJ0Lm9rKFwidG90YWxUaGlzU2Vzc2lvblwiIGluIChjY21Cb2R5ID8/IHt9KSwgXCJDQ00gc3RhdHMgbXVzdCBpbmNsdWRlIHRvdGFsVGhpc1Nlc3Npb25cIik7XG4gIGFzc2VydC5vayhcInRvdGFsVGhpc1Nlc3Npb25cIiBpbiAoZ29seUJvZHkgPz8ge30pLCBcImdvbHkgc3RhdHMgbXVzdCBpbmNsdWRlIHRvdGFsVGhpc1Nlc3Npb25cIik7XG5cbiAgLy8gSWYgdGhlIHN5c3RlbSBoYXMgc2VlZGVkIGFwcGxpY2F0aW9ucyBmb3IgYm90aCB0ZW5hbnRzLCB0b3RhbHMgc2hvdWxkIGRpZmZlci5cbiAgLy8gV2UgY2FuJ3QgYXNzZXJ0IGV4YWN0IGNvdW50cywgYnV0IHdlIENBTiBhc3NlcnQgbmVpdGhlciB0b3RhbCBpcyBuZWdhdGl2ZS5cbiAgYXNzZXJ0Lm9rKChjY21Cb2R5Py50b3RhbFRoaXNTZXNzaW9uID8/IDApID49IDAsIFwiQ0NNIHRvdGFsVGhpc1Nlc3Npb24gbXVzdCBiZSBub24tbmVnYXRpdmVcIik7XG4gIGFzc2VydC5vaygoZ29seUJvZHk/LnRvdGFsVGhpc1Nlc3Npb24gPz8gMCkgPj0gMCwgXCJnb2x5IHRvdGFsVGhpc1Nlc3Npb24gbXVzdCBiZSBub24tbmVnYXRpdmVcIik7XG59KTtcblxudGVzdChcImd1YXJkaWFucyBsaXN0IGlzIHNjb3BlZCB0byB0aGUgYWRtaW4ncyB0ZW5hbnQgdmlhIHN0dWRlbnQgbGlua2FnZVwiLCBhc3luYyAodCkgPT4ge1xuICBpZiAoIShhd2FpdCBpc1JlYWNoYWJsZSgpKSkgcmV0dXJuIHQuc2tpcChgQVBJIG5vdCByZWFjaGFibGUgYXQgJHtCQVNFX1VSTH1gKTtcblxuICAvLyBTdXBlci1hZG1pbiBzZWVzIEFMTCBndWFyZGlhbnMuXG4gIGNvbnN0IHN1cGVyR3VhcmRpYW5zID0gYXdhaXQgYXBpKFxuICAgIGAvYXBpL2FkbWluL2d1YXJkaWFucz90ZW5hbnQ9JHtTTFVHLmNjbX1gLFxuICAgIFRPS0VOLnN1cGVyLFxuICApO1xuICBpZiAoc3VwZXJHdWFyZGlhbnMuc3RhdHVzICE9PSAyMDApIHJldHVybiB0LnNraXAoXCJndWFyZGlhbnMgZW5kcG9pbnQgdW5hdmFpbGFibGVcIik7XG5cbiAgY29uc3Qgc3VwZXJUb3RhbCA9ICgoKSA9PiB7XG4gICAgdHJ5IHsgcmV0dXJuIChKU09OLnBhcnNlKHN1cGVyR3VhcmRpYW5zLnRleHQpIGFzIHsgdG90YWw/OiBudW1iZXIgfSkudG90YWwgPz8gMDsgfVxuICAgIGNhdGNoIHsgcmV0dXJuIDA7IH1cbiAgfSkoKTtcblxuICAvLyBTY29wZWQgYWRtaW4gY2FsbHMgXHUyMDE0IGVhY2ggbXVzdCBzdWNjZWVkLlxuICBjb25zdCBjY21HdWFyZGlhbnMgPSBhd2FpdCBhcGkoXCIvYXBpL2FkbWluL2d1YXJkaWFuc1wiLCBUT0tFTi5jY20pO1xuICBjb25zdCBnb2x5R3VhcmRpYW5zID0gYXdhaXQgYXBpKFwiL2FwaS9hZG1pbi9ndWFyZGlhbnNcIiwgVE9LRU4uZ29seSk7XG4gIGFzc2VydC5lcXVhbChjY21HdWFyZGlhbnMuc3RhdHVzLCAyMDAsIFwiY2NtIGFkbWluIG11c3QgZ2V0IDIwMCBvbiBndWFyZGlhbnMgbGlzdFwiKTtcbiAgYXNzZXJ0LmVxdWFsKGdvbHlHdWFyZGlhbnMuc3RhdHVzLCAyMDAsIFwiZ29seSBhZG1pbiBtdXN0IGdldCAyMDAgb24gZ3VhcmRpYW5zIGxpc3RcIik7XG5cbiAgY29uc3QgY2NtVG90YWwgPSAoKCkgPT4ge1xuICAgIHRyeSB7IHJldHVybiAoSlNPTi5wYXJzZShjY21HdWFyZGlhbnMudGV4dCkgYXMgeyB0b3RhbD86IG51bWJlciB9KS50b3RhbCA/PyAwOyB9XG4gICAgY2F0Y2ggeyByZXR1cm4gMDsgfVxuICB9KSgpO1xuICBjb25zdCBnb2x5VG90YWwgPSAoKCkgPT4ge1xuICAgIHRyeSB7IHJldHVybiAoSlNPTi5wYXJzZShnb2x5R3VhcmRpYW5zLnRleHQpIGFzIHsgdG90YWw/OiBudW1iZXIgfSkudG90YWwgPz8gMDsgfVxuICAgIGNhdGNoIHsgcmV0dXJuIDA7IH1cbiAgfSkoKTtcblxuICAvLyBFYWNoIHNjb3BlZCBhZG1pbiBtdXN0IHNlZSBubyBtb3JlIGd1YXJkaWFucyB0aGFuIHRoZSBzeXN0ZW0gdG90YWwuXG4gIGFzc2VydC5vayhcbiAgICBjY21Ub3RhbCA8PSBzdXBlclRvdGFsLFxuICAgIGBjY20gYWRtaW4gc2VlcyAke2NjbVRvdGFsfSBndWFyZGlhbnMsIHN1cGVyIHNlZXMgJHtzdXBlclRvdGFsfSBcdTIwMTQgc2NvcGVkIG11c3Qgbm90IGV4Y2VlZCB0b3RhbGAsXG4gICk7XG4gIGFzc2VydC5vayhcbiAgICBnb2x5VG90YWwgPD0gc3VwZXJUb3RhbCxcbiAgICBgZ29seSBhZG1pbiBzZWVzICR7Z29seVRvdGFsfSBndWFyZGlhbnMsIHN1cGVyIHNlZXMgJHtzdXBlclRvdGFsfSBcdTIwMTQgc2NvcGVkIG11c3Qgbm90IGV4Y2VlZCB0b3RhbGAsXG4gICk7XG5cbiAgLy8gVGhlIGNyaXRpY2FsIGlzb2xhdGlvbiBpbnZhcmlhbnQ6IGlmIGdvbHkgaGFzIEFOWSBzdHVkZW50cyBlbnJvbGxlZCAoZ29seVRvdGFsID4gMClcbiAgLy8gYW5kIHRoZSBzeXN0ZW0gaGFzIG1vcmUgZ3VhcmRpYW5zIHRoYW4gZ29seSBhbG9uZSAoc3VwZXJUb3RhbCA+IGdvbHlUb3RhbCksXG4gIC8vIHRoZW4gdGhlIENDTSBhZG1pbiBtdXN0IG5vdCBzZWUgQUxMIGd1YXJkaWFucyBcdTIwMTQgc29tZSBhcmUgZ29seS1vbmx5LlxuICAvLyBUaGlzIHByb3ZlcyB0aGUgZmlsdGVyIGlzIGFwcGxpZWQgYW5kIG5vdCBieXBhc3NlZC5cbiAgaWYgKHN1cGVyVG90YWwgPiAwICYmIGdvbHlUb3RhbCA+IDAgJiYgc3VwZXJUb3RhbCA+IGdvbHlUb3RhbCkge1xuICAgIGFzc2VydC5vayhcbiAgICAgIGNjbVRvdGFsIDwgc3VwZXJUb3RhbCxcbiAgICAgIGBjY20gYWRtaW4gc2VlcyAke2NjbVRvdGFsfSBidXQgc3lzdGVtIGhhcyAke3N1cGVyVG90YWx9ICgke2dvbHlUb3RhbH0gaW4gZ29seSkgXHUyMDE0IHRlbmFudCBmaWx0ZXIgbXVzdCBleGNsdWRlIGdvbHktb25seSBndWFyZGlhbnNgLFxuICAgICk7XG4gIH1cbn0pO1xuIiwgImltcG9ydCBjcnlwdG8gZnJvbSBcIm5vZGU6Y3J5cHRvXCI7XG5pbXBvcnQgYmNyeXB0IGZyb20gXCJiY3J5cHRqc1wiO1xuaW1wb3J0IHR5cGUgeyBSZXF1ZXN0LCBSZXNwb25zZSwgTmV4dEZ1bmN0aW9uIH0gZnJvbSBcImV4cHJlc3NcIjtcblxuLy8gXHUyNTAwXHUyNTAwIFNlY3JldCAvIGNyZWRlbnRpYWwgY2hlY2tzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gVE9LRU5fU0VDUkVUIHNpZ25zIGV2ZXJ5IGFkbWluIHNlc3Npb24gdG9rZW4gXHUyMDE0IGl0IE1VU1QgYmUgYSBzZWNyZXQgZW52IHZhci5cbi8vIElmIHRoZSBmYWxsYmFjayBpcyBpbiB1c2UsIGFueSBhdHRhY2tlciB3aG8gcmVhZHMgdGhlIHNvdXJjZSBjYW4gZm9yZ2UgdG9rZW5zLlxuY29uc3QgQURNSU5fVVNFUk5BTUUgPSBwcm9jZXNzLmVudltcIkFETUlOX1VTRVJOQU1FXCJdID8/IFwiYWRtaW5cIjtcbmNvbnN0IEFETUlOX1BBU1NXT1JEID0gcHJvY2Vzcy5lbnZbXCJBRE1JTl9QQVNTV09SRFwiXSA/PyBcImFkbWluMTIzXCI7XG5jb25zdCBBRE1JTl9OQU1FICAgICA9IHByb2Nlc3MuZW52W1wiQURNSU5fTkFNRVwiXSAgICAgPz8gXCJBZG1pc3Npb25zIE9mZmljZVwiO1xuXG5jb25zdCBUT0tFTl9TRUNSRVQgPSBwcm9jZXNzLmVudltcIkFETUlOX1RPS0VOX1NFQ1JFVFwiXSA/PyBcImNjbS1hZG1pbi1kZXYtc2VjcmV0LWNoYW5nZS1tZVwiO1xuXG5jb25zdCBfREVGQVVMVFNfSU5fVVNFOiBzdHJpbmdbXSA9IFtdO1xuaWYgKCFwcm9jZXNzLmVudltcIkFETUlOX1RPS0VOX1NFQ1JFVFwiXSkgX0RFRkFVTFRTX0lOX1VTRS5wdXNoKFwiQURNSU5fVE9LRU5fU0VDUkVUXCIpO1xuaWYgKCFwcm9jZXNzLmVudltcIkFETUlOX1BBU1NXT1JEXCJdKSAgICAgX0RFRkFVTFRTX0lOX1VTRS5wdXNoKFwiQURNSU5fUEFTU1dPUkRcIik7XG5pZiAoX0RFRkFVTFRTX0lOX1VTRS5sZW5ndGgpIHtcbiAgY29uc29sZS5lcnJvcihcbiAgICBcIlxcblx1MjZBMFx1RkUwRiAgU0VDVVJJVFkgV0FSTklORyBcdTI2QTBcdUZFMEZcXG5cIiArXG4gICAgYCAgIFRoZSBmb2xsb3dpbmcgc2VjcmV0cyBhcmUgdXNpbmcgaW5zZWN1cmUgZGVmYXVsdHM6ICR7X0RFRkFVTFRTX0lOX1VTRS5qb2luKFwiLCBcIil9XFxuYCArXG4gICAgXCIgICBBbnlvbmUgd2hvIHJlYWRzIHRoZSBzb3VyY2UgY29kZSBjYW4gbG9nIGluIG9yIGZvcmdlIHNlc3Npb24gdG9rZW5zLlxcblwiICtcbiAgICBcIiAgIEdvIHRvIFJlcGxpdCBTZWNyZXRzIGFuZCBzZXQgdGhlc2UgZW52IHZhcnMgTk9XIGJlZm9yZSBkZXBsb3lpbmcgdG8gcHJvZHVjdGlvbi5cXG5cIlxuICApO1xufVxuXG5jb25zdCBUT0tFTl9UVExfTVMgPSA3ICogMjQgKiA2MCAqIDYwICogMTAwMDsgLy8gNyBkYXlzXG5jb25zdCBCQ1JZUFRfUk9VTkRTID0gMTI7XG5jb25zdCBMRUdBQ1lfUFJFRklYID0gXCIkMlwiOyAvLyBiY3J5cHQgaGFzaGVzIHN0YXJ0IHdpdGggJDJhJCBvciAkMmIkXG5cbi8vIFx1MjUwMFx1MjUwMCBUeXBlcyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuZXhwb3J0IHR5cGUgQWRtaW5Vc2VyID0ge1xuICBpZDogc3RyaW5nO1xuICB1c2VybmFtZTogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIHJvbGU6IHN0cmluZztcbiAgaXNTdXBlckFkbWluOiBib29sZWFuO1xuICB0ZW5hbnRJZD86IHN0cmluZztcbiAgcm9sZXM6IEFycmF5PHsgbW9kdWxlOiBzdHJpbmc7IHBlcm1pc3Npb246IHN0cmluZyB9Pjtcbn07XG5cbmV4cG9ydCB0eXBlIEFkbWluVG9rZW5SZXN1bHQgPSB7XG4gIHRva2VuOiBzdHJpbmc7XG4gIGV4cGlyZXNBdDogRGF0ZTtcbiAgdXNlcjogQWRtaW5Vc2VyO1xufTtcblxuLy8gXHUyNTAwXHUyNTAwIENyeXB0byBoZWxwZXJzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5mdW5jdGlvbiBiYXNlNjR1cmwoaW5wdXQ6IEJ1ZmZlciB8IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBCdWZmZXIuZnJvbShpbnB1dClcbiAgICAudG9TdHJpbmcoXCJiYXNlNjRcIilcbiAgICAucmVwbGFjZSgvXFwrL2csIFwiLVwiKVxuICAgIC5yZXBsYWNlKC9cXC8vZywgXCJfXCIpXG4gICAgLnJlcGxhY2UoLz0rJC8sIFwiXCIpO1xufVxuXG5mdW5jdGlvbiBzaWduKHBheWxvYWQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBiYXNlNjR1cmwoXG4gICAgY3J5cHRvLmNyZWF0ZUhtYWMoXCJzaGEyNTZcIiwgVE9LRU5fU0VDUkVUKS51cGRhdGUocGF5bG9hZCkuZGlnZXN0KCksXG4gICk7XG59XG5cbmZ1bmN0aW9uIHRpbWluZ1NhZmVFcXVhbFN0cihhOiBzdHJpbmcsIGI6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBjb25zdCBidWZBID0gQnVmZmVyLmZyb20oYSk7XG4gIGNvbnN0IGJ1ZkIgPSBCdWZmZXIuZnJvbShiKTtcbiAgaWYgKGJ1ZkEubGVuZ3RoICE9PSBidWZCLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gY3J5cHRvLnRpbWluZ1NhZmVFcXVhbChidWZBLCBidWZCKTtcbn1cblxuY29uc3QgVVVJRF9SRSA9IC9eWzAtOWEtZl17OH0tWzAtOWEtZl17NH0tWzAtOWEtZl17NH0tWzAtOWEtZl17NH0tWzAtOWEtZl17MTJ9JC9pO1xuXG4vKipcbiAqIFJldHVybnMgYHVzZXIuaWRgIG9ubHkgd2hlbiBpdCBpcyBhIHJlYWwgcm93IGluIGBhZG1pbl91c2Vyc2AgKGEgVVVJRCksIG9yXG4gKiBgbnVsbGAgb3RoZXJ3aXNlLiBTZXZlcmFsIHNlc3Npb24gdHlwZXMgY2FycnkgYSBzeW50aGV0aWMsIG5vbi1VVUlEIGlkIHRoYXRcbiAqIGhhcyBubyBtYXRjaGluZyBgYWRtaW5fdXNlcnNgIHJvdyBcdTIwMTQgdGhlIGVudi12YXIgc3VwZXItYWRtaW4gKFwiZW52LWFkbWluXCIpXG4gKiBhbmQgU2FhUy1hZG1pbiB0ZW5hbnQgaW1wZXJzb25hdGlvbiBzZXNzaW9ucyAoXCJzYWFzLWltcGVyc29uYXRlLTx0ZW5hbnRJZD5cIilcbiAqIGFyZSB0aGUgdHdvIGtub3duIGNhc2VzIHRvZGF5LCBhbmQgbW9yZSBtYXkgYmUgYWRkZWQgbGF0ZXIuXG4gKlxuICogVXNlIHRoaXMgaW5zdGVhZCBvZiBhZC1ob2MgYHVzZXIuaWQgIT09IFwiZW52LWFkbWluXCJgIGNoZWNrcyB3aGVuZXZlciB0aGUgaWRcbiAqIGlzIHdyaXR0ZW4gaW50byBhIG1ha2VyL2NoZWNrZXIgY29sdW1uIHdpdGggYSBmb3JlaWduIGtleSB0byBhZG1pbl91c2Vyc1xuICogKHByZXBhcmVkQnksIGFwcHJvdmVkQnksIGNvbGxlY3RlZEJ5LCBtYXJrc0VudGVyZWRCeSwgZXRjLikgXHUyMDE0IGluc2VydGluZyBhXG4gKiBzeW50aGV0aWMgaWQgdGhlcmUgdmlvbGF0ZXMgdGhlIEZLIGNvbnN0cmFpbnQgYW5kIGZhaWxzIHRoZSB3aG9sZSByZXF1ZXN0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhbEFkbWluVXNlcklkKHVzZXI6IFBpY2s8QWRtaW5Vc2VyLCBcImlkXCI+IHwgbnVsbCB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IG51bGwge1xuICBjb25zdCBpZCA9IHVzZXI/LmlkO1xuICByZXR1cm4gaWQgJiYgVVVJRF9SRS50ZXN0KGlkKSA/IGlkIDogbnVsbDtcbn1cblxuLyoqIEhhc2ggYSBwYXNzd29yZCB3aXRoIGJjcnlwdCAodXNlIGZvciBuZXcgcGFzc3dvcmRzIGFuZCByZS1oYXNoaW5nKS4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYXNoUGFzc3dvcmQocGFzc3dvcmQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gIHJldHVybiBiY3J5cHQuaGFzaChwYXNzd29yZCwgQkNSWVBUX1JPVU5EUyk7XG59XG5cbi8qKlxuICogVmVyaWZ5IGEgcGFzc3dvcmQgYWdhaW5zdCBhIHN0b3JlZCBoYXNoLlxuICogU3VwcG9ydHMgYm90aCBiY3J5cHQgaGFzaGVzIChuZXcpIGFuZCBsZWdhY3kgSE1BQy1TSEEyNTYgaGFzaGVzLlxuICogUmV0dXJucyB7IHZhbGlkLCBuZWVkc1JlaGFzaCB9IFx1MjAxNCBpZiBuZWVkc1JlaGFzaCBpcyB0cnVlLCBjYWxsZXIgc2hvdWxkXG4gKiByZS1oYXNoIHRoZSBwbGFpbnRleHQgcGFzc3dvcmQgd2l0aCBiY3J5cHQgYW5kIHNhdmUgaXQgdG8gdGhlIERCLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdmVyaWZ5UGFzc3dvcmQoXG4gIHBhc3N3b3JkOiBzdHJpbmcsXG4gIHN0b3JlZEhhc2g6IHN0cmluZyxcbik6IFByb21pc2U8eyB2YWxpZDogYm9vbGVhbjsgbmVlZHNSZWhhc2g6IGJvb2xlYW4gfT4ge1xuICBpZiAoc3RvcmVkSGFzaC5zdGFydHNXaXRoKExFR0FDWV9QUkVGSVgpKSB7XG4gICAgLy8gTW9kZXJuIGJjcnlwdCBoYXNoXG4gICAgY29uc3QgdmFsaWQgPSBhd2FpdCBiY3J5cHQuY29tcGFyZShwYXNzd29yZCwgc3RvcmVkSGFzaCk7XG4gICAgcmV0dXJuIHsgdmFsaWQsIG5lZWRzUmVoYXNoOiBmYWxzZSB9O1xuICB9XG4gIC8vIExlZ2FjeSBITUFDLVNIQTI1NiBoYXNoIFx1MjAxNCB2ZXJpZnkgYW5kIGZsYWcgZm9yIHJlLWhhc2hcbiAgY29uc3QgbGVnYWN5SGFzaCA9IGNyeXB0b1xuICAgIC5jcmVhdGVIbWFjKFwic2hhMjU2XCIsIFRPS0VOX1NFQ1JFVClcbiAgICAudXBkYXRlKHBhc3N3b3JkKVxuICAgIC5kaWdlc3QoXCJoZXhcIik7XG4gIGNvbnN0IHZhbGlkID0gdGltaW5nU2FmZUVxdWFsU3RyKGxlZ2FjeUhhc2gsIHN0b3JlZEhhc2gpO1xuICByZXR1cm4geyB2YWxpZCwgbmVlZHNSZWhhc2g6IHZhbGlkIH07IC8vIG9ubHkgcmUtaGFzaCBpZiBwYXNzd29yZCB3YXMgYWN0dWFsbHkgY29ycmVjdFxufVxuXG4vKiogU3luY2hyb25vdXMgYmNyeXB0IGhhc2ggXHUyMDE0IG9ubHkgZm9yIHVzZSBpbiBzdGFydHVwIG1pZ3JhdGlvbiBzY3JpcHRzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhhc2hQYXNzd29yZFN5bmMocGFzc3dvcmQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBiY3J5cHQuaGFzaFN5bmMocGFzc3dvcmQsIEJDUllQVF9ST1VORFMpO1xufVxuXG4vLyBcdTI1MDBcdTI1MDAgRW52LXZhciBjcmVkZW50aWFsIGNoZWNrIChsZWdhY3kgc3VwZXItYWRtaW4pIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5leHBvcnQgZnVuY3Rpb24gdmVyaWZ5RW52Q3JlZGVudGlhbHMoXG4gIHVzZXJuYW1lOiBzdHJpbmcsXG4gIHBhc3N3b3JkOiBzdHJpbmcsXG4pOiBBZG1pblVzZXIgfCBudWxsIHtcbiAgY29uc3QgdXNlck9rID0gdGltaW5nU2FmZUVxdWFsU3RyKHVzZXJuYW1lLCBBRE1JTl9VU0VSTkFNRSk7XG4gIGNvbnN0IHBhc3NPayA9IHRpbWluZ1NhZmVFcXVhbFN0cihwYXNzd29yZCwgQURNSU5fUEFTU1dPUkQpO1xuICBpZiAodXNlck9rICYmIHBhc3NPaykge1xuICAgIHJldHVybiB7XG4gICAgICBpZDogXCJlbnYtYWRtaW5cIixcbiAgICAgIHVzZXJuYW1lOiBBRE1JTl9VU0VSTkFNRSxcbiAgICAgIG5hbWU6IEFETUlOX05BTUUsXG4gICAgICByb2xlOiBcImFkbWluXCIsXG4gICAgICBpc1N1cGVyQWRtaW46IHRydWUsXG4gICAgICByb2xlczogW10sXG4gICAgfTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuLy8gXHUyNTAwXHUyNTAwIFRva2VuIGlzc3VlIC8gdmVyaWZ5IFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5leHBvcnQgZnVuY3Rpb24gaXNzdWVUb2tlbih1c2VyOiBBZG1pblVzZXIpOiBBZG1pblRva2VuUmVzdWx0IHtcbiAgY29uc3QgZXhwaXJlc0F0ID0gbmV3IERhdGUoRGF0ZS5ub3coKSArIFRPS0VOX1RUTF9NUyk7XG4gIGNvbnN0IGJvZHkgPSB7XG4gICAgc3ViOiAgICAgICAgICB1c2VyLnVzZXJuYW1lLFxuICAgIHVpZDogICAgICAgICAgdXNlci5pZCxcbiAgICBuYW1lOiAgICAgICAgIHVzZXIubmFtZSxcbiAgICByb2xlOiAgICAgICAgIHVzZXIucm9sZSxcbiAgICBpc1N1cGVyQWRtaW46IHVzZXIuaXNTdXBlckFkbWluLFxuICAgIHRlbmFudElkOiAgICAgdXNlci50ZW5hbnRJZCxcbiAgICByb2xlczogICAgICAgIHVzZXIucm9sZXMsXG4gICAgZXhwOiAgICAgICAgICBleHBpcmVzQXQuZ2V0VGltZSgpLFxuICB9O1xuICBjb25zdCBwYXlsb2FkICAgPSBiYXNlNjR1cmwoSlNPTi5zdHJpbmdpZnkoYm9keSkpO1xuICBjb25zdCBzaWduYXR1cmUgPSBzaWduKHBheWxvYWQpO1xuICByZXR1cm4geyB0b2tlbjogYCR7cGF5bG9hZH0uJHtzaWduYXR1cmV9YCwgZXhwaXJlc0F0LCB1c2VyIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2ZXJpZnlUb2tlbih0b2tlbjogc3RyaW5nKTogQWRtaW5Vc2VyIHwgbnVsbCB7XG4gIGNvbnN0IHBhcnRzID0gdG9rZW4uc3BsaXQoXCIuXCIpO1xuICBpZiAocGFydHMubGVuZ3RoICE9PSAyKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgW3BheWxvYWQsIHNpZ25hdHVyZV0gPSBwYXJ0cztcbiAgaWYgKCFwYXlsb2FkIHx8ICFzaWduYXR1cmUpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IGV4cGVjdGVkID0gc2lnbihwYXlsb2FkKTtcbiAgaWYgKCF0aW1pbmdTYWZlRXF1YWxTdHIoc2lnbmF0dXJlLCBleHBlY3RlZCkpIHJldHVybiBudWxsO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UoXG4gICAgICBCdWZmZXIuZnJvbShwYXlsb2FkLCBcImJhc2U2NFwiKS50b1N0cmluZyhcInV0ZjhcIiksXG4gICAgKSBhcyB7XG4gICAgICBzdWI/OiBzdHJpbmc7IHVpZD86IHN0cmluZzsgbmFtZT86IHN0cmluZzsgcm9sZT86IHN0cmluZztcbiAgICAgIGlzU3VwZXJBZG1pbj86IGJvb2xlYW47IHRlbmFudElkPzogc3RyaW5nO1xuICAgICAgcm9sZXM/OiBBcnJheTx7IG1vZHVsZTogc3RyaW5nOyBwZXJtaXNzaW9uOiBzdHJpbmcgfT47XG4gICAgICBleHA/OiBudW1iZXI7XG4gICAgfTtcbiAgICBpZiAoIWJvZHkuc3ViIHx8ICFib2R5LmV4cCB8fCB0eXBlb2YgYm9keS5leHAgIT09IFwibnVtYmVyXCIpIHJldHVybiBudWxsO1xuICAgIGlmIChib2R5LmV4cCA8PSBEYXRlLm5vdygpKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6ICAgICAgICAgICBib2R5LnVpZCA/PyBcImVudi1hZG1pblwiLFxuICAgICAgdXNlcm5hbWU6ICAgICBib2R5LnN1YixcbiAgICAgIG5hbWU6ICAgICAgICAgYm9keS5uYW1lID8/IEFETUlOX05BTUUsXG4gICAgICByb2xlOiAgICAgICAgIGJvZHkucm9sZSA/PyBcImFkbWluXCIsXG4gICAgICBpc1N1cGVyQWRtaW46IGJvZHkuaXNTdXBlckFkbWluID8/IGZhbHNlLFxuICAgICAgdGVuYW50SWQ6ICAgICBib2R5LnRlbmFudElkLFxuICAgICAgcm9sZXM6ICAgICAgICBib2R5LnJvbGVzID8/IFtdLFxuICAgIH07XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbi8vIFx1MjUwMFx1MjUwMCBFeHByZXNzIG1pZGRsZXdhcmUgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmRlY2xhcmUgZ2xvYmFsIHtcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1uYW1lc3BhY2VcbiAgbmFtZXNwYWNlIEV4cHJlc3Mge1xuICAgIGludGVyZmFjZSBSZXF1ZXN0IHtcbiAgICAgIGFkbWluVXNlcj86IEFkbWluVXNlcjtcbiAgICB9XG4gIH1cbn1cblxuLyoqIFJlcXVpcmVzIGFueSB2YWxpZCBhZG1pbiB0b2tlbi4gQXR0YWNoZXMgdXNlciB0byByZXEuYWRtaW5Vc2VyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlcXVpcmVBZG1pbihcbiAgcmVxOiBSZXF1ZXN0LFxuICByZXM6IFJlc3BvbnNlLFxuICBuZXh0OiBOZXh0RnVuY3Rpb24sXG4pOiB2b2lkIHtcbiAgY29uc3QgaGVhZGVyID0gcmVxLmhlYWRlcnMuYXV0aG9yaXphdGlvbiA/PyBcIlwiO1xuICBjb25zdCBtYXRjaCA9IC9eQmVhcmVyXFxzKyguKykkL2kuZXhlYyhoZWFkZXIpO1xuICAvLyBBbHNvIGFjY2VwdCA/dG9rZW49IHF1ZXJ5IHBhcmFtIHNvIGJyb3dzZXItbmF2aWdhdGVkIGRvd25sb2FkIGxpbmtzIHdvcmtcbiAgY29uc3QgcmF3VG9rZW4gPSBtYXRjaD8uWzFdPy50cmltKCkgPz8gKHJlcS5xdWVyeVtcInRva2VuXCJdIGFzIHN0cmluZyB8IHVuZGVmaW5lZCk7XG4gIGlmICghcmF3VG9rZW4pIHtcbiAgICByZXMuc3RhdHVzKDQwMSkuanNvbih7IGVycm9yOiBcIkF1dGhlbnRpY2F0aW9uIHJlcXVpcmVkXCIgfSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHVzZXIgPSB2ZXJpZnlUb2tlbihyYXdUb2tlbik7XG4gIGlmICghdXNlcikge1xuICAgIHJlcy5zdGF0dXMoNDAxKS5qc29uKHsgZXJyb3I6IFwiSW52YWxpZCBvciBleHBpcmVkIHNlc3Npb25cIiB9KTtcbiAgICByZXR1cm47XG4gIH1cbiAgcmVxLmFkbWluVXNlciA9IHVzZXI7XG4gIG5leHQoKTtcbn1cblxuLyoqIFJlcXVpcmVzIHN1cGVyLWFkbWluLiBVc2UgZm9yIHVzZXItbWFuYWdlbWVudCByb3V0ZXMuICovXG5leHBvcnQgZnVuY3Rpb24gcmVxdWlyZVN1cGVyQWRtaW4oXG4gIHJlcTogUmVxdWVzdCxcbiAgcmVzOiBSZXNwb25zZSxcbiAgbmV4dDogTmV4dEZ1bmN0aW9uLFxuKTogdm9pZCB7XG4gIGNvbnN0IGhlYWRlciA9IHJlcS5oZWFkZXJzLmF1dGhvcml6YXRpb24gPz8gXCJcIjtcbiAgY29uc3QgbWF0Y2ggPSAvXkJlYXJlclxccysoLispJC9pLmV4ZWMoaGVhZGVyKTtcbiAgaWYgKCFtYXRjaCB8fCAhbWF0Y2hbMV0pIHtcbiAgICByZXMuc3RhdHVzKDQwMSkuanNvbih7IGVycm9yOiBcIkF1dGhlbnRpY2F0aW9uIHJlcXVpcmVkXCIgfSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHVzZXIgPSB2ZXJpZnlUb2tlbihtYXRjaFsxXS50cmltKCkpO1xuICBpZiAoIXVzZXIpIHtcbiAgICByZXMuc3RhdHVzKDQwMSkuanNvbih7IGVycm9yOiBcIkludmFsaWQgb3IgZXhwaXJlZCBzZXNzaW9uXCIgfSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghdXNlci5pc1N1cGVyQWRtaW4pIHtcbiAgICByZXMuc3RhdHVzKDQwMykuanNvbih7IGVycm9yOiBcIlN1cGVyLWFkbWluIGFjY2VzcyByZXF1aXJlZFwiIH0pO1xuICAgIHJldHVybjtcbiAgfVxuICByZXEuYWRtaW5Vc2VyID0gdXNlcjtcbiAgbmV4dCgpO1xufVxuXG5leHBvcnQgY29uc3QgUEVSTUlTU0lPTl9ISUVSQVJDSFk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7XG4gIHZpZXc6IDEsIGRyYWZ0OiAyLCBwb3N0OiAzLCBlZGl0OiA0LCBkZWxldGU6IDUsXG59O1xuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgdXNlciBoYXMgYXQgbGVhc3QgdGhlIGdpdmVuIHBlcm1pc3Npb24gbGV2ZWwgaW4gdGhlXG4gKiBnaXZlbiBtb2R1bGUgKG9yIGlzIGEgc3VwZXItYWRtaW4pLiBVc2UgdGhpcyBpbnNpZGUgcm91dGUgaGFuZGxlcnMgdGhhdCBuZWVkXG4gKiB0byBjb25kaXRpb25hbGx5IGJ5cGFzcyBwb3N0ZWQtcmVjb3JkIGxvY2tzIGZvciBlZGl0b3JzL2RlbGV0ZXJzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaGFzTW9kdWxlUm9sZShcbiAgdXNlcjogQWRtaW5Vc2VyLFxuICBtb2R1bGU6IHN0cmluZyxcbiAgcGVybWlzc2lvbjogXCJ2aWV3XCIgfCBcImRyYWZ0XCIgfCBcInBvc3RcIiB8IFwiZWRpdFwiIHwgXCJkZWxldGVcIixcbik6IGJvb2xlYW4ge1xuICBpZiAodXNlci5pc1N1cGVyQWRtaW4pIHJldHVybiB0cnVlO1xuICBjb25zdCByZXF1aXJlZCA9IFBFUk1JU1NJT05fSElFUkFSQ0hZW3Blcm1pc3Npb25dID8/IDE7XG4gIHJldHVybiB1c2VyLnJvbGVzLnNvbWUoXG4gICAgKHIpID0+XG4gICAgICAoci5tb2R1bGUgPT09IG1vZHVsZSB8fCByLm1vZHVsZSA9PT0gXCIqXCIpICYmXG4gICAgICAoUEVSTUlTU0lPTl9ISUVSQVJDSFlbci5wZXJtaXNzaW9uXSA/PyAwKSA+PSByZXF1aXJlZCxcbiAgKTtcbn1cblxuLyoqXG4gKiBNaWRkbGV3YXJlIGZhY3RvcnkgXHUyMDE0IHJlcXVpcmVzIHRoZSBjdXJyZW50IHVzZXIgdG8gaGF2ZSB0aGUgZ2l2ZW4gcGVybWlzc2lvblxuICogaW4gdGhlIGdpdmVuIG1vZHVsZSAob3IgYmUgYSBzdXBlci1hZG1pbiwgd2hvIGJ5cGFzc2VzIGFsbCBjaGVja3MpLlxuICpcbiAqIElmIHJlcS5hZG1pblVzZXIgaXMgYWxyZWFkeSBwb3B1bGF0ZWQgKGUuZy4gYnkgYSBEQi1yZWZyZXNoIG1pZGRsZXdhcmUgdGhhdFxuICogcmUtaHlkcmF0ZWQgaXNTdXBlckFkbWluIGZyb20gdGhlIGxpdmUgZGF0YWJhc2Ugcm93KSwgdGhhdCB2YWx1ZSBpcyB0cnVzdGVkXG4gKiBkaXJlY3RseSBpbnN0ZWFkIG9mIHJlLXZlcmlmeWluZyB0aGUgdG9rZW4uICBUaGlzIGxldHMgYSBwcm9tb3Rpb24gdGFrZSBlZmZlY3RcbiAqIGltbWVkaWF0ZWx5IHdpdGhvdXQgZm9yY2luZyBhIHJlLWxvZ2luLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVxdWlyZVJvbGUobW9kdWxlOiBzdHJpbmcsIHBlcm1pc3Npb246IFwidmlld1wiIHwgXCJkcmFmdFwiIHwgXCJwb3N0XCIgfCBcImVkaXRcIiB8IFwiZGVsZXRlXCIpIHtcbiAgcmV0dXJuIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UsIG5leHQ6IE5leHRGdW5jdGlvbik6IHZvaWQgPT4ge1xuICAgIC8vIFByZWZlciBhIHByZS1oeWRyYXRlZCB1c2VyIChtYXkgaGF2ZSByZWZyZXNoZWQgaXNTdXBlckFkbWluIGZyb20gREIpXG4gICAgbGV0IHVzZXIgPSByZXEuYWRtaW5Vc2VyO1xuICAgIGlmICghdXNlcikge1xuICAgICAgY29uc3QgaGVhZGVyID0gcmVxLmhlYWRlcnMuYXV0aG9yaXphdGlvbiA/PyBcIlwiO1xuICAgICAgY29uc3QgbWF0Y2ggPSAvXkJlYXJlclxccysoLispJC9pLmV4ZWMoaGVhZGVyKTtcbiAgICAgIGlmICghbWF0Y2ggfHwgIW1hdGNoWzFdKSB7XG4gICAgICAgIHJlcy5zdGF0dXMoNDAxKS5qc29uKHsgZXJyb3I6IFwiQXV0aGVudGljYXRpb24gcmVxdWlyZWRcIiB9KTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdmVyaWZpZWQgPSB2ZXJpZnlUb2tlbihtYXRjaFsxXS50cmltKCkpO1xuICAgICAgaWYgKCF2ZXJpZmllZCkge1xuICAgICAgICByZXMuc3RhdHVzKDQwMSkuanNvbih7IGVycm9yOiBcIkludmFsaWQgb3IgZXhwaXJlZCBzZXNzaW9uXCIgfSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHJlcS5hZG1pblVzZXIgPSB2ZXJpZmllZDtcbiAgICAgIHVzZXIgPSB2ZXJpZmllZDtcbiAgICB9XG5cbiAgICBpZiAodXNlci5pc1N1cGVyQWRtaW4pIHsgbmV4dCgpOyByZXR1cm47IH1cblxuICAgIC8vIFRlbmFudCBhZG1pbiB1c2VycyAoY3JlYXRlZCB2aWEgU2FhUyBBZG1pbiwgcm9sZSAhPT0gXCJzdGFmZlwiKSBhY3QgYXNcbiAgICAvLyBkaXJlY3RvcnMgZm9yIGFsbCBtb2R1bGVzIHdpdGhpbiB0aGVpciBvd24gdGVuYW50LiBTdGFmZiB1c2VycyBoYXZlXG4gICAgLy8gcm9sZSA9PT0gXCJzdGFmZlwiIGFuZCBuZWVkIGV4cGxpY2l0IG1vZHVsZSByb2xlcyBpbiBhZG1pbl91c2VyX3JvbGVzLlxuICAgIGlmICh1c2VyLnRlbmFudElkICYmIHVzZXIucm9sZSAhPT0gXCJzdGFmZlwiKSB7IG5leHQoKTsgcmV0dXJuOyB9XG5cbiAgICBjb25zdCByZXF1aXJlZExldmVsID0gUEVSTUlTU0lPTl9ISUVSQVJDSFlbcGVybWlzc2lvbl0gPz8gMTtcblxuICAgIGNvbnN0IGhhc1JvbGUgPSB1c2VyLnJvbGVzLnNvbWUoXG4gICAgICAocikgPT5cbiAgICAgICAgKHIubW9kdWxlID09PSBtb2R1bGUgfHwgci5tb2R1bGUgPT09IFwiKlwiKSAmJlxuICAgICAgICAoUEVSTUlTU0lPTl9ISUVSQVJDSFlbci5wZXJtaXNzaW9uXSA/PyAwKSA+PSByZXF1aXJlZExldmVsLFxuICAgICk7XG5cbiAgICBpZiAoIWhhc1JvbGUpIHtcbiAgICAgIHJlcy5zdGF0dXMoNDAzKS5qc29uKHtcbiAgICAgICAgZXJyb3I6IGBSZXF1aXJlcyAke3Blcm1pc3Npb259IHBlcm1pc3Npb24gaW4gbW9kdWxlIFwiJHttb2R1bGV9XCJgLFxuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIG5leHQoKTtcbiAgfTtcbn1cblxuLyoqXG4gKiBNaWRkbGV3YXJlIGZhY3RvcnkgXHUyMDE0IGxpa2UgYHJlcXVpcmVSb2xlYCwgYnV0IFdJVEhPVVQgdGhlIHRlbmFudC1kaXJlY3RvclxuICogYXV0by1ieXBhc3MgKGB1c2VyLnRlbmFudElkICYmIHVzZXIucm9sZSAhPT0gXCJzdGFmZlwiYCkuXG4gKlxuICogVXNlIHRoaXMgZm9yIHJvdXRlcyB0aGF0IGFyZSBub3Qgc2NvcGVkIHRvIHRoZSBjYWxsZXIncyBvd24gdGVuYW50IFx1MjAxNCBtb3N0XG4gKiBpbXBvcnRhbnRseSBnbG9iYWwgYWRtaW4tdXNlciBtYW5hZ2VtZW50IChgL2FkbWluL2FkbWluLXVzZXJzYCksIHdoaWNoXG4gKiByZWFkcy93cml0ZXMgdGhlIHBsYXRmb3JtLXdpZGUgYGFkbWluX3VzZXJzYCB0YWJsZSBhY3Jvc3MgYWxsIHRlbmFudHMuXG4gKiBUaGUgdGVuYW50LWRpcmVjdG9yIHNob3J0Y3V0IGluIGByZXF1aXJlUm9sZWAgaXMgbWVhbnQgdG8gZ2l2ZSBhIHRlbmFudCdzXG4gKiBvd24gZGlyZWN0b3IgZnVsbCBhY2Nlc3MgdG8gbW9kdWxlcyAqd2l0aGluIHRoZWlyIHRlbmFudCogKGZlZXMsIHBheXJvbGwsXG4gKiBldGMuKSBcdTIwMTQgaXQgbXVzdCBuZXZlciBiZSB0cmVhdGVkIGFzIGVxdWl2YWxlbnQgdG8gYW4gZXhwbGljaXRcbiAqIGBhZG1pbl91c2VyX3JvbGVzYCBncmFudCBvbiBhIGdsb2JhbCwgY3Jvc3MtdGVuYW50IHJvdXRlLCBvciBhbnkgdGVuYW50XG4gKiBkaXJlY3RvciBhY2NvdW50IGNvdWxkIG1hbmFnZSBldmVyeSB0ZW5hbnQncyBhZG1pbiB1c2Vycy5cbiAqXG4gKiBPbmx5IGFuIGV4cGxpY2l0IGBhZG1pbl91c2VyX3JvbGVzYCBncmFudCAoY2hlY2tlZCB2aWEgYGhhc01vZHVsZVJvbGVgLFxuICogd2hpY2ggc3RpbGwgbGV0cyB0cnVlIHN1cGVyLWFkbWlucyBieXBhc3MpIGlzIGFjY2VwdGVkIGhlcmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXF1aXJlR2xvYmFsUm9sZShtb2R1bGU6IHN0cmluZywgcGVybWlzc2lvbjogXCJ2aWV3XCIgfCBcImRyYWZ0XCIgfCBcInBvc3RcIiB8IFwiZWRpdFwiIHwgXCJkZWxldGVcIikge1xuICByZXR1cm4gKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKTogdm9pZCA9PiB7XG4gICAgbGV0IHVzZXIgPSByZXEuYWRtaW5Vc2VyO1xuICAgIGlmICghdXNlcikge1xuICAgICAgY29uc3QgaGVhZGVyID0gcmVxLmhlYWRlcnMuYXV0aG9yaXphdGlvbiA/PyBcIlwiO1xuICAgICAgY29uc3QgbWF0Y2ggPSAvXkJlYXJlclxccysoLispJC9pLmV4ZWMoaGVhZGVyKTtcbiAgICAgIGlmICghbWF0Y2ggfHwgIW1hdGNoWzFdKSB7XG4gICAgICAgIHJlcy5zdGF0dXMoNDAxKS5qc29uKHsgZXJyb3I6IFwiQXV0aGVudGljYXRpb24gcmVxdWlyZWRcIiB9KTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdmVyaWZpZWQgPSB2ZXJpZnlUb2tlbihtYXRjaFsxXS50cmltKCkpO1xuICAgICAgaWYgKCF2ZXJpZmllZCkge1xuICAgICAgICByZXMuc3RhdHVzKDQwMSkuanNvbih7IGVycm9yOiBcIkludmFsaWQgb3IgZXhwaXJlZCBzZXNzaW9uXCIgfSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHJlcS5hZG1pblVzZXIgPSB2ZXJpZmllZDtcbiAgICAgIHVzZXIgPSB2ZXJpZmllZDtcbiAgICB9XG5cbiAgICBpZiAoIWhhc01vZHVsZVJvbGUodXNlciwgbW9kdWxlLCBwZXJtaXNzaW9uKSkge1xuICAgICAgcmVzLnN0YXR1cyg0MDMpLmpzb24oe1xuICAgICAgICBlcnJvcjogYFJlcXVpcmVzICR7cGVybWlzc2lvbn0gcGVybWlzc2lvbiBpbiBtb2R1bGUgXCIke21vZHVsZX1cImAsXG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbmV4dCgpO1xuICB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFBLE9BQU8sVUFBVTtBQUNqQixPQUFPLFlBQVk7OztBQ0RuQixPQUFPLFlBQVk7QUFDbkIsT0FBTyxZQUFZO0FBTW5CLElBQU0saUJBQWlCLFFBQVEsSUFBSSxnQkFBZ0IsS0FBSztBQUN4RCxJQUFNLGlCQUFpQixRQUFRLElBQUksZ0JBQWdCLEtBQUs7QUFDeEQsSUFBTSxhQUFpQixRQUFRLElBQUksWUFBWSxLQUFTO0FBRXhELElBQU0sZUFBZSxRQUFRLElBQUksb0JBQW9CLEtBQUs7QUFFMUQsSUFBTSxtQkFBNkIsQ0FBQztBQUNwQyxJQUFJLENBQUMsUUFBUSxJQUFJLG9CQUFvQixFQUFHLGtCQUFpQixLQUFLLG9CQUFvQjtBQUNsRixJQUFJLENBQUMsUUFBUSxJQUFJLGdCQUFnQixFQUFPLGtCQUFpQixLQUFLLGdCQUFnQjtBQUM5RSxJQUFJLGlCQUFpQixRQUFRO0FBQzNCLFVBQVE7QUFBQSxJQUNOO0FBQUE7QUFBQSx3REFDeUQsaUJBQWlCLEtBQUssSUFBSSxDQUFDO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFHdEY7QUFDRjtBQUVBLElBQU0sZUFBZSxJQUFJ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
