import crypto from "node:crypto";
import { jazzcashConfig } from "./gateways.js";
import type { ResolvedJazzCashConfig } from "../gateway-credentials-cache.js";

// ── JazzCash hosted checkout (Page Redirect) ──────────────────────────────────
// We POST a signed form to JazzCash's hosted "merchantform" page; the customer
// pays there and JazzCash redirects the browser back (POST) to our return URL
// with the same pp_* fields plus pp_ResponseCode and pp_SecureHash.
// Docs: secure hash = HMAC-SHA256 over the salt + all non-empty pp_/ppmpf_
// values sorted by key, joined with "&", keyed by the integrity salt (hex).

function ymdhms(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/** Compute the JazzCash pp_SecureHash for a set of fields. */
export function computeSecureHash(
  salt: string,
  fields: Record<string, string>,
): string {
  const sortedValues = Object.keys(fields)
    .filter((k) => k !== "pp_SecureHash" && (k.startsWith("pp_") || k.startsWith("ppmpf_")))
    .filter((k) => fields[k] !== undefined && fields[k] !== null && fields[k] !== "")
    .sort()
    .map((k) => fields[k]);
  const toHash = `${salt}&${sortedValues.join("&")}`;
  return crypto.createHmac("sha256", salt).update(toHash).digest("hex");
}

export type JazzCashCheckout = {
  actionUrl: string;
  fields: Record<string, string>;
};

export function buildJazzCashCheckout(
  opts: {
    amountRupees: number;
    txnRef: string;
    returnUrl: string;
    billReference: string;
    description: string;
  },
  cfg?: ResolvedJazzCashConfig,
): JazzCashCheckout {
  const c = cfg ?? jazzcashConfig();
  if (!c.configured) throw new Error("JazzCash is not configured");

  const now = new Date();
  const expiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const fields: Record<string, string> = {
    pp_Version: "1.1",
    pp_TxnType: "",
    pp_Language: "EN",
    pp_MerchantID: c.merchantId!,
    pp_SubMerchantID: "",
    pp_Password: c.password!,
    pp_BankID: "",
    pp_ProductID: "",
    pp_TxnRefNo: opts.txnRef,
    pp_Amount: String(Math.round(opts.amountRupees * 100)),
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: ymdhms(now),
    pp_BillReference: opts.billReference,
    pp_Description: opts.description,
    pp_TxnExpiryDateTime: ymdhms(expiry),
    pp_ReturnURL: opts.returnUrl,
    ppmpf_1: opts.billReference,
  };

  fields.pp_SecureHash = computeSecureHash(c.integritySalt!, fields);
  return { actionUrl: c.postUrl, fields };
}

export type JazzCashResult = {
  success: boolean;
  validSignature: boolean;
  responseCode: string;
  responseMessage: string;
  txnRef: string;
  gatewayTxnId: string;
  /** Amount echoed back by JazzCash, in paisa (1 PKR = 100 paisa). */
  amountPaisa: number;
};

/** Verify a JazzCash return payload and report the outcome. */
export function verifyJazzCashResponse(
  params: Record<string, string>,
  cfg?: ResolvedJazzCashConfig,
): JazzCashResult {
  const c = cfg ?? jazzcashConfig();
  const expected = c.integritySalt
    ? computeSecureHash(c.integritySalt, params)
    : "";
  const received = (params.pp_SecureHash || "").toLowerCase();
  const validSignature = Boolean(expected) && expected.toLowerCase() === received;
  const responseCode = params.pp_ResponseCode || "";
  return {
    success: validSignature && responseCode === "000",
    validSignature,
    responseCode,
    responseMessage: params.pp_ResponseMessage || "",
    txnRef: params.pp_TxnRefNo || "",
    gatewayTxnId: params.pp_RetreivalReferenceNo || params.pp_AuthCode || "",
    amountPaisa: Number.parseInt(params.pp_Amount || "0", 10) || 0,
  };
}
