/**
 * In-process cache + resolver for per-tenant payment gateway credentials.
 *
 * Resolution order (per credential):
 *   1. DB row for the tenant (admin-configured), decrypted with AES-256-GCM
 *   2. Environment variable fallback (legacy / platform-level config)
 *
 * This means existing env-var credentials keep working until the admin
 * explicitly saves a DB row, and a DB row always wins once set.
 */
import { db, gatewayCredentialsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decryptCredential } from "./credential-crypto.js";
import type { GatewayMode } from "./payments/gateways.js";

export type ResolvedJazzCashConfig = {
  merchantId:    string | undefined;
  password:      string | undefined;
  integritySalt: string | undefined;
  mode:          GatewayMode;
  configured:    boolean;
  postUrl:       string;
};

export type ResolvedPayFastConfig = {
  merchantId:    string | undefined;
  securedKey:    string | undefined;
  merchantName:  string;
  mode:          GatewayMode;
  configured:    boolean;
  tokenUrl:      string;
  postUrl:       string;
};

export type ResolvedGatewayCredentials = {
  jazzcash: ResolvedJazzCashConfig;
  payfast:  ResolvedPayFastConfig;
};

const cache = new Map<string, { data: ResolvedGatewayCredentials; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 1000;

export function invalidateGatewayCredentialsCache(tenantId: string): void {
  cache.delete(tenantId);
}

function envMode(envKey: string): GatewayMode {
  return (process.env[envKey] || "").toLowerCase() === "live" ? "live" : "sandbox";
}

function parseMode(raw: string | null | undefined): GatewayMode {
  return (raw || "").toLowerCase() === "live" ? "live" : "sandbox";
}

function orEnv(dbVal: string | null | undefined, envKey: string): string | undefined {
  const v = decryptCredential(dbVal);
  if (v) return v;
  return process.env[envKey]?.trim() || undefined;
}

export async function resolveGatewayCredentials(tenantId: string): Promise<ResolvedGatewayCredentials> {
  const now = Date.now();
  const hit = cache.get(tenantId);
  if (hit && hit.expiresAt > now) return hit.data;

  const [row] = await db
    .select()
    .from(gatewayCredentialsTable)
    .where(eq(gatewayCredentialsTable.tenantId, tenantId))
    .limit(1);

  // JazzCash
  const jcMerchantId    = orEnv(row?.jazzcashMerchantId,    "JAZZCASH_MERCHANT_ID");
  const jcPassword      = orEnv(row?.jazzcashPassword,      "JAZZCASH_PASSWORD");
  const jcSalt          = orEnv(row?.jazzcashIntegritySalt, "JAZZCASH_INTEGRITY_SALT");
  const jcMode: GatewayMode = row
    ? parseMode(row.jazzcashMode)
    : envMode("JAZZCASH_MODE");

  const jcPostUrl =
    jcMode === "live"
      ? "https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/"
      : "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/";

  const jazzcash: ResolvedJazzCashConfig = {
    merchantId:    jcMerchantId,
    password:      jcPassword,
    integritySalt: jcSalt,
    mode:          jcMode,
    configured:    Boolean(jcMerchantId && jcPassword && jcSalt),
    postUrl:       jcPostUrl,
  };

  // PayFast
  const pfMerchantId   = orEnv(row?.payfastMerchantId,   "PAYFAST_MERCHANT_ID");
  const pfSecuredKey   = orEnv(row?.payfastSecuredKey,   "PAYFAST_SECURED_KEY");
  const pfMerchantName =
    decryptCredential(row?.payfastMerchantName) ||
    process.env.PAYFAST_MERCHANT_NAME?.trim() ||
    "Cadet College Murree";
  const pfMode: GatewayMode = row
    ? parseMode(row.payfastMode)
    : envMode("PAYFAST_MODE");

  const pfHost =
    pfMode === "live" ? "https://ipg1.apps.net.pk" : "https://ipguat.apps.net.pk";

  const payfast: ResolvedPayFastConfig = {
    merchantId:   pfMerchantId,
    securedKey:   pfSecuredKey,
    merchantName: pfMerchantName,
    mode:         pfMode,
    configured:   Boolean(pfMerchantId && pfSecuredKey),
    tokenUrl:     `${pfHost}/Ecommerce/api/Transaction/GetAccessToken`,
    postUrl:      `${pfHost}/Ecommerce/api/Transaction/PostTransaction`,
  };

  const data: ResolvedGatewayCredentials = { jazzcash, payfast };
  cache.set(tenantId, { data, expiresAt: now + CACHE_TTL_MS });
  return data;
}
