/**
 * smoke-test-api-isolation.mjs
 *
 * API-level two-tenant isolation validation.
 * Mints admin tokens for two real tenants, then makes HTTP requests to the
 * running dev API server and verifies cross-tenant data isolation.
 *
 * Run: node artifacts/api-server/scripts/smoke-test-api-isolation.mjs
 *
 * Requires: API server running on port 8080 (pnpm dev or build+start).
 *           NEON_DATABASE_URL in env (to fetch real tenant IDs).
 *           ADMIN_TOKEN_SECRET in env (or uses known dev default).
 *           ADMIN_API_PORT=8080 override if needed.
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import http from "http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireFromDb = createRequire(
  path.resolve(__dirname, "../../../lib/db/package.json")
);
const pg = requireFromDb("pg");

// Load env from .env if not in process.env
if (!process.env.NEON_DATABASE_URL) {
  const envFile = path.resolve(__dirname, "../../../.env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const API_PORT   = process.env.ADMIN_API_PORT ?? "8080";
const API_BASE   = `http://localhost:${API_PORT}/api`;
// Use same default as admin-auth.ts so tests work without env secret being set
const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET ?? "ccm-admin-dev-secret-change-me";

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
    failures.push(label);
  }
}

// ── Token minting (mirrors admin-auth.ts logic exactly) ──────────────────────

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(payload) {
  return base64url(
    crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest()
  );
}

function mintToken({ id, username, name, tenantId, isSuperAdmin = false, roles = [] }) {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const body = { sub: username, uid: id, name, role: "admin", isSuperAdmin, tenantId, roles, exp };
  const payload   = base64url(JSON.stringify(body));
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function request(method, path, token, body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const options = {
      hostname: "localhost",
      port: API_PORT,
      path: `/api${path}`,
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(postData ? { "Content-Length": Buffer.byteLength(postData) } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== API-Level Tenant Isolation Smoke Test ===\n");

  // ── 0. Fetch real tenant IDs ─────────────────────────────────────────────
  // Use a dedicated Client (not pool) to ensure a clean role state.
  // Neon's PgBouncer may reuse sessions; RESET ROLE before any query.
  const dbClient = new pg.Client({ connectionString: process.env.NEON_DATABASE_URL });
  let tenantAId, tenantASlug, tenantBId, tenantBSlug;
  try {
    await dbClient.connect();
    await dbClient.query("RESET ROLE"); // Clear any stale SET ROLE from pooler
    const { rows } = await dbClient.query(
      `SELECT id, slug FROM tenants WHERE slug NOT LIKE 'smoke-%' ORDER BY created_at LIMIT 2`
    );
    if (rows.length < 2) {
      console.error("Need at least 2 non-smoke tenants in the DB. Aborting.");
      process.exit(1);
    }
    [{ id: tenantAId, slug: tenantASlug }, { id: tenantBId, slug: tenantBSlug }] = rows;
  } finally {
    await dbClient.end();
  }

  console.log(`Tenant A: ${tenantASlug} (${tenantAId})`);
  console.log(`Tenant B: ${tenantBSlug} (${tenantBId})\n`);

  // ── 1. Mint tokens ───────────────────────────────────────────────────────
  const tokenA = mintToken({
    id:          "smoke-admin-a",
    username:    "smoke-admin-a",
    name:        "Smoke Admin A",
    tenantId:    tenantAId,
    isSuperAdmin: false,
    roles:       [{ module: "fees", permission: "maker" }, { module: "fees", permission: "checker" }],
  });
  const tokenB = mintToken({
    id:          "smoke-admin-b",
    username:    "smoke-admin-b",
    name:        "Smoke Admin B",
    tenantId:    tenantBId,
    isSuperAdmin: false,
    roles:       [{ module: "fees", permission: "maker" }, { module: "fees", permission: "checker" }],
  });

  // ── 2. Verify API server is reachable ────────────────────────────────────
  console.log("── 1. API server health ──");
  try {
    const health = await request("GET", "/health", tokenA);
    assert("API server returns 200 /api/health", health.status === 200, `status=${health.status}`);
  } catch (err) {
    console.error(`  ✗ FATAL: API server not reachable at ${API_BASE} — ${err.message}`);
    console.error("  Start the dev server first: pnpm --filter @workspace/api-server run dev");
    process.exit(1);
  }

  // ── 3. Fee types: each token sees only its own tenant ────────────────────
  console.log("\n── 2. Fee types isolation ──");
  const [ftA, ftB] = await Promise.all([
    request("GET", "/admin/fee-types", tokenA),
    request("GET", "/admin/fee-types", tokenB),
  ]);

  assert("Token-A fee-types returns 200", ftA.status === 200, `status=${ftA.status}`);
  assert("Token-B fee-types returns 200", ftB.status === 200, `status=${ftB.status}`);

  const feeIdsA = new Set((Array.isArray(ftA.body) ? ftA.body : []).map(r => r.id));
  const feeIdsB = new Set((Array.isArray(ftB.body) ? ftB.body : []).map(r => r.id));

  // Cross-tenant contamination check: no ID from B should appear in A's response
  const overlap = [...feeIdsA].filter(id => feeIdsB.has(id));
  assert(
    "No fee type IDs overlap between tenant-A and tenant-B responses",
    overlap.length === 0,
    `${overlap.length} shared IDs found: ${overlap.slice(0, 3).join(", ")}`
  );
  console.log(`    tenant-A has ${feeIdsA.size} fee types, tenant-B has ${feeIdsB.size}`);

  // If tenant-A has a fee type, tenant-B token must return 404 for the same ID
  if (feeIdsA.size > 0) {
    const sampleIdA = [...feeIdsA][0];
    // GET a specific resource owned by A using B's token (no single-item endpoint — use list filter)
    // The list endpoint returns tenant-scoped data, so B's list won't contain A's ID
    assert(
      "Tenant-B fee type list does not contain tenant-A fee type ID",
      !feeIdsB.has(sampleIdA),
      `ID ${sampleIdA} found in B's response`
    );
  }

  // ── 4. COA isolation ─────────────────────────────────────────────────────
  console.log("\n── 3. COA isolation ──");
  const [coaA, coaB] = await Promise.all([
    request("GET", "/admin/coa", tokenA),
    request("GET", "/admin/coa", tokenB),
  ]);

  assert("Token-A COA returns 200", coaA.status === 200, `status=${coaA.status}`);
  assert("Token-B COA returns 200", coaB.status === 200, `status=${coaB.status}`);

  const coaIdsA = new Set((Array.isArray(coaA.body) ? coaA.body : []).map(r => r.id));
  const coaIdsB = new Set((Array.isArray(coaB.body) ? coaB.body : []).map(r => r.id));
  const coaOverlap = [...coaIdsA].filter(id => coaIdsB.has(id));
  assert(
    "No COA account IDs overlap between tenant-A and tenant-B responses",
    coaOverlap.length === 0,
    `${coaOverlap.length} shared IDs found: ${coaOverlap.slice(0, 3).join(", ")}`
  );
  console.log(`    tenant-A has ${coaIdsA.size} COA accounts, tenant-B has ${coaIdsB.size}`);

  // ── 5. Fee challans isolation ─────────────────────────────────────────────
  console.log("\n── 4. Fee challans isolation ──");
  const [chA, chB] = await Promise.all([
    request("GET", "/admin/fee-challans", tokenA),
    request("GET", "/admin/fee-challans", tokenB),
  ]);

  assert("Token-A challan list returns 200 or 400", [200, 400].includes(chA.status), `status=${chA.status}`);
  assert("Token-B challan list returns 200 or 400", [200, 400].includes(chB.status), `status=${chB.status}`);

  if (chA.status === 200 && chB.status === 200) {
    const chalIdsA = new Set((Array.isArray(chA.body) ? chA.body : (chA.body?.data ?? [])).map(r => r.id));
    const chalIdsB = new Set((Array.isArray(chB.body) ? chB.body : (chB.body?.data ?? [])).map(r => r.id));
    const chalOverlap = [...chalIdsA].filter(id => chalIdsB.has(id));
    assert(
      "No challan IDs overlap between tenant-A and tenant-B",
      chalOverlap.length === 0,
      `${chalOverlap.length} shared challan IDs found`
    );
    console.log(`    tenant-A has ${chalIdsA.size} challans, tenant-B has ${chalIdsB.size}`);
  }

  // ── 6. Employees isolation ────────────────────────────────────────────────
  console.log("\n── 5. Employees isolation ──");
  const [empA, empB] = await Promise.all([
    request("GET", "/admin/employees", tokenA),
    request("GET", "/admin/employees", tokenB),
  ]);

  assert("Token-A employees returns 200", empA.status === 200, `status=${empA.status}`);
  assert("Token-B employees returns 200", empB.status === 200, `status=${empB.status}`);

  if (empA.status === 200 && empB.status === 200) {
    // Employees endpoint may return an array or a paginated { data:[], total } or { items:[], total }
    function extractIds(body) {
      if (Array.isArray(body)) return body.map(r => r.id);
      if (Array.isArray(body?.data)) return body.data.map(r => r.id);
      if (Array.isArray(body?.items)) return body.items.map(r => r.id);
      return [];
    }
    const empIdsA = new Set(extractIds(empA.body));
    const empIdsB = new Set(extractIds(empB.body));
    const empOverlap = [...empIdsA].filter(id => empIdsB.has(id));
    assert(
      "No employee IDs overlap between tenant-A and tenant-B",
      empOverlap.length === 0,
      `${empOverlap.length} shared employee IDs found`
    );
    console.log(`    tenant-A has ${empIdsA.size} employees, tenant-B has ${empIdsB.size}`);
  }

  // ── 7. Cross-tenant fee challan mutation must be rejected ────────────────
  console.log("\n── 6. Cross-tenant challan mutation rejection ──");
  // Try to mark-paid a non-existent challan ID using token-B
  // resolveChallanTenant checks ownership → must return 403 not 500
  const fakeChallanId = "00000000-0000-0000-0000-000000000001";
  const markPaidResp = await request("PUT", `/admin/fee-challans/${fakeChallanId}/mark-paid`, tokenB, {
    paidAmount: 1000,
    paymentMethod: "cash",
  });
  assert(
    "PUT mark-paid for non-existent challan returns 403 (not 500/200)",
    markPaidResp.status === 403,
    `status=${markPaidResp.status}, body=${JSON.stringify(markPaidResp.body).slice(0, 100)}`
  );

  // bulk-collect with a non-existent challan ID — should skip silently (0 updated)
  const bulkCollectResp = await request(
    "POST",
    "/admin/fee-challans/bulk-collect",
    tokenB,
    {
      date: new Date().toISOString().slice(0, 10),
      entries: [{ challanIds: [fakeChallanId] }],
    }
  );
  // bulk-collect may return 200 (with 0 updated) or 400 (validation)
  // It must NOT return 500 (server error) for unknown IDs
  assert(
    "POST bulk-collect with unknown challan IDs returns non-500",
    bulkCollectResp.status !== 500,
    `status=${bulkCollectResp.status}`
  );
  if (bulkCollectResp.status === 200) {
    assert(
      "Bulk-collect with unknown IDs updates 0 challans",
      bulkCollectResp.body?.updated === 0,
      `updated=${bulkCollectResp.body?.updated}`
    );
  }

  // ── 8. Cross-tenant employee document upload rejection ───────────────────
  console.log("\n── 8. Cross-tenant employee document upload rejection ──");
  // Using a fake employee UUID that almost certainly doesn't exist in either tenant.
  // Token-B trying to upload a document to a fake employee must get 403 (not 500).
  const fakeEmployeeId = "00000000-0000-0000-0000-000000000099";
  const empDocResp = await request("POST", `/admin/employees/${fakeEmployeeId}/documents`, tokenB, {
    fileBase64: Buffer.from("fake").toString("base64"),
    fileName: "test.pdf",
    docType: "other",
  });
  assert(
    "Cross-tenant employee doc upload returns 403 (employee not in tenant)",
    empDocResp.status === 403,
    `status=${empDocResp.status}, body=${JSON.stringify(empDocResp.body).slice(0, 100)}`
  );

  // ── 9. Document download cross-tenant rejection ───────────────────────────
  console.log("\n── 9. Document download cross-tenant rejection ──");
  // Any path under /api/admin/uploads/ for a path that doesn't exist
  // or belongs to another tenant must return 403 or 404, never 200
  const fakeDocPath = `portal-docs/00000000-0000-0000-0000-000000000001/dummy.pdf`;
  const docRespA = await request("GET", `/admin/uploads/${fakeDocPath}`, tokenA);
  const docRespB = await request("GET", `/admin/uploads/${fakeDocPath}`, tokenB);

  assert(
    "Non-existent document returns 403 or 404 for token-A",
    [403, 404].includes(docRespA.status),
    `status=${docRespA.status}`
  );
  assert(
    "Non-existent document returns 403 or 404 for token-B",
    [403, 404].includes(docRespB.status),
    `status=${docRespB.status}`
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(48)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.error("Failed checks:");
    failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  } else {
    console.log("All API isolation checks passed ✓");
    process.exit(0);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
