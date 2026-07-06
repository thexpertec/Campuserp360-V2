import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import {
  db,
  applicationsTable,
  applicationEventsTable,
  paymentTransactionsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requirePortal } from "../lib/portal-auth";
import {
  FEE_AMOUNTS,
  getPublicBaseUrl,
  jazzcashConfig,
  payfastConfig,
  makeTxnRef,
  type FeeType,
  type Gateway,
} from "../lib/payments/gateways";
import { buildJazzCashCheckout, verifyJazzCashResponse } from "../lib/payments/jazzcash";
import {
  buildPayFastCheckout,
  getPayFastAccessToken,
  verifyPayFastResponse,
} from "../lib/payments/payfast";
import { resolveGatewayCredentials } from "../lib/gateway-credentials-cache.js";
import type { ResolvedGatewayCredentials } from "../lib/gateway-credentials-cache.js";
import { postApplicationFeeJE } from "../lib/je-factory";

const router: IRouter = Router();

const FEE_TYPES: FeeType[] = ["application", "admission"];
const GATEWAYS: Gateway[] = ["payfast", "jazzcash"];

function feeLabel(feeType: FeeType): string {
  return feeType === "admission" ? "Admission Fee" : "Application Fee";
}

// ── POST /portal/payments/initiate ────────────────────────────────────────────
// Body: { feeType: "application" | "admission", gateway: "payfast" | "jazzcash" }
// Returns { actionUrl, fields } that the browser auto-submits to the gateway.
router.post("/portal/payments/initiate", requirePortal, async (req: Request, res: Response) => {
  const { feeType, gateway } = req.body as { feeType?: FeeType; gateway?: Gateway };

  if (!feeType || !FEE_TYPES.includes(feeType)) {
    return res.status(400).json({ error: "Invalid fee type" });
  }
  if (!gateway || !GATEWAYS.includes(gateway)) {
    return res.status(400).json({ error: "Invalid payment gateway" });
  }

  try {
    const [app] = await db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.referenceId, req.portalUser!.referenceId))
      .limit(1);
    if (!app) return res.status(404).json({ error: "Application not found" });

    if (feeType === "application" && app.feeStatus === "paid") {
      return res.status(400).json({ error: "Application fee is already paid" });
    }
    if (feeType === "admission") {
      if (!app.candidateAcceptedAt) {
        return res.status(400).json({ error: "You must accept the offer before paying the admission fee" });
      }
      if (app.admissionFeeStatus === "paid") {
        return res.status(400).json({ error: "Admission fee is already paid" });
      }
    }

    // Resolve credentials for this tenant (DB first, env-var fallback).
    // When tenantId is null (legacy/global applications) fall back to env-var
    // credentials directly so those applications are never broken by this feature.
    let creds: ResolvedGatewayCredentials | null = null;
    if (app.tenantId) {
      creds = await resolveGatewayCredentials(app.tenantId);
    }

    const configured = (() => {
      if (gateway === "jazzcash") {
        return creds ? creds.jazzcash.configured : jazzcashConfig().configured;
      }
      return creds ? creds.payfast.configured : payfastConfig().configured;
    })();

    if (!configured) {
      return res.status(503).json({
        error: `${gateway === "jazzcash" ? "JazzCash" : "PayFast"} online payment is not configured yet. Please use the bank transfer option.`,
      });
    }

    const amount = FEE_AMOUNTS[feeType];
    const txnRef = makeTxnRef("CCM");
    const description = `CCM ${feeLabel(feeType)} — ${app.referenceId}`;

    await db.insert(paymentTransactionsTable).values({
      applicationId: app.id,
      tenantId: app.tenantId ?? null,
      feeType,
      gateway,
      amount,
      txnRef,
      status: "initiated",
    });

    const base = getPublicBaseUrl(req);
    const returnUrl = `${base}/api/payments/${gateway}/return`;

    if (gateway === "jazzcash") {
      const checkout = buildJazzCashCheckout(
        { amountRupees: amount, txnRef, returnUrl, billReference: app.referenceId, description },
        creds?.jazzcash,
      );
      return res.json({ gateway, ...checkout });
    }

    // PayFast
    const token = await getPayFastAccessToken({ basketId: txnRef, amountRupees: amount }, creds?.payfast);
    const checkout = buildPayFastCheckout(
      {
        token,
        amountRupees: amount,
        basketId: txnRef,
        description,
        customerEmail: app.studentEmail,
        customerMobile: app.studentMobile,
        successUrl: returnUrl,
        failureUrl: returnUrl,
        checkoutUrl: returnUrl,
      },
      creds?.payfast,
    );
    return res.json({ gateway, ...checkout });
  } catch (err) {
    req.log?.error?.({ err }, "Payment initiate error");
    return res.status(500).json({ error: "Failed to start the online payment. Please try again." });
  }
});

// ── Gateway return handlers ───────────────────────────────────────────────────
// Gateways redirect the user's browser back here (usually POST form-encoded).
// We verify the payload, mark the fee paid, then 302 the browser to the portal
// with a ?payment=success|failed flag.
const urlencoded = express.urlencoded({ extended: true });

function redirectToPortal(
  req: Request,
  res: Response,
  outcome: "success" | "failed",
  feeType: FeeType | "",
): void {
  const base = getPublicBaseUrl(req);
  const params = new URLSearchParams({ payment: outcome });
  if (feeType) params.set("fee", feeType);
  res.redirect(302, `${base}/portal?${params.toString()}`);
}

async function markPaid(
  txn: typeof paymentTransactionsTable.$inferSelect,
  gatewayTxnId: string,
): Promise<void> {
  const feeType = txn.feeType as FeeType;
  await db
    .update(paymentTransactionsTable)
    .set({
      status: "paid",
      gatewayTxnId,
      paidAt: new Date(),
    })
    .where(eq(paymentTransactionsTable.id, txn.id));

  const [app] = await db
    .select()
    .from(applicationsTable)
    .where(eq(applicationsTable.id, txn.applicationId))
    .limit(1);
  if (!app) return;

  const ref = gatewayTxnId || txn.txnRef;
  if (feeType === "application") {
    if (app.feeStatus === "paid") return;
    await db
      .update(applicationsTable)
      .set({
        feeStatus: "paid",
        feeBankRef: ref,
        feeSubmittedAt: app.feeSubmittedAt ?? new Date(),
        feeConfirmedAt: new Date(),
      })
      .where(eq(applicationsTable.id, app.id));
    await db.insert(applicationEventsTable).values({
      applicationId: app.id,
      eventType: "fee_submitted",
      title: "Application Fee Paid Online",
      description: `Paid via ${txn.gateway === "jazzcash" ? "JazzCash" : "PayFast"}. Transaction: ${ref}.`,
    });
    // Application fee JE: DR tenant-configured bank/cash, CR Application Fee Income (4300)
    const tenantId = txn.tenantId;
    if (tenantId && txn.amount && txn.amount > 0) {
      void postApplicationFeeJE({
        tenantId,
        amount:         txn.amount,
        reference:      ref,
        date:           new Date().toISOString().slice(0, 10),
        sourceRefId:    txn.id,
        description:    "Application fee received",
        narrationDebit: `Via ${txn.gateway}`,
      }).catch((jeErr: unknown) => {
        console.error("[payments] application-fee JE failed:", jeErr);
      });
    }
  } else {
    if (app.admissionFeeStatus === "paid") return;
    await db
      .update(applicationsTable)
      .set({
        admissionFeeStatus: "paid",
        admissionFeeBankRef: ref,
        admissionFeeConfirmedAt: new Date(),
      })
      .where(eq(applicationsTable.id, app.id));
    await db.insert(applicationEventsTable).values({
      applicationId: app.id,
      eventType: "admission_fee_submitted",
      title: "Admission Fee Paid Online",
      description: `Paid via ${txn.gateway === "jazzcash" ? "JazzCash" : "PayFast"}. Transaction: ${ref}.`,
    });
  }
}

async function recordFailure(
  txn: typeof paymentTransactionsTable.$inferSelect,
  code: string,
  message: string,
  raw: string,
): Promise<void> {
  await db
    .update(paymentTransactionsTable)
    .set({ status: "failed", responseCode: code, responseMessage: message, rawResponse: raw })
    .where(eq(paymentTransactionsTable.id, txn.id));
}

// Normalised, gateway-agnostic view of a verified return payload.
type NormalisedReturn = {
  txnRef: string;
  /** Authenticated as success by the gateway (valid signature + success code). */
  success: boolean;
  /** The payload's signature/hash verified against our secret. */
  validSignature: boolean;
  /** Amount the gateway reports, expressed in whole PKR rupees. */
  amountRupees: number;
  responseCode: string;
  responseMessage: string;
  gatewayTxnId: string;
};

function normaliseReturn(
  gateway: Gateway,
  params: Record<string, string>,
  creds?: Awaited<ReturnType<typeof resolveGatewayCredentials>> | null,
): NormalisedReturn {
  if (gateway === "jazzcash") {
    const r = verifyJazzCashResponse(params, creds?.jazzcash);
    return {
      txnRef: r.txnRef,
      success: r.success,
      validSignature: r.validSignature,
      amountRupees: Math.round(r.amountPaisa / 100),
      responseCode: r.responseCode,
      responseMessage: r.responseMessage,
      gatewayTxnId: r.gatewayTxnId,
    };
  }
  const r = verifyPayFastResponse(params, creds?.payfast);
  return {
    txnRef: r.basketId,
    success: r.success,
    validSignature: r.validSignature,
    amountRupees: r.amountRupees,
    responseCode: r.responseCode,
    responseMessage: r.responseMessage,
    gatewayTxnId: r.gatewayTxnId,
  };
}

async function handleReturn(gateway: Gateway, req: Request, res: Response): Promise<void> {
  const params: Record<string, string> = {
    ...(req.query as Record<string, string>),
    ...(req.body as Record<string, string>),
  };
  const raw = JSON.stringify(params);

  try {
    // We need to find the transaction first to get the tenant, then resolve
    // credentials for correct signature verification. Parse the txnRef from params.
    const txnRefParam =
      params.pp_TxnRefNo || params.BASKET_ID || params.basket_id || "";
    let preloadedCreds: Awaited<ReturnType<typeof resolveGatewayCredentials>> | null = null;
    if (txnRefParam) {
      const [earlyTxn] = await db
        .select({ tenantId: paymentTransactionsTable.tenantId })
        .from(paymentTransactionsTable)
        .where(eq(paymentTransactionsTable.txnRef, txnRefParam))
        .limit(1);
      if (earlyTxn?.tenantId) {
        preloadedCreds = await resolveGatewayCredentials(earlyTxn.tenantId);
      }
    }
    const result = normaliseReturn(gateway, params, preloadedCreds);

    const [txn] = await db
      .select()
      .from(paymentTransactionsTable)
      .where(eq(paymentTransactionsTable.txnRef, result.txnRef))
      .limit(1);
    if (!txn) return redirectToPortal(req, res, "failed", "");
    const feeType = txn.feeType as FeeType;

    // Reject a return that arrives on the wrong gateway endpoint.
    if (txn.gateway !== gateway) {
      req.log?.warn?.({ txnRef: txn.txnRef, txnGateway: txn.gateway, gateway }, "Payment return gateway mismatch");
      return redirectToPortal(req, res, "failed", feeType);
    }

    // Idempotency: a transaction only transitions out of "initiated" once.
    if (txn.status === "paid") {
      return redirectToPortal(req, res, "success", feeType);
    }
    if (txn.status !== "initiated") {
      return redirectToPortal(req, res, "failed", feeType);
    }

    // A signed/authenticated success is required before we touch fee status.
    if (!result.success) {
      if (result.validSignature) {
        // Authenticated, gateway-declared failure → terminal "failed".
        await recordFailure(txn, result.responseCode, result.responseMessage, raw);
      } else {
        // Unverified/forged payload — never mutate state, so a later genuine
        // gateway callback can still finalize this still-"initiated" txn.
        req.log?.warn?.(
          { txnRef: txn.txnRef, gateway, code: result.responseCode },
          "Ignoring unverified payment return (no valid signature)",
        );
      }
      return redirectToPortal(req, res, "failed", feeType);
    }

    // Amount reconciliation — the gateway must confirm exactly what we charged.
    if (result.amountRupees !== txn.amount) {
      req.log?.warn?.(
        { txnRef: txn.txnRef, expected: txn.amount, received: result.amountRupees },
        "Payment return amount mismatch",
      );
      await recordFailure(txn, result.responseCode, "Amount mismatch on gateway return", raw);
      return redirectToPortal(req, res, "failed", feeType);
    }

    await db
      .update(paymentTransactionsTable)
      .set({ responseCode: result.responseCode, responseMessage: result.responseMessage, rawResponse: raw })
      .where(eq(paymentTransactionsTable.id, txn.id));
    await markPaid(txn, result.gatewayTxnId);
    return redirectToPortal(req, res, "success", feeType);
  } catch (err) {
    req.log?.error?.({ err }, "Payment return error");
    return redirectToPortal(req, res, "failed", "");
  }
}

router.post("/payments/jazzcash/return", urlencoded, (req, res) => handleReturn("jazzcash", req, res));
router.get("/payments/jazzcash/return", (req, res) => handleReturn("jazzcash", req, res));
router.post("/payments/payfast/return", urlencoded, (req, res) => handleReturn("payfast", req, res));
router.get("/payments/payfast/return", (req, res) => handleReturn("payfast", req, res));

export default router;
