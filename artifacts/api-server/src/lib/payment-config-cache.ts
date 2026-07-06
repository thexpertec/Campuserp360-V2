/**
 * Shared in-process cache + resolver for admission payment config.
 * Used by both the paymentConfig routes and portal.ts so we don't
 * duplicate the lookup logic or create circular route dependencies.
 */
import { db, admissionPaymentConfigTable, PAYMENT_CONFIG_DEFAULTS } from "@workspace/db";
import { eq } from "drizzle-orm";

export type PaymentConfigShape = {
  applicationFeeEnabled:   boolean;
  applicationFeeAmount:    number;
  admissionFeeAmount:      number;
  bankName:                string;
  bankBranch:              string;
  accountTitle:            string;
  accountNumber:           string;
  challanInstructions:     string;
  enableBankDeposit:       boolean;
  enableJazzcash:          boolean;
  enablePayfast:           boolean;
};

const cache = new Map<string, { data: PaymentConfigShape; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 1000; // 60 s

export function invalidatePaymentConfigCache(tenantId: string): void {
  cache.delete(tenantId);
}

export async function resolvePaymentConfig(tenantId: string): Promise<PaymentConfigShape> {
  const now = Date.now();
  const hit = cache.get(tenantId);
  if (hit && hit.expiresAt > now) return hit.data;

  const [row] = await db
    .select()
    .from(admissionPaymentConfigTable)
    .where(eq(admissionPaymentConfigTable.tenantId, tenantId))
    .limit(1);

  const data: PaymentConfigShape = row
    ? {
        applicationFeeEnabled:   row.applicationFeeEnabled,
        applicationFeeAmount:    row.applicationFeeAmount,
        admissionFeeAmount:      row.admissionFeeAmount,
        bankName:                row.bankName,
        bankBranch:              row.bankBranch,
        accountTitle:            row.accountTitle,
        accountNumber:           row.accountNumber,
        challanInstructions:     row.challanInstructions,
        enableBankDeposit:       row.enableBankDeposit,
        enableJazzcash:          row.enableJazzcash,
        enablePayfast:           row.enablePayfast,
      }
    : { ...PAYMENT_CONFIG_DEFAULTS };

  cache.set(tenantId, { data, expiresAt: now + CACHE_TTL_MS });
  return data;
}
