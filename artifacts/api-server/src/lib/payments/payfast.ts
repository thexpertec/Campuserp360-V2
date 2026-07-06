import crypto from "node:crypto";
import { payfastConfig } from "./gateways.js";
import type { ResolvedPayFastConfig } from "../gateway-credentials-cache.js";

// ── PayFast (Bank Alfalah) hosted checkout ────────────────────────────────────
// Two-step flow:
//   1. Fetch a short-lived ACCESS_TOKEN from the GetAccessToken API.
//   2. POST a form (with that token) to the hosted PostTransaction page where the
//      customer pays; PayFast then redirects the browser back to SUCCESS_URL /
//      FAILURE_URL with response fields (err_code "000"/"00"/"0" = success).
//
// SECURITY: the browser return is NOT trusted on err_code alone — an attacker
// who knows their own basket id could otherwise forge a success. We require the
// gateway-signed `validation_hash` (HMAC-SHA256 keyed by SECURED_KEY) to verify,
// AND the route reconciles the returned amount against our stored transaction.

function orderDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * PayFast request signature: HMAC-SHA256 over MERCHANT_ID + TXNAMT + BASKET_ID
 * keyed by the SECURED_KEY (uppercase hex).
 */
export function computePayFastSignature(
  securedKey: string,
  merchantId: string,
  txnAmt: string,
  basketId: string,
): string {
  return crypto
    .createHmac("sha256", securedKey)
    .update(`${merchantId}${txnAmt}${basketId}`)
    .digest("hex")
    .toUpperCase();
}

/** Step 1 — obtain an access token for a basket/amount. */
export async function getPayFastAccessToken(
  opts: {
    basketId: string;
    amountRupees: number;
  },
  cfg?: ResolvedPayFastConfig,
): Promise<string> {
  const c = cfg ?? payfastConfig();
  if (!c.configured) throw new Error("PayFast is not configured");

  const body = new URLSearchParams({
    MERCHANT_ID: c.merchantId!,
    SECURED_KEY: c.securedKey!,
    BASKET_ID: opts.basketId,
    TXNAMT: opts.amountRupees.toFixed(1),
    CURRENCY_CODE: "PKR",
  });

  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ACCESS_TOKEN?: string;
    code?: string;
    message?: string;
  };
  if (!res.ok || !data.ACCESS_TOKEN) {
    throw new Error(data.message || `PayFast token request failed (${res.status})`);
  }
  return data.ACCESS_TOKEN;
}

export type PayFastCheckout = {
  actionUrl: string;
  fields: Record<string, string>;
};

/** Step 2 — build the form posted to the hosted checkout page. */
export function buildPayFastCheckout(
  opts: {
    token: string;
    amountRupees: number;
    basketId: string;
    description: string;
    customerEmail: string;
    customerMobile: string;
    successUrl: string;
    failureUrl: string;
    checkoutUrl: string;
  },
  cfg?: ResolvedPayFastConfig,
): PayFastCheckout {
  const c = cfg ?? payfastConfig();
  if (!c.configured) throw new Error("PayFast is not configured");

  const txnAmt = opts.amountRupees.toFixed(1);
  const fields: Record<string, string> = {
    MERCHANT_ID: c.merchantId!,
    MERCHANT_NAME: c.merchantName,
    TOKEN: opts.token,
    PROCCODE: "00",
    TXNAMT: txnAmt,
    CUSTOMER_MOBILE_NO: opts.customerMobile,
    CUSTOMER_EMAIL_ADDRESS: opts.customerEmail,
    SIGNATURE: computePayFastSignature(c.securedKey!, c.merchantId!, txnAmt, opts.basketId),
    VERSION: "MERCHANT-CART-0.1",
    TXNDESC: opts.description,
    SUCCESS_URL: opts.successUrl,
    FAILURE_URL: opts.failureUrl,
    BASKET_ID: opts.basketId,
    ORDER_DATE: orderDate(new Date()),
    CHECKOUT_URL: opts.checkoutUrl,
    CURRENCY_CODE: "PKR",
  };
  return { actionUrl: c.postUrl, fields };
}

export type PayFastResult = {
  success: boolean;
  validSignature: boolean;
  responseCode: string;
  responseMessage: string;
  basketId: string;
  gatewayTxnId: string;
  /** Amount echoed back by PayFast, in whole PKR rupees (rounded). */
  amountRupees: number;
};

const SUCCESS_CODES = new Set(["00", "000", "0", "100"]);

function timingSafeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Interpret and authenticate a PayFast return payload.
 *
 * PayFast posts a gateway-signed `validation_hash` (HMAC-SHA256 keyed by the
 * SECURED_KEY) computed over basket_id + err_code + transaction_amount. We
 * recompute it and require an exact match before trusting the result — a
 * payload that lacks (or has a wrong) hash is treated as unverified, so a
 * candidate cannot forge a success by hand-crafting the return URL.
 */
export function verifyPayFastResponse(
  params: Record<string, string>,
  cfg?: ResolvedPayFastConfig,
): PayFastResult {
  const c = cfg ?? payfastConfig();
  const code = (params.err_code || params.Response_Code || params.response_code || "").trim();
  const basketId = params.basket_id || params.BASKET_ID || "";
  const gatewayTxnId = params.transaction_id || params.TRANSACTION_ID || "";
  const amountRaw =
    params.transaction_amount || params.TXNAMT || params.Amount || params.amount || "";
  const amountRupees = Math.round(Number.parseFloat(amountRaw) || 0);

  const received = (params.validation_hash || params.SIGNATURE || params.signature || "")
    .trim()
    .toUpperCase();
  let validSignature = false;
  if (c.securedKey && received) {
    const computed = crypto
      .createHmac("sha256", c.securedKey)
      .update(`${basketId}${code}${amountRaw}`)
      .digest("hex")
      .toUpperCase();
    validSignature = timingSafeEqualHex(computed, received);
  }

  return {
    success: validSignature && SUCCESS_CODES.has(code),
    validSignature,
    responseCode: code,
    responseMessage: params.err_msg || params.Response_Message || "",
    basketId,
    gatewayTxnId,
    amountRupees,
  };
}
