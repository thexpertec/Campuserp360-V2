import type { Request } from "express";

// ── Shared payment-gateway helpers ────────────────────────────────────────────
// Config for the two Pakistani gateways we support (PayFast / Bank Alfalah and
// JazzCash). Credentials come from environment secrets so nothing sensitive is
// committed. When a gateway's required secrets are missing it reports as
// unconfigured and the route returns 503 — the manual bank-reference flow is
// unaffected.

export type FeeType = "application" | "admission";
export type Gateway = "payfast" | "jazzcash";

export type GatewayMode = "sandbox" | "live";

function mode(envKey: string): GatewayMode {
  return (process.env[envKey] || "").toLowerCase() === "live" ? "live" : "sandbox";
}

export const jazzcashConfig = () => {
  const merchantId = process.env.JAZZCASH_MERCHANT_ID?.trim();
  const password = process.env.JAZZCASH_PASSWORD?.trim();
  const integritySalt = process.env.JAZZCASH_INTEGRITY_SALT?.trim();
  const m = mode("JAZZCASH_MODE");
  return {
    merchantId,
    password,
    integritySalt,
    mode: m,
    configured: Boolean(merchantId && password && integritySalt),
    postUrl:
      m === "live"
        ? "https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/"
        : "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/",
  };
};

export const payfastConfig = () => {
  const merchantId = process.env.PAYFAST_MERCHANT_ID?.trim();
  const securedKey = process.env.PAYFAST_SECURED_KEY?.trim();
  const merchantName = process.env.PAYFAST_MERCHANT_NAME?.trim() || "Cadet College Murree";
  const m = mode("PAYFAST_MODE");
  const host = m === "live" ? "https://ipg1.apps.net.pk" : "https://ipguat.apps.net.pk";
  return {
    merchantId,
    securedKey,
    merchantName,
    mode: m,
    configured: Boolean(merchantId && securedKey),
    tokenUrl: `${host}/Ecommerce/api/Transaction/GetAccessToken`,
    postUrl: `${host}/Ecommerce/api/Transaction/PostTransaction`,
  };
};

/**
 * Public base URL the gateway should redirect the user's browser back to.
 * Gateways need a publicly reachable host, so prefer an explicit env override,
 * then the proxy-forwarded host, then the Replit dev domain, then the raw host.
 */
export function getPublicBaseUrl(req: Request): string {
  const explicit = process.env.PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const fwdHost = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim();
  const fwdProto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() || "https";
  if (fwdHost) return `${fwdProto}://${fwdHost}`;

  const devDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (devDomain) return `https://${devDomain}`;

  const host = req.get("host");
  if (host) return `${req.protocol}://${host}`;

  return "";
}

/** Whole PKR rupee amount for each fee type. Mirrors portal.ts constants. */
export const FEE_AMOUNTS: Record<FeeType, number> = {
  application: 2000,
  admission: 15000,
};

/** Generate a unique transaction reference accepted by both gateways. */
export function makeTxnRef(prefix = "T"): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}${ts}${rand}`;
}
