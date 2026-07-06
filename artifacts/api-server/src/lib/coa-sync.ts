import { db, pool } from "@workspace/db";
import {
  chartOfAccountsTable,
  feeTypesTable,
  bankAccountsTable,
  vendorsTable,
  storeItemCategoriesTable,
  employeesTable,
} from "@workspace/db";
import { and, eq, like } from "drizzle-orm";

type CoaType     = "asset" | "liability" | "equity" | "income" | "expense";
export type SourceModule = "fee" | "bank" | "vendor" | "store" | "hr" | "student" | "employee";

function normalBalanceFor(type: CoaType): "dr" | "cr" {
  return type === "asset" || type === "expense" ? "dr" : "cr";
}

// ── Internal helpers (tenant-scoped) ──────────────────────────────────────────

async function findParentByCode(code: string, tenantId: string): Promise<string | null> {
  const rows = await db
    .select({ id: chartOfAccountsTable.id })
    .from(chartOfAccountsTable)
    .where(and(eq(chartOfAccountsTable.code, code), eq(chartOfAccountsTable.tenantId, tenantId)))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function nextSubCode(parentCode: string, tenantId: string): Promise<string> {
  const prefix = `${parentCode}.`;
  const rows = await db
    .select({ code: chartOfAccountsTable.code })
    .from(chartOfAccountsTable)
    .where(
      and(
        like(chartOfAccountsTable.code, `${prefix}%`),
        eq(chartOfAccountsTable.tenantId, tenantId),
      ),
    );

  let max = 0;
  for (const r of rows) {
    const suffix = r.code.slice(prefix.length);
    const n = parseInt(suffix, 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

async function upsertModuleAccount(params: {
  tenantId:     string;
  sourceModule: SourceModule;
  sourceRefId:  string;
  name:         string;
  type:         CoaType;
  parentCode:   string;
  description?: string;
}): Promise<string> {
  const { tenantId, sourceModule, sourceRefId, name, type, parentCode, description } = params;

  const existing = await db
    .select({ id: chartOfAccountsTable.id })
    .from(chartOfAccountsTable)
    .where(
      and(
        eq(chartOfAccountsTable.sourceRefId, sourceRefId),
        eq(chartOfAccountsTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (existing.length) {
    await db
      .update(chartOfAccountsTable)
      .set({ name, updatedAt: new Date() })
      .where(
        and(
          eq(chartOfAccountsTable.id, existing[0].id),
          eq(chartOfAccountsTable.tenantId, tenantId),
        ),
      );
    return existing[0].id;
  }

  const parentId = await findParentByCode(parentCode, tenantId);
  const code     = await nextSubCode(parentCode, tenantId);

  const rows = await db
    .insert(chartOfAccountsTable)
    .values({
      tenantId,
      code,
      name,
      type,
      kind:            "ledger",
      normalBalance:   normalBalanceFor(type),
      parentId:        parentId ?? undefined,
      description:     description ?? null,
      isActive:        true,
      sortOrder:       100,
      sourceModule,
      sourceRefId,
      isSystemAccount: true,
    })
    .onConflictDoNothing()
    .returning({ id: chartOfAccountsTable.id });

  if (rows.length > 0) return rows[0].id;

  // Code collision (concurrent seed or stale account without sourceRefId):
  // link up the existing account that occupies this code.
  const [existing2] = await db
    .select({ id: chartOfAccountsTable.id })
    .from(chartOfAccountsTable)
    .where(
      and(
        eq(chartOfAccountsTable.code, code),
        eq(chartOfAccountsTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (existing2) {
    await db
      .update(chartOfAccountsTable)
      .set({ sourceRefId, name, isSystemAccount: true, updatedAt: new Date() })
      .where(
        and(
          eq(chartOfAccountsTable.id, existing2.id),
          eq(chartOfAccountsTable.tenantId, tenantId),
        ),
      );
    return existing2.id;
  }
  throw new Error(`upsertModuleAccount: could not create or find account with code ${code} for tenant ${tenantId}`);
}

// ── Fee type → income account ─────────────────────────────────────────────────

export async function syncFeeTypeCoa(
  feeType: { id: string; name: string; feeCategory: string; feeCode: string },
  tenantId: string,
): Promise<string | null> {
  try {
    // Fee types nest directly under 4000 (Fee Income) — no intermediate sub-groups.
    const coaId = await upsertModuleAccount({
      tenantId,
      sourceModule: "fee",
      sourceRefId:  feeType.id,
      name:         feeType.name,
      type:         "income",
      parentCode:   "4000",
      description:  `Fee income account for ${feeType.name}`,
    });
    await db.update(feeTypesTable).set({ coaId }).where(eq(feeTypesTable.id, feeType.id));
    return coaId;
  } catch (err) {
    console.error("[coa-sync] syncFeeTypeCoa failed", err);
    return null;
  }
}

// ── Bank account → asset account ──────────────────────────────────────────────

export async function syncBankAccountCoa(
  account: { id: string; type: string; accountTitle: string; bankName?: string | null },
  tenantId: string,
): Promise<string | null> {
  try {
    const name = account.bankName
      ? `${account.bankName} — ${account.accountTitle}`
      : account.accountTitle;
    const coaId = await upsertModuleAccount({
      tenantId,
      sourceModule: "bank",
      sourceRefId:  account.id,
      name,
      type:         "asset",
      parentCode:   "1100",
      description:  name,
    });
    await db.update(bankAccountsTable).set({ coaId }).where(eq(bankAccountsTable.id, account.id));
    return coaId;
  } catch (err) {
    console.error("[coa-sync] syncBankAccountCoa failed", err);
    return null;
  }
}

// ── Vendor → AP liability sub-account ─────────────────────────────────────────

export async function syncVendorCoa(
  vendor: { id: string; name: string; vendorCode: string },
  tenantId: string,
): Promise<string | null> {
  try {
    const coaId = await upsertModuleAccount({
      tenantId,
      sourceModule: "vendor",
      sourceRefId:  vendor.id,
      name:         `AP — ${vendor.name}`,
      type:         "liability",
      parentCode:   "2100",
      description:  `Accounts payable for vendor ${vendor.vendorCode}`,
    });
    await db.update(vendorsTable).set({ coaId }).where(eq(vendorsTable.id, vendor.id));
    return coaId;
  } catch (err) {
    console.error("[coa-sync] syncVendorCoa failed", err);
    return null;
  }
}

// ── Store item category → inventory asset sub-account ─────────────────────────

function storeCategoryParentCode(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("medical") || n.includes("medicine") || n.includes("pharma")) return "1410";
  if (n.includes("uniform") || n.includes("kit") || n.includes("clothing"))    return "1420";
  if (n.includes("sport"))                                                       return "1430";
  if (n.includes("mess") || n.includes("ration") || n.includes("food") || n.includes("kitchen")) return "1440";
  return "1400";
}

export async function syncStoreCategoryCoa(
  category: { id: string; name: string },
  tenantId: string,
): Promise<string | null> {
  try {
    const parentCode = storeCategoryParentCode(category.name);
    const coaId = await upsertModuleAccount({
      tenantId,
      sourceModule: "store",
      sourceRefId:  category.id,
      name:         `Inventory — ${category.name}`,
      type:         "asset",
      parentCode,
      description:  `Inventory asset account for ${category.name}`,
    });
    await db.update(storeItemCategoriesTable).set({ coaId }).where(eq(storeItemCategoriesTable.id, category.id));
    return coaId;
  } catch (err) {
    console.error("[coa-sync] syncStoreCategoryCoa failed", err);
    return null;
  }
}

// ── Student → fee-receivable sub-ledger ───────────────────────────────────────
// Creates a ledger asset account under "Student Fee Receivable (1200)" named
// after the student. Writes the returned COA id back to students.coa_id via raw
// SQL (the column is added by additive migration; not in Drizzle schema).

export async function syncStudentCoa(
  student: { id: string; fullName: string; applicantId: string },
  tenantId: string,
): Promise<string | null> {
  try {
    const name = `Student — ${student.fullName} [${student.applicantId}]`;
    const coaId = await upsertModuleAccount({
      tenantId,
      sourceModule: "student",
      sourceRefId:  student.id,
      name,
      type:         "asset",
      parentCode:   "1200",
      description:  `Fee receivable sub-ledger for ${student.applicantId}`,
    });
    await pool.query(
      `UPDATE students SET coa_id = $1::uuid WHERE id = $2::uuid`,
      [coaId, student.id],
    );
    return coaId;
  } catch (err) {
    console.error("[coa-sync] syncStudentCoa failed", err);
    return null;
  }
}

// ── Employee → salary-expense sub-ledger ──────────────────────────────────────
// Teaching (role=teacher) → 5010, Contract (contractType=contract) → 5050,
// all others → 5030 (Non-Teaching).

function employeeParentCode(role: string, contractType: string): string {
  // Contract employees (any role) and visiting staff → Contract Salaries (5050)
  if (contractType === "contract" || role === "visiting")   return "5050";
  // Permanent teaching staff → Teaching Staff Salaries (5010)
  if (role === "teacher")                                   return "5010";
  // All other permanent staff → Non-Teaching Staff Salaries (5030)
  return "5030";
}

export async function syncEmployeeCoa(
  employee: { id: string; fullName: string; staffId: string; role: string; contractType: string },
  tenantId: string,
): Promise<string | null> {
  const name = `Salary — ${employee.fullName} [${employee.staffId}]`;
  const parentCode = employeeParentCode(employee.role, employee.contractType);

  // Retry once on transient failure (e.g. Neon cold-start / connection blips) so a
  // newly created employee reliably ends up with a salary-expense sub-ledger.
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const coaId = await upsertModuleAccount({
        tenantId,
        sourceModule: "employee",
        sourceRefId:  employee.id,
        name,
        type:         "expense",
        parentCode,
        description:  `Salary expense sub-ledger for ${employee.staffId}`,
      });
      const updated = await db
        .update(employeesTable)
        .set({ coaId })
        .where(eq(employeesTable.id, employee.id))
        .returning({ id: employeesTable.id });
      // Verify the link was persisted — a 0-row update means the employee row is
      // gone/unreachable and the ledger would be orphaned.
      if (!updated.length) {
        console.warn(`[coa-sync] syncEmployeeCoa: created ledger ${coaId} but employee ${employee.staffId} (${employee.id}) was not updated with coa_id`);
      }
      return coaId;
    } catch (err) {
      lastErr = err;
      if (attempt === 1) console.warn(`[coa-sync] syncEmployeeCoa attempt ${attempt} failed for ${employee.staffId} (${employee.id}); retrying`, err);
    }
  }
  console.error(`[coa-sync] syncEmployeeCoa FAILED for employee ${employee.staffId} (${employee.id}) — this employee has NO salary-expense sub-ledger and payroll JEs will fall back to a group account until backfilled`, lastErr);
  return null;
}
