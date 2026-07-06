import test from "node:test";
import assert from "node:assert/strict";

// ─────────────────────────────────────────────────────────────────────────────
// Portal login tenant-scoping integration tests.
//
// Verifies POST /api/portal/login only authenticates against applications
// belonging to the resolved tenant — never a cross-tenant row with the same
// email/phone.
//
// CI-safe: skipped when the API server is unreachable (API_BASE_URL / :8080).
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:8080";

const SLUG = { ccm: "ccm", goly: "goly-cukoos" } as const;

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

async function portalLogin(
  tenantSlug: string,
  username: string,
  password: string,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${BASE_URL}/api/portal/login?tenant=${tenantSlug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

function appSubmitBody(overrides: Record<string, string> = {}) {
  const suffix = String(Date.now());
  return {
    fullName: "Portal Isolation Test",
    dateOfBirth: "2010-06-15",
    session: "2026",
    classApplying: "8",
    previousMarks: "80",
    presentAddress: "Test Address",
    guardianName: "Test Guardian",
    fatherName: "Test Father",
    guardianMobile: "03001234567",
    parentCnic: "35201-1234567-9",
    studentMobile: `0301${suffix.slice(-7)}`,
    studentEmail: `portal-${suffix}@example.com`,
    ...overrides,
  };
}

test("portal login succeeds on the tenant that owns the application", async (t) => {
  if (!(await isReachable())) return t.skip(`API not reachable at ${BASE_URL}`);

  const { status, json } = await portalLogin(SLUG.ccm, "hamza@example.com", "12345");
  if (status === 401) {
    return t.skip("seeded portal demo account not present in this database");
  }
  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  const user = json["user"] as { ref_id?: string } | undefined;
  assert.ok(user?.ref_id, "login must return a user with ref_id");
  assert.match(user.ref_id!, /^CCM-/);
});

test("portal login returns 401 on a different tenant for credentials owned elsewhere", async (t) => {
  if (!(await isReachable())) return t.skip(`API not reachable at ${BASE_URL}`);

  const owned = await portalLogin(SLUG.ccm, "hamza@example.com", "12345");
  if (owned.status === 401) {
    return t.skip("seeded portal demo account not present in this database");
  }

  const wrongTenant = await portalLogin(SLUG.goly, "hamza@example.com", "12345");
  assert.equal(
    wrongTenant.status,
    401,
    "must not authenticate a CCM-only account on the goly tenant portal",
  );
});

test("portal login with the same email on two tenants returns each tenant's application", async (t) => {
  if (!(await isReachable())) return t.skip(`API not reachable at ${BASE_URL}`);

  const suffix = String(Date.now());
  const sharedEmail = `shared-portal-${suffix}@example.com`;
  const base = appSubmitBody({
    studentEmail: sharedEmail,
    studentMobile: `0302${suffix.slice(-7)}`,
  });

  const ccmSubmit = await fetch(`${BASE_URL}/api/applications?tenant=${SLUG.ccm}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(base),
  });
  const golySubmit = await fetch(`${BASE_URL}/api/applications?tenant=${SLUG.goly}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...base,
      studentMobile: `0303${suffix.slice(-7)}`,
    }),
  });

  if (ccmSubmit.status === 403 || golySubmit.status === 403) {
    return t.skip("admissions window is closed for one or both tenants");
  }
  if (ccmSubmit.status !== 201 || golySubmit.status !== 201) {
    return t.skip(`could not seed cross-tenant applications (ccm=${ccmSubmit.status}, goly=${golySubmit.status})`);
  }

  const ccmCreated = (await ccmSubmit.json()) as { referenceId?: string };
  const golyCreated = (await golySubmit.json()) as { referenceId?: string };
  if (!ccmCreated.referenceId || !golyCreated.referenceId) {
    return t.skip("submission responses missing referenceId");
  }

  const ccmLogin = await portalLogin(SLUG.ccm, sharedEmail, "12345");
  const golyLogin = await portalLogin(SLUG.goly, sharedEmail, "12345");

  assert.equal(ccmLogin.status, 200, `ccm login failed: ${JSON.stringify(ccmLogin.json)}`);
  assert.equal(golyLogin.status, 200, `goly login failed: ${JSON.stringify(golyLogin.json)}`);

  const ccmRef = (ccmLogin.json["user"] as { ref_id?: string } | undefined)?.ref_id;
  const golyRef = (golyLogin.json["user"] as { ref_id?: string } | undefined)?.ref_id;

  assert.equal(ccmRef, ccmCreated.referenceId, "ccm portal must return the ccm application");
  assert.equal(golyRef, golyCreated.referenceId, "goly portal must return the goly application");
  assert.notEqual(ccmRef, golyRef, "each tenant must resolve its own application");
});
