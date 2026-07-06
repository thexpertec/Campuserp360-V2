/**
 * Backfill journal entries for historically confirmed application fees.
 *
 * Calls POST /api/admin/finance/application-fees/backfill-je for each tenant
 * (or a specific tenant when --tenant=<slug> is passed) and prints a summary.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run backfill-app-fee-je
 *   # Or with a specific tenant:
 *   TENANT_SLUG=ccm pnpm --filter @workspace/scripts run backfill-app-fee-je
 *
 * Requires:
 *   API_URL   — base URL of the API server (default: http://localhost:80/api)
 *   ADMIN_TOKEN — a valid admin JWT (super-admin token recommended)
 *   TENANT_SLUG — optional; if set, only processes that tenant
 */

const API_URL    = (process.env.API_URL ?? "http://localhost:80/api").replace(/\/$/, "");
const TOKEN      = process.env.ADMIN_TOKEN ?? "";
const TENANT     = process.env.TENANT_SLUG ?? "";

if (!TOKEN) {
  console.error("ERROR: ADMIN_TOKEN env var is required (a valid admin JWT).");
  process.exit(1);
}

async function backfillForTenant(tenantSlug?: string): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization:  `Bearer ${TOKEN}`,
  };
  if (tenantSlug) headers["X-Tenant-Slug"] = tenantSlug;

  const url = `${API_URL}/admin/finance/application-fees/backfill-je`;
  const label = tenantSlug ? `tenant=${tenantSlug}` : "default tenant";

  console.log(`\nPOST ${url}  [${label}]`);

  const res = await fetch(url, { method: "POST", headers });
  const body = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    console.error(`  ERROR ${res.status}:`, body);
    return;
  }

  const { processed, posted, skipped, errors } = body as {
    processed: number; posted: number; skipped: number; errors: string[];
  };
  console.log(`  processed=${processed}  posted=${posted}  skipped=${skipped}`);
  if (errors && errors.length > 0) {
    console.warn("  Warnings:");
    for (const e of errors) console.warn("    -", e);
  }
}

async function main(): Promise<void> {
  console.log("=== Application Fee JE Backfill ===");
  console.log(`API: ${API_URL}`);

  await backfillForTenant(TENANT || undefined);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
