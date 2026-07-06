import { Router, type IRouter, type Request, type Response } from "express";
import { db, gatewayCredentialsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth.js";
import { getAdminTenantId } from "../lib/tenant.js";
import {
  resolveGatewayCredentials,
  invalidateGatewayCredentialsCache,
} from "../lib/gateway-credentials-cache.js";
import { encryptCredential, decryptCredential, isEncrypted, isEncryptionAvailable } from "../lib/credential-crypto.js";

const router: IRouter = Router();

/**
 * Mask a sensitive credential value for API responses.
 * - Empty/undefined → ""  (field not set in DB)
 * - Encrypted blob       → "••••••"  (set, but never expose)
 * - Legacy plaintext     → "••••••"  (treat as set; will be encrypted on next save)
 * The UI shows "••••••" when a value is stored and prompts the admin to re-enter if they want to change it.
 */
function maskSecret(stored: string | null | undefined): string {
  if (!stored?.trim()) return "";
  return "••••••";
}

/** Whether a stored value is considered "set" (non-empty). */
function isSet(stored: string | null | undefined): boolean {
  return Boolean(stored?.trim());
}

// ── GET /admin/admissions/gateway-credentials ─────────────────────────────────
// Returns masked credentials (secrets are never returned raw) + configured flag.
router.get(
  "/admin/admissions/gateway-credentials",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

      const [row] = await db
        .select()
        .from(gatewayCredentialsTable)
        .where(eq(gatewayCredentialsTable.tenantId, tenantId))
        .limit(1);

      // Resolved config tells us whether the gateway is currently functional
      const resolved = await resolveGatewayCredentials(tenantId);

      return res.json({
        jazzcash: {
          merchantId:    decryptCredential(row?.jazzcashMerchantId) ?? "",
          password:      maskSecret(row?.jazzcashPassword),
          integritySalt: maskSecret(row?.jazzcashIntegritySalt),
          mode:          row?.jazzcashMode ?? "sandbox",
          configured:    resolved.jazzcash.configured,
          passwordSet:   isSet(row?.jazzcashPassword),
          saltSet:       isSet(row?.jazzcashIntegritySalt),
        },
        payfast: {
          merchantId:   decryptCredential(row?.payfastMerchantId) ?? "",
          securedKey:   maskSecret(row?.payfastSecuredKey),
          merchantName: decryptCredential(row?.payfastMerchantName) ?? "",
          mode:         row?.payfastMode ?? "sandbox",
          configured:   resolved.payfast.configured,
          securedKeySet: isSet(row?.payfastSecuredKey),
        },
      });
    } catch (err) {
      req.log?.error?.({ err }, "Failed to load gateway credentials");
      return res.status(500).json({ error: "Failed to load gateway credentials" });
    }
  },
);

// ── PUT /admin/admissions/gateway-credentials ─────────────────────────────────
// Saves the gateway credentials for the tenant. Secrets are encrypted before storage.
// To clear a credential send an empty string "". Sending the mask "••••••" means
// "keep the existing value" (the UI sends this when the admin did not change a field).
router.put(
  "/admin/admissions/gateway-credentials",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

      const body = req.body as Record<string, unknown>;
      const jc = (body.jazzcash ?? {}) as Record<string, unknown>;
      const pf = (body.payfast ?? {}) as Record<string, unknown>;

      const jcMode = (jc.mode as string | undefined) === "live" ? "live" : "sandbox";
      const pfMode = (pf.mode as string | undefined) === "live" ? "live" : "sandbox";

      // Load existing row so we can preserve unchanged secrets when the UI sends
      // the mask placeholder instead of a real new value.
      const [existing] = await db
        .select()
        .from(gatewayCredentialsTable)
        .where(eq(gatewayCredentialsTable.tenantId, tenantId))
        .limit(1);

      // Determine if any new secret values are being written (not the mask,
      // not empty). If so, require CREDENTIAL_ENCRYPTION_KEY to be set so
      // secrets are never stored in plaintext.
      const MASK = "••••••";
      const newSecrets: string[] = [
        jc.password, jc.integritySalt, pf.securedKey,
      ].filter((v): v is string => typeof v === "string" && v.trim() !== "" && v.trim() !== MASK);

      if (newSecrets.length > 0 && !isEncryptionAvailable()) {
        return res.status(400).json({
          error:
            "CREDENTIAL_ENCRYPTION_KEY is not configured on this server. " +
            "Set a 64-char hex (32-byte) secret in the server environment before saving gateway credentials. " +
            "Mode toggles and merchant IDs can be saved without the key — only password/key/salt fields require it.",
        });
      }

      /**
       * Resolve a secret field value for storage:
       * - mask placeholder ("••••••") → keep existing stored value (unchanged)
       * - empty string                → null (clear the field)
       * - real new value              → encrypt and store (key guaranteed available above)
       */
      function resolveSecret(incoming: unknown, existingStored: string | null | undefined): string | null {
        const v = typeof incoming === "string" ? incoming.trim() : "";
        if (v === MASK) return existingStored ?? null; // unchanged
        if (!v) return null;                           // cleared
        return encryptCredential(v);                   // new value (encrypted)
      }

      /**
       * Resolve a non-secret (visible) field value for storage:
       * - empty string → null
       * - value        → plaintext (non-sensitive: merchant name, merchant ID)
       */
      function resolveVisible(incoming: unknown): string | null {
        const v = typeof incoming === "string" ? incoming.trim() : "";
        return v || null;
      }

      const values = {
        tenantId,
        jazzcashMerchantId:    resolveVisible(jc.merchantId),
        jazzcashPassword:      resolveSecret(jc.password,      existing?.jazzcashPassword),
        jazzcashIntegritySalt: resolveSecret(jc.integritySalt, existing?.jazzcashIntegritySalt),
        jazzcashMode:          jcMode,
        payfastMerchantId:     resolveVisible(pf.merchantId),
        payfastSecuredKey:     resolveSecret(pf.securedKey,    existing?.payfastSecuredKey),
        payfastMerchantName:   resolveVisible(pf.merchantName),
        payfastMode:           pfMode,
      };

      await db
        .insert(gatewayCredentialsTable)
        .values(values)
        .onConflictDoUpdate({
          target: gatewayCredentialsTable.tenantId,
          set: {
            jazzcashMerchantId:    values.jazzcashMerchantId,
            jazzcashPassword:      values.jazzcashPassword,
            jazzcashIntegritySalt: values.jazzcashIntegritySalt,
            jazzcashMode:          values.jazzcashMode,
            payfastMerchantId:     values.payfastMerchantId,
            payfastSecuredKey:     values.payfastSecuredKey,
            payfastMerchantName:   values.payfastMerchantName,
            payfastMode:           values.payfastMode,
            updatedAt:             new Date(),
          },
        });

      invalidateGatewayCredentialsCache(tenantId);
      const resolved = await resolveGatewayCredentials(tenantId);

      return res.json({
        success: true,
        jazzcashConfigured: resolved.jazzcash.configured,
        payfastConfigured:  resolved.payfast.configured,
      });
    } catch (err) {
      req.log?.error?.({ err }, "Failed to save gateway credentials");
      return res.status(500).json({ error: "Failed to save gateway credentials" });
    }
  },
);

export default router;
