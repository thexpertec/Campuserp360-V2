/**
 * Derive the initial application fee status for a public submission.
 * Never trust client "paid" — only gateway-verified flows or dev-only simulate may mark paid.
 */
export function deriveInitialFeeStatus(input: {
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  paymentReference?: string | null;
  receiptBase64?: string | null;
}): string {
  const method = (input.paymentMethod ?? "").trim().toLowerCase();
  const clientStatus = (input.paymentStatus ?? "").trim().toLowerCase();

  if (process.env.NODE_ENV !== "production" && method === "simulate" && clientStatus === "paid") {
    return "paid";
  }

  if (method === "bank_deposit") {
    const hasEvidence = Boolean(
      input.receiptBase64?.trim() ||
      input.paymentReference?.trim(),
    );
    return hasEvidence ? "submitted" : "pending";
  }

  if (clientStatus === "bank_pending" && method === "bank_deposit") {
    return "submitted";
  }

  return "pending";
}
