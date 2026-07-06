import test from "node:test";
import assert from "node:assert/strict";
import { issueToken, type AdminUser } from "../lib/admin-auth.js";

// ─────────────────────────────────────────────────────────────────────────────
// Global ID-prefix uniqueness integration tests.
//
// The Candidate Applicant ID prefix and the Enrolled Student Register ID (GR)
// prefix share ONE global pool across all tenants: a code may only ever belong
// to one field of one tenant, matched case-insensitively. These tests exercise
// the live API (GET/PUT /api/admin/settings/gr-format and the check-prefix
// endpoint) and restore the tenant's original settings afterwards.
//
// CI-safe: if the API server is unreachable the suite is skipped, not failed.
// Point it elsewhere with API_BASE_URL.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:8080";

const TENANT = {
  ccm: "c651cd4d-0f61-4a29-8b15-0022275639bb",
  goly: "447c01fa-2cc8-4cf8-90c5-57305b708a1d",
} as const;

function scopedToken(tenantId: string): string {
  const user: AdminUser = {
    id: `test-${tenantId}`,
    username: `admin-${tenantId}`,
    name: "Tenant Admin",
    role: "admin",
    isSuperAdmin: false,
    tenantId,
    roles: [],
  };
  return issueToken(user).token;
}

const TOKEN = {
  ccm: scopedToken(TENANT.ccm),
  goly: scopedToken(TENANT.goly),
} as const;

async function api(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = {};
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body };
}

let reachable: boolean | undefined;
async function isReachable(): Promise<boolean> {
  if (reachable !== undefined) return reachable;
  try {
    const res = await fetch(`${BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(2500),
    });
    reachable = res.ok;
  } catch {
    reachable = false;
  }
  return reachable;
}

test("global ID prefix uniqueness across applicant + register prefixes and tenants", async (t) => {
  if (!(await isReachable())) return t.skip(`API not reachable at ${BASE_URL}`);

  const origCcm = await api("/api/admin/settings/gr-format", TOKEN.ccm);
  const origGoly = await api("/api/admin/settings/gr-format", TOKEN.goly);
  assert.equal(origCcm.status, 200);
  assert.equal(origGoly.status, 200);

  await t.test("GET returns a candidate format object", () => {
    assert.ok(origCcm.body.candidate, "response includes candidate format");
    assert.ok(
      typeof origCcm.body.candidate.prefix === "string" && origCcm.body.candidate.prefix.length > 0,
      "candidate format has a prefix",
    );
  });

  // Unique throwaway prefixes for this run.
  const run = Date.now().toString(36).toUpperCase().slice(-4);
  const CCM_GR = `TG${run}`;
  const CCM_CAND = `TC${run}`;
  const GOLY_GR = `TH${run}`;

  try {
    await t.test("PUT rejects candidate prefix equal to own register prefix (case-insensitive)", async () => {
      const res = await api("/api/admin/settings/gr-format", TOKEN.ccm, {
        method: "PUT",
        body: JSON.stringify({
          ...origCcm.body,
          prefix: CCM_GR,
          candidate: { ...origCcm.body.candidate, prefix: CCM_GR.toLowerCase() },
        }),
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.field, "candidate");
    });

    await t.test("PUT saves the candidate prefix and GET returns it", async () => {
      const res = await api("/api/admin/settings/gr-format", TOKEN.ccm, {
        method: "PUT",
        body: JSON.stringify({
          ...origCcm.body,
          prefix: CCM_GR,
          candidate: { ...origCcm.body.candidate, prefix: CCM_CAND },
        }),
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const after = await api("/api/admin/settings/gr-format", TOKEN.ccm);
      assert.equal(after.body.prefix, CCM_GR);
      assert.equal(after.body.candidate.prefix, CCM_CAND);
    });

    await t.test("another tenant cannot take an existing REGISTER prefix as its register prefix", async () => {
      const res = await api("/api/admin/settings/gr-format", TOKEN.goly, {
        method: "PUT",
        body: JSON.stringify({
          ...origGoly.body,
          prefix: CCM_GR.toLowerCase(),
          candidate: { ...origGoly.body.candidate, prefix: GOLY_GR + "X" },
        }),
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.field, "gr");
    });

    await t.test("another tenant cannot take an existing CANDIDATE prefix as its register prefix (cross-field)", async () => {
      const res = await api("/api/admin/settings/gr-format", TOKEN.goly, {
        method: "PUT",
        body: JSON.stringify({
          ...origGoly.body,
          prefix: CCM_CAND,
          candidate: { ...origGoly.body.candidate, prefix: GOLY_GR + "X" },
        }),
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.field, "gr");
    });

    await t.test("another tenant cannot take an existing REGISTER prefix as its candidate prefix (cross-field)", async () => {
      const res = await api("/api/admin/settings/gr-format", TOKEN.goly, {
        method: "PUT",
        body: JSON.stringify({
          ...origGoly.body,
          prefix: GOLY_GR,
          candidate: { ...origGoly.body.candidate, prefix: CCM_GR },
        }),
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.field, "candidate");
    });

    await t.test("check-prefix reports taken prefixes for both fields, case-insensitively", async () => {
      const asGr = await api(
        `/api/admin/settings/gr-format/check-prefix?prefix=${CCM_CAND.toLowerCase()}&field=gr`,
        TOKEN.goly,
      );
      assert.equal(asGr.body.available, false, "candidate prefix blocks other tenant's gr prefix");

      const asCand = await api(
        `/api/admin/settings/gr-format/check-prefix?prefix=${CCM_GR}&field=candidate`,
        TOKEN.goly,
      );
      assert.equal(asCand.body.available, false, "gr prefix blocks other tenant's candidate prefix");

      const own = await api(
        `/api/admin/settings/gr-format/check-prefix?prefix=${CCM_GR}&field=gr`,
        TOKEN.ccm,
      );
      assert.equal(own.body.available, true, "a tenant's own saved prefix stays available to itself");

      const sibling = await api(
        `/api/admin/settings/gr-format/check-prefix?prefix=${CCM_CAND}&field=gr`,
        TOKEN.ccm,
      );
      assert.equal(sibling.body.available, false, "sibling field within same tenant conflicts");

      const free = await api(
        `/api/admin/settings/gr-format/check-prefix?prefix=ZZ${run}Q&field=candidate`,
        TOKEN.goly,
      );
      assert.equal(free.body.available, true, "an unused prefix is available");
    });

    await t.test("tenant slugs are part of the global pool", async () => {
      // Another tenant's slug is not available as a prefix (case-insensitive).
      const otherSlug = await api(
        "/api/admin/settings/gr-format/check-prefix?prefix=goly-cukoos&field=gr",
        TOKEN.ccm,
      );
      assert.equal(otherSlug.body.available, false, "another tenant's slug blocks the prefix");

      // A tenant's OWN slug never conflicts with its own prefixes.
      const ownSlug = await api(
        "/api/admin/settings/gr-format/check-prefix?prefix=GOLY-CUKOOS&field=gr",
        TOKEN.goly,
      );
      assert.equal(ownSlug.body.available, true, "a tenant's own slug stays available to itself");

      // Saving a prefix equal to another tenant's slug is rejected.
      const res = await api("/api/admin/settings/gr-format", TOKEN.goly, {
        method: "PUT",
        body: JSON.stringify({
          ...origGoly.body,
          prefix: "GOLY-CUKOOS",
          candidate: { ...origGoly.body.candidate, prefix: "CCM" },
        }),
      });
      assert.equal(res.status, 409, JSON.stringify(res.body));
      assert.equal(res.body.field, "candidate");
    });

    await t.test("PUT without candidate (legacy client) preserves the saved candidate format", async () => {
      const legacyBody: any = { ...origCcm.body, prefix: CCM_GR };
      delete legacyBody.candidate;
      const res = await api("/api/admin/settings/gr-format", TOKEN.ccm, {
        method: "PUT",
        body: JSON.stringify(legacyBody),
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const after = await api("/api/admin/settings/gr-format", TOKEN.ccm);
      assert.equal(after.body.candidate.prefix, CCM_CAND, "candidate format survives legacy save");
    });
  } finally {
    // Only the ccm tenant is ever successfully modified above (every goly PUT
    // is expected to 409), so only ccm needs restoring. Try a full restore
    // first; if the original candidate value (GET fills in defaults even when
    // nothing was saved) now conflicts, fall back to restoring just the
    // register-format fields via a legacy-style PUT.
    let restore = await api("/api/admin/settings/gr-format", TOKEN.ccm, {
      method: "PUT",
      body: JSON.stringify(origCcm.body),
    });
    if (restore.status === 409) {
      const legacy: any = { ...origCcm.body };
      delete legacy.candidate;
      restore = await api("/api/admin/settings/gr-format", TOKEN.ccm, {
        method: "PUT",
        body: JSON.stringify(legacy),
      });
    }
    assert.equal(restore.status, 200, `ccm restore failed: ${JSON.stringify(restore.body)}`);
  }
});
