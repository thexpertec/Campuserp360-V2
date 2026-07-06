/**
 * Fail fast in production when required secrets still use dev defaults.
 */
export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  if (!process.env["ADMIN_TOKEN_SECRET"]) missing.push("ADMIN_TOKEN_SECRET");
  if (!process.env["PORTAL_TOKEN_SECRET"]) missing.push("PORTAL_TOKEN_SECRET");
  if (!process.env["SAAS_ADMIN_TOKEN_SECRET"] && !process.env["ADMIN_TOKEN_SECRET"]) {
    missing.push("SAAS_ADMIN_TOKEN_SECRET");
  }
  if (!process.env["ADMIN_PASSWORD"]) missing.push("ADMIN_PASSWORD");
  if (!process.env["SAAS_ADMIN_PASSWORD"]) missing.push("SAAS_ADMIN_PASSWORD");

  if (missing.length > 0) {
    console.error(
      "\nFATAL: Production startup blocked — set these secrets before deploying:\n" +
      missing.map((k) => `  - ${k}`).join("\n") +
      "\n",
    );
    process.exit(1);
  }
}
