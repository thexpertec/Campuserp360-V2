import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  chartOfAccountsTable,
  feeTypesTable,
  bankAccountsTable,
  vendorsTable,
  storeItemCategoriesTable,
  applicationsTable,
  journalEntriesTable,
  paymentTransactionsTable,
} from "@workspace/db";
import { eq, asc, count, isNull, isNotNull, and, sql } from "drizzle-orm";
import { pool } from "@workspace/db";
import { tenantsTable } from "@workspace/db";
import { postApplicationFeeJE, createAndPostJE } from "../lib/je-factory";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId, withTenantRead } from "../lib/tenant";
import {
  syncFeeTypeCoa,
  syncBankAccountCoa,
  syncVendorCoa,
  syncStoreCategoryCoa,
  syncStudentCoa,
  syncEmployeeCoa,
} from "../lib/coa-sync";
import { ensureFineFeeTypes } from "../lib/fine-fee-types";

const router = Router();

// ── List ───────────────────────────────────────────────────────────────────────

router.get("/admin/coa", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    // Phase 1: fetch tenant-scoped COA accounts under app_user RLS (defence-in-depth
    // on top of the explicit WHERE tenant_id clause).
    const accounts = await withTenantRead(tenantId, async (tx) =>
      tx
        .select()
        .from(chartOfAccountsTable)
        .where(eq(chartOfAccountsTable.tenantId, tenantId))
        .orderBy(asc(chartOfAccountsTable.type), asc(chartOfAccountsTable.code))
    );

    // Aggregate real balances from journal_entry_lines for this tenant.
    // Falls back to zero if JE tables don't exist yet (first-boot race).
    const balMap = new Map<string, { dr: number; cr: number }>();
    try {
      const balRows = await pool.query<{ account_id: string; dr: string; cr: string }>(`
        SELECT
          jel.account_id,
          COALESCE(SUM(jel.dr_amount), 0)::text AS dr,
          COALESCE(SUM(jel.cr_amount), 0)::text AS cr
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.tenant_id = $1::uuid AND je.is_voided = false
        GROUP BY jel.account_id
      `, [tenantId]);
      for (const row of balRows.rows) {
        balMap.set(row.account_id, { dr: Number(row.dr), cr: Number(row.cr) });
      }
    } catch {
      // JE tables not yet created — balances stay at 0
    }

    // Build initial flat result with direct balances from JE lines
    const result = accounts.map(a => {
      const bal = balMap.get(a.id);
      const dr  = bal?.dr ?? 0;
      const cr  = bal?.cr ?? 0;
      return { ...a, debitBalance: dr, creditBalance: cr, netBalance: dr - cr };
    });

    // Roll-up: propagate ledger balances up to their parent groups.
    // Uses post-order DFS so children are fully tallied before parent is touched.
    const byId = new Map(result.map(a => [a.id, a]));
    const childrenOf = new Map<string, string[]>();
    for (const a of result) {
      if (a.parentId) {
        if (!childrenOf.has(a.parentId)) childrenOf.set(a.parentId, []);
        childrenOf.get(a.parentId)!.push(a.id);
      }
    }
    const visited = new Set<string>();
    function propagate(id: string): void {
      if (visited.has(id)) return;
      visited.add(id);
      const acc = byId.get(id);
      if (!acc) return;
      for (const childId of (childrenOf.get(id) ?? [])) {
        propagate(childId);
        const child = byId.get(childId);
        if (child) {
          acc.debitBalance  += child.debitBalance;
          acc.creditBalance += child.creditBalance;
          acc.netBalance     = acc.debitBalance - acc.creditBalance;
        }
      }
    }
    for (const a of result) {
      if (!a.parentId) propagate(a.id);
    }

    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list COA");
    return res.status(500).json({ error: "Failed to load chart of accounts" });
  }
});

// ── Ledger (transaction history for one account) ──────────────────────────────
// GET /admin/coa/ledger/:id?page=&pageSize=&from=&to=

router.get("/admin/coa/ledger/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const accountId = req.params.id as string;

    // Verify account belongs to this tenant
    const accts = await withTenantRead(tenantId, async (tx) =>
      tx.select()
        .from(chartOfAccountsTable)
        .where(and(eq(chartOfAccountsTable.id, accountId), eq(chartOfAccountsTable.tenantId, tenantId)))
        .limit(1)
    );
    if (!accts.length) return res.status(404).json({ error: "Account not found" });
    const account = accts[0];

    const pg   = Math.max(1,   parseInt((req.query.page     as string) ?? "1",   10));
    const ps   = Math.min(200, parseInt((req.query.pageSize as string) ?? "50",  10));
    const from = req.query.from as string | undefined;
    const to   = req.query.to   as string | undefined;

    const params: unknown[] = [accountId, tenantId];
    const dateClauses: string[] = [];
    if (from) { params.push(from); dateClauses.push(`je.date >= $${params.length}::date`); }
    if (to)   { params.push(to);   dateClauses.push(`je.date <= $${params.length}::date`); }
    const dateWhere = dateClauses.length ? `AND ${dateClauses.join(" AND ")}` : "";

    let total = 0;
    let lines: any[] = [];
    let debitTotal  = 0;
    let creditTotal = 0;
    let openingBalance = 0;

    try {
      // Opening balance: net (dr - cr) of everything strictly before the "from"
      // date, so the statement can show a true running balance carried forward
      // into the filtered range instead of restarting at zero.
      if (from) {
        const openRes = await pool.query<{ dr: string; cr: string }>(`
          SELECT COALESCE(SUM(jel.dr_amount), 0)::text AS dr,
                 COALESCE(SUM(jel.cr_amount), 0)::text AS cr
          FROM journal_entry_lines jel
          JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE jel.account_id = $1::uuid AND je.tenant_id = $2::uuid AND je.is_voided = false
            AND je.date < $3::date
        `, [accountId, tenantId, from]);
        openingBalance = Number(openRes.rows[0]?.dr ?? 0) - Number(openRes.rows[0]?.cr ?? 0);
      }

      // Total count for pagination
      const countRes = await pool.query<{ n: string }>(`
        SELECT COUNT(*)::text AS n
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id = jel.journal_entry_id
        WHERE jel.account_id = $1::uuid AND je.tenant_id = $2::uuid AND je.is_voided = false
        ${dateWhere}
      `, params);
      total = Number(countRes.rows[0]?.n ?? 0);

      // Totals (unfiltered by page) — within the filtered date range only.
      const totRes = await pool.query<{ dr: string; cr: string }>(`
        SELECT COALESCE(SUM(jel.dr_amount), 0)::text AS dr,
               COALESCE(SUM(jel.cr_amount), 0)::text AS cr
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id = jel.journal_entry_id
        WHERE jel.account_id = $1::uuid AND je.tenant_id = $2::uuid AND je.is_voided = false
        ${dateWhere}
      `, params);
      debitTotal  = Number(totRes.rows[0]?.dr ?? 0);
      creditTotal = Number(totRes.rows[0]?.cr ?? 0);

      // Page of lines with running balance via window function, offset by the
      // opening balance so it reflects the true cumulative account balance.
      const offset = (pg - 1) * ps;
      const pageParams = [...params, ps, offset];
      const psIdx = pageParams.length - 1;
      const offIdx = pageParams.length;
      const rowRes = await pool.query(`
        SELECT
          je.id        AS je_id,
          je.date::text,
          je.narration,
          je.source_module,
          jel.dr_amount::text AS dr_amount,
          jel.cr_amount::text AS cr_amount,
          jel.memo,
          SUM(jel.dr_amount - jel.cr_amount) OVER (
            ORDER BY je.date ASC, jel.created_at ASC
            ROWS UNBOUNDED PRECEDING
          )::text AS running_balance
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id = jel.journal_entry_id
        WHERE jel.account_id = $1::uuid AND je.tenant_id = $2::uuid AND je.is_voided = false
        ${dateWhere}
        ORDER BY je.date ASC, jel.created_at ASC
        LIMIT $${psIdx} OFFSET $${offIdx}
      `, pageParams);
      lines = rowRes.rows;
    } catch {
      // JE tables not yet created
    }

    const closingBalance = openingBalance + (debitTotal - creditTotal);

    return res.json({
      account,
      total,
      page:         pg,
      pageSize:     ps,
      debitTotal,
      creditTotal,
      netBalance:   debitTotal - creditTotal,
      openingBalance,
      closingBalance,
      lines: lines.map(l => ({
        jeId:           l.je_id,
        date:           l.date,
        narration:      l.narration,
        sourceModule:   l.source_module,
        drAmount:       Number(l.dr_amount),
        crAmount:       Number(l.cr_amount),
        memo:           l.memo,
        runningBalance: openingBalance + Number(l.running_balance),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load COA ledger");
    return res.status(500).json({ error: "Failed to load ledger" });
  }
});

// ── Seed defaults ─────────────────────────────────────────────────────────────
// Idempotent — skips any code that already exists.

type SeedEntry = {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  parentCode: string | null;
  description?: string;
  sortOrder: number;
};

// Codes that will receive module-synced children → must be "group" at seed time
const MODULE_GROUP_CODES = new Set([
  "1100",                               // cash & bank accounts (unified)
  "1200",                               // student fee-receivable sub-ledgers
  "1400","1410","1420","1430","1440",   // store categories
  "2100",                               // vendor AP
  // 4xxx: fee types now nest directly under 4000 — no intermediate sub-groups
  "5010","5030","5050",                 // employee salary sub-ledgers
]);

function seedKind(entry: SeedEntry): "group" | "ledger" {
  if (entry.parentCode === null) return "group";
  if (MODULE_GROUP_CODES.has(entry.code)) return "group";
  return "ledger";
}

function seedNormBal(type: string): "dr" | "cr" {
  return type === "asset" || type === "expense" ? "dr" : "cr";
}

// Five-level COA: Type → Group (L1, parentCode: null) → Account (L2, parentCode: group)
// Types: asset (1xxx) | liability (2xxx) | equity (3xxx) | income (4xxx) | expense (5xxx)
// Only module-used accounts are seeded; standalone "reference only" ledgers are omitted.
const DEFAULT_ACCOUNTS: SeedEntry[] = [

  // ════════════════════════════════════════════════════════════════
  // ASSETS  (1xxx)  —  Normal balance: Debit
  // ════════════════════════════════════════════════════════════════

  // ── L1 Groups ─────────────────────────────────────────────────
  { code: "1000", name: "Current Assets", type: "asset", parentCode: null, sortOrder: 10, description: "Cash, receivables and short-term assets" },

  // ── L2 under Current Assets (1000) ────────────────────────────
  { code: "1100", name: "Cash & Bank Accounts",              type: "asset", parentCode: "1000", sortOrder: 10, description: "All cash and bank accounts" },
  { code: "1200", name: "Student Fee Receivable",            type: "asset", parentCode: "1000", sortOrder: 50, description: "Outstanding fee dues from students" },
  { code: "1400", name: "Inventory — Stationery & Supplies", type: "asset", parentCode: "1000", sortOrder: 100 },
  { code: "1410", name: "Inventory — Medical Supplies",      type: "asset", parentCode: "1000", sortOrder: 110 },
  { code: "1420", name: "Inventory — Uniform & Kit",         type: "asset", parentCode: "1000", sortOrder: 120 },
  { code: "1430", name: "Inventory — Sports Equipment",      type: "asset", parentCode: "1000", sortOrder: 130 },
  { code: "1440", name: "Inventory — Mess & Rations",        type: "asset", parentCode: "1000", sortOrder: 140 },

  // ════════════════════════════════════════════════════════════════
  // LIABILITIES  (2xxx)  —  Normal balance: Credit
  // ════════════════════════════════════════════════════════════════

  // ── L1 Groups ─────────────────────────────────────────────────
  { code: "2000", name: "Current Liabilities", type: "liability", parentCode: null, sortOrder: 10, description: "Obligations due within one year" },

  // ── L2 under Current Liabilities (2000) ───────────────────────
  { code: "2100", name: "Accounts Payable — Vendors", type: "liability", parentCode: "2000", sortOrder: 10, description: "Amounts owed to suppliers" },
  { code: "2200", name: "Salaries Payable",            type: "liability", parentCode: "2000", sortOrder: 30, description: "Accrued but unpaid salaries" },

  // ════════════════════════════════════════════════════════════════
  // INCOME  (4xxx)  —  Normal balance: Credit
  // ════════════════════════════════════════════════════════════════

  // ── L1 Groups ─────────────────────────────────────────────────
  { code: "4000", name: "Fee Income", type: "income", parentCode: null, sortOrder: 10, description: "All student fee collections" },
  // Fee types are created as direct ledger children of 4000 by syncFeeTypeCoa — no hardcoded sub-groups.

  // ════════════════════════════════════════════════════════════════
  // EXPENSE  (5xxx)  —  Normal balance: Debit
  // ════════════════════════════════════════════════════════════════

  // ── L1 Groups ─────────────────────────────────────────────────
  { code: "5000", name: "Personnel Expenses",     type: "expense", parentCode: null, sortOrder: 10, description: "Salaries, allowances and benefits" },
  { code: "5500", name: "Academic Expenses",      type: "expense", parentCode: null, sortOrder: 20, description: "Teaching & learning materials" },
  { code: "5600", name: "Hostel & Mess Expenses", type: "expense", parentCode: null, sortOrder: 30, description: "Residential facility costs" },

  // ── L2 under Personnel Expenses (5000) — module-written sub-ledger parents ──
  { code: "5010", name: "Teaching Staff — Basic Pay",     type: "expense", parentCode: "5000", sortOrder: 10 },
  { code: "5030", name: "Non-Teaching Staff — Basic Pay", type: "expense", parentCode: "5000", sortOrder: 30 },
  { code: "5050", name: "Contract / Part-time Staff Pay", type: "expense", parentCode: "5000", sortOrder: 50 },

  // ── L2 under Academic Expenses (5500) — module-written only ──────────────
  { code: "5540", name: "Computer Lab Maintenance",   type: "expense", parentCode: "5500", sortOrder: 40 },
  { code: "5550", name: "Sports Equipment & Supplies", type: "expense", parentCode: "5500", sortOrder: 50 },

  // ── L2 under Hostel & Mess (5600) — module-written only ──────────────────
  { code: "5610", name: "Ration & Mess Expenses", type: "expense", parentCode: "5600", sortOrder: 10 },
  { code: "5640", name: "Cadet Uniform & Kit",    type: "expense", parentCode: "5600", sortOrder: 40 },
];

router.post("/admin/coa/seed", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const force = req.body?.force === true;

    // ── force mode: wipe this tenant's COA accounts (leaves first, then roots) ─
    if (force) {
      await db.delete(chartOfAccountsTable).where(
        and(isNotNull(chartOfAccountsTable.parentId), eq(chartOfAccountsTable.tenantId, tenantId))
      );
      await db.delete(chartOfAccountsTable).where(
        and(isNull(chartOfAccountsTable.parentId), eq(chartOfAccountsTable.tenantId, tenantId))
      );
    }

    const codeToId = new Map<string, string>();
    let inserted = 0;
    let skipped  = 0;

    // Process in order so parents are inserted before children
    for (const entry of DEFAULT_ACCOUNTS) {
      const parentId = entry.parentCode ? (codeToId.get(entry.parentCode) ?? null) : null;

      const [row] = await db
        .insert(chartOfAccountsTable)
        .values({
          tenantId,
          code:          entry.code,
          name:          entry.name,
          type:          entry.type,
          kind:          seedKind(entry),
          normalBalance: seedNormBal(entry.type),
          parentId,
          description:   entry.description ?? null,
          sortOrder:     entry.sortOrder,
        })
        .onConflictDoNothing()
        .returning({ id: chartOfAccountsTable.id, code: chartOfAccountsTable.code });

      if (row) {
        codeToId.set(entry.code, row.id);
        inserted++;
      } else {
        // Already exists for this tenant — fetch its id so children can still be attached
        const [existing] = await db
          .select({ id: chartOfAccountsTable.id })
          .from(chartOfAccountsTable)
          .where(and(eq(chartOfAccountsTable.code, entry.code), eq(chartOfAccountsTable.tenantId, tenantId)))
          .limit(1);
        if (existing) codeToId.set(entry.code, existing.id);
        skipped++;
      }
    }

    return res.json({
      success: true,
      inserted,
      skipped,
      message: force
        ? `Chart of Accounts reset — ${inserted} account${inserted !== 1 ? "s" : ""} loaded.`
        : `${inserted} account${inserted !== 1 ? "s" : ""} added${skipped > 0 ? `, ${skipped} already existed` : ""}.`,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to seed COA");
    return res.status(500).json({ error: "Failed to seed chart of accounts" });
  }
});

// ── Create ─────────────────────────────────────────────────────────────────────

router.post("/admin/coa", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const { code, name, type, kind, normalBalance, parentId, description, sortOrder, entries } = req.body ?? {};

    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ error: "code is required" });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    const VALID_TYPES = ["asset", "liability", "equity", "income", "expense"];
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: "type must be one of: asset, liability, equity, income, expense" });
    }
    const resolvedKind          = kind === "ledger" ? "ledger" : "group";
    const resolvedNormalBalance: "dr" | "cr" =
      normalBalance === "cr" ? "cr" : normalBalance === "dr" ? "dr" : seedNormBal(String(type));

    const [row] = await db
      .insert(chartOfAccountsTable)
      .values({
        tenantId,
        code:          code.trim(),
        name:          name.trim(),
        type:          type as "income" | "expense",
        kind:          resolvedKind,
        normalBalance: resolvedNormalBalance,
        parentId:      typeof parentId === "string" ? parentId : null,
        description:   typeof description === "string" ? description.trim() || null : null,
        sortOrder:     typeof sortOrder === "number" ? sortOrder : 0,
      })
      .returning();

    // Bulk-create sub-accounts from the Entries tab (only when kind = group)
    const subRows: typeof row[] = [];
    if (resolvedKind === "group" && Array.isArray(entries) && entries.length > 0) {
      for (const e of entries) {
        if (!e.code?.trim() || !e.name?.trim()) continue;
        const nb = e.normalBalance === "cr" ? "cr" : "dr";
        const [sub] = await db
          .insert(chartOfAccountsTable)
          .values({
            tenantId,
            code:          String(e.code).trim(),
            name:          String(e.name).trim(),
            type:          type as "income" | "expense",
            kind:          "ledger",
            normalBalance: nb,
            parentId:      row.id,
            description:   typeof e.description === "string" ? e.description.trim() || null : null,
            sortOrder:     typeof e.sortOrder === "number" ? e.sortOrder : 0,
          })
          .onConflictDoNothing()
          .returning();
        if (sub) subRows.push(sub);
      }
    }

    return res.status(201).json({ ...row, subAccounts: subRows });
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "Account code already exists" });
    }
    req.log.error({ err }, "Failed to create COA account");
    return res.status(400).json({ error: err?.message ?? "Failed to create account" });
  }
});

// ── Batch create ───────────────────────────────────────────────────────────────
// POST /admin/coa/batch
// Body: { accounts: Array<{ code, name, type, kind, parentId, normalBalance, description?, sortOrder? }> }
// Creates all accounts atomically in a single transaction.

router.post("/admin/coa/batch", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const { accounts } = req.body ?? {};
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return res.status(400).json({ error: "accounts array is required and must not be empty" });
    }

    const VALID_TYPES = ["asset", "liability", "equity", "income", "expense"];
    const created: typeof accounts = [];
    const errors: string[] = [];

    await db.transaction(async (tx) => {
      for (const acct of accounts) {
        const code = typeof acct.code === "string" ? acct.code.trim() : "";
        const name = typeof acct.name === "string" ? acct.name.trim() : "";
        if (!code || !name) {
          errors.push(`Skipped row with missing code or name`);
          continue;
        }
        if (!VALID_TYPES.includes(acct.type)) {
          errors.push(`Invalid type '${acct.type}' for ${code}`);
          continue;
        }
        const resolvedKind: "group" | "ledger" = acct.kind === "group" ? "group" : "ledger";
        const resolvedNB: "dr" | "cr" =
          acct.normalBalance === "cr" ? "cr" :
          acct.normalBalance === "dr" ? "dr" :
          seedNormBal(String(acct.type));

        const [row] = await tx
          .insert(chartOfAccountsTable)
          .values({
            tenantId,
            code,
            name,
            type:          acct.type as "asset" | "liability" | "equity" | "income" | "expense",
            kind:          resolvedKind,
            normalBalance: resolvedNB,
            parentId:      typeof acct.parentId === "string" ? acct.parentId : null,
            description:   typeof acct.description === "string" ? acct.description.trim() || null : null,
            sortOrder:     typeof acct.sortOrder === "number" ? acct.sortOrder : 0,
          })
          .returning();

        if (row) created.push(row);
      }
    });

    return res.status(201).json({ created, errors });
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "One or more account codes already exist" });
    }
    req.log.error({ err }, "Failed to batch-create COA accounts");
    return res.status(400).json({ error: err?.message ?? "Failed to create accounts" });
  }
});

// ── Update ─────────────────────────────────────────────────────────────────────

router.patch("/admin/coa/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const target = String(req.params.id);
    const { code, name, description, isActive, sortOrder } = req.body ?? {};

    // Block edits of system-managed accounts; also verify tenant ownership
    const [acctCheck] = await db
      .select({ isSystemAccount: chartOfAccountsTable.isSystemAccount, tenantId: chartOfAccountsTable.tenantId, sourceModule: chartOfAccountsTable.sourceModule })
      .from(chartOfAccountsTable).where(eq(chartOfAccountsTable.id, target)).limit(1);
    if (!acctCheck) return res.status(404).json({ error: "Account not found" });
    if (acctCheck.tenantId !== tenantId) return res.status(403).json({ error: "Access denied" });
    if (acctCheck.isSystemAccount) {
      return res.status(409).json({ error: "System-managed accounts cannot be edited manually." });
    }
    if (acctCheck.sourceModule) {
      return res.status(409).json({ error: `This account is managed by '${acctCheck.sourceModule}' and cannot be edited here. Make changes from that module instead.` });
    }

    const { kind, normalBalance } = req.body ?? {};

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof code          === "string")  patch.code          = code.trim();
    if (typeof name          === "string")  patch.name          = name.trim();
    if (typeof description   === "string")  patch.description   = description.trim() || null;
    if (typeof isActive      === "boolean") patch.isActive      = isActive;
    if (typeof sortOrder     === "number")  patch.sortOrder     = sortOrder;
    if (kind === "group" || kind === "ledger")              patch.kind          = kind;
    if (normalBalance === "dr" || normalBalance === "cr")   patch.normalBalance = normalBalance;

    const [row] = await db
      .update(chartOfAccountsTable)
      .set(patch as any)
      .where(eq(chartOfAccountsTable.id, target))
      .returning();

    if (!row) return res.status(404).json({ error: "Account not found" });

    // If this is a group account and entries[] were supplied, create sub-accounts
    const entries: Array<{ code?: string; name?: string; description?: string; normalBalance?: string }> =
      Array.isArray(req.body?.entries) ? req.body.entries : [];
    if (row.kind === "group" && entries.length > 0) {
      for (const e of entries) {
        const eCode = typeof e.code === "string" ? e.code.trim() : "";
        const eName = typeof e.name === "string" ? e.name.trim() : "";
        if (!eCode || !eName) continue;
        const eNormBal = e.normalBalance === "cr" ? "cr" : "dr";
        await db.insert(chartOfAccountsTable).values({
          tenantId,
          code:          eCode,
          name:          eName,
          type:          row.type as any,
          kind:          "ledger",
          normalBalance: eNormBal,
          parentId:      row.id,
          description:   typeof e.description === "string" ? e.description.trim() || null : null,
          sortOrder:     0,
        }).onConflictDoNothing();
      }
    }

    return res.json(row);
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "Account code already exists" });
    }
    req.log.error({ err }, "Failed to update COA account");
    return res.status(400).json({ error: err?.message ?? "Failed to update account" });
  }
});

// ── Delete ─────────────────────────────────────────────────────────────────────

router.delete("/admin/coa/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const target = req.params.id as string;

    // Block delete of system accounts; verify tenant ownership
    const [acct] = await db
      .select({ isSystemAccount: chartOfAccountsTable.isSystemAccount, tenantId: chartOfAccountsTable.tenantId, sourceModule: chartOfAccountsTable.sourceModule })
      .from(chartOfAccountsTable).where(eq(chartOfAccountsTable.id, target)).limit(1);
    if (!acct) return res.status(404).json({ error: "Account not found" });
    if (acct.tenantId !== tenantId) return res.status(403).json({ error: "Access denied" });
    if (acct.isSystemAccount) {
      return res.status(409).json({ error: "System-managed accounts cannot be deleted." });
    }
    if (acct.sourceModule) {
      return res.status(409).json({ error: `This account is managed by '${acct.sourceModule}' and cannot be deleted here. Remove it from that module instead.` });
    }

    const children = await db
      .select({ id: chartOfAccountsTable.id })
      .from(chartOfAccountsTable)
      .where(eq(chartOfAccountsTable.parentId, target));

    if (children.length > 0) {
      return res.status(409).json({
        error: `Cannot delete — this account has ${children.length} sub-account${children.length > 1 ? "s" : ""}. Remove them first.`,
      });
    }

    const [deleted] = await db
      .delete(chartOfAccountsTable)
      .where(eq(chartOfAccountsTable.id, target))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Account not found" });
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete COA account");
    return res.status(500).json({ error: "Failed to delete account" });
  }
});

// ── Backfill module accounts ───────────────────────────────────────────────────
// Creates/updates COA sub-accounts for all existing fee types, bank accounts,
// store item categories, and vendors that don't yet have a linked COA entry.

// Alias kept for spec compatibility
router.post("/admin/coa/backfill-module-accounts", requireAdmin, async (req: Request, res: Response) => {
  return res.redirect(307, "/api/admin/coa/backfill-modules");
});

router.post("/admin/coa/backfill-modules", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const results = { feeTypes: 0, bankAccounts: 0, storeCategories: 0, vendors: 0, errors: 0 };

    // ── Fee types — scoped to this tenant ─────────────────────────────────
    const feeTypes = await db.select().from(feeTypesTable).where(eq(feeTypesTable.tenantId, tenantId));
    for (const ft of feeTypes) {
      const id = await syncFeeTypeCoa({ id: ft.id, name: ft.name, feeCategory: ft.feeCategory, feeCode: ft.feeCode }, tenantId);
      if (id) results.feeTypes++; else results.errors++;
    }

    // ── Bank accounts, store categories, vendors — scoped to THIS tenant ──
    // These tables are tenant-scoped (each has a tenant_id column). The COA
    // sub-account created by the sync functions is written under the same
    // tenantId, so we must only sync this tenant's rows — selecting all rows
    // would leak other tenants' bank/vendor/inventory accounts into this COA.
    const bankAccs = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.tenantId, tenantId));
    for (const ba of bankAccs) {
      const id = await syncBankAccountCoa({ id: ba.id, type: ba.type, accountTitle: ba.accountTitle, bankName: ba.bankName }, tenantId);
      if (id) results.bankAccounts++; else results.errors++;
    }

    const cats = await db.select().from(storeItemCategoriesTable).where(eq(storeItemCategoriesTable.tenantId, tenantId));
    for (const cat of cats) {
      const id = await syncStoreCategoryCoa({ id: cat.id, name: cat.name }, tenantId);
      if (id) results.storeCategories++; else results.errors++;
    }

    const vends = await db.select().from(vendorsTable).where(eq(vendorsTable.tenantId, tenantId));
    for (const v of vends) {
      const id = await syncVendorCoa({ id: v.id, name: v.name, vendorCode: v.vendorCode }, tenantId);
      if (id) results.vendors++; else results.errors++;
    }

    return res.json({
      ok: true,
      message: `Synced: ${results.feeTypes} fee types, ${results.bankAccounts} bank accounts, ${results.storeCategories} store categories, ${results.vendors} vendors.${results.errors > 0 ? ` (${results.errors} errors — parent accounts may be missing, seed COA defaults first)` : ""}`,
      results,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to backfill module COA accounts");
    return res.status(500).json({ error: "Failed to sync module accounts" });
  }
});

// ── GET /admin/finance/summary ─────────────────────────────────────────────────
// Live finance summary: fee collected this month, outstanding receivable, salaries, vendor AP.

router.get("/admin/finance/summary", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthStart = `${thisMonth}-01`;

    // All four figures are derived from journal_entry_lines aggregated against COA accounts,
    // so they always reflect posted ledger balances rather than operational-table counters.
    const [feeCollectedRes, feeOutstandingRes, salariesRes, vendorApRes] = await Promise.all([
      // Fee cash collected this month: debits on bank/cash accounts (11xx) from fee/application-fee JEs.
      // Fee payment JE: DR bank, CR student-receivable → bank debit = cash in.
      pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(jel.dr_amount), 0)::text AS total
           FROM journal_entry_lines jel
           JOIN journal_entries    je  ON je.id  = jel.journal_entry_id
           JOIN chart_of_accounts  coa ON coa.id = jel.account_id
          WHERE je.tenant_id      = $1::uuid
            AND je.posted_at     IS NOT NULL
            AND coa.code          LIKE '11%'
            AND je.source_module  IN ('fee', 'application-fee')
            AND je.date          >= $2::date`,
        [tenantId, monthStart],
      ),
      // Student receivables outstanding: running debit balance on 12xx sub-ledger accounts.
      // Billing JE: DR student-receivable, CR fee-income.  Payment JE: DR bank, CR student-receivable.
      pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(jel.dr_amount - jel.cr_amount), 0)::text AS total
           FROM journal_entry_lines jel
           JOIN journal_entries    je  ON je.id  = jel.journal_entry_id
           JOIN chart_of_accounts  coa ON coa.id = jel.account_id
          WHERE je.tenant_id    = $1::uuid
            AND je.posted_at   IS NOT NULL
            AND coa.code        LIKE '12%'`,
        [tenantId],
      ),
      // Salaries paid this month: credits on bank/cash accounts (11xx) from payroll-payment JEs.
      // Payment JE: DR Salaries Payable (2200), CR bank → bank credit = cash out.
      pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(jel.cr_amount), 0)::text AS total
           FROM journal_entry_lines jel
           JOIN journal_entries    je  ON je.id  = jel.journal_entry_id
           JOIN chart_of_accounts  coa ON coa.id = jel.account_id
          WHERE je.tenant_id     = $1::uuid
            AND je.posted_at    IS NOT NULL
            AND coa.code         LIKE '11%'
            AND je.source_module = 'payroll-payment'
            AND je.date         >= $2::date`,
        [tenantId, monthStart],
      ),
      // Vendor AP outstanding: running credit balance on AP accounts (code 21xx).
      pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(jel.cr_amount - jel.dr_amount), 0)::text AS total
           FROM journal_entry_lines jel
           JOIN journal_entries    je  ON je.id  = jel.journal_entry_id
           JOIN chart_of_accounts  coa ON coa.id = jel.account_id
          WHERE je.tenant_id    = $1::uuid
            AND je.posted_at   IS NOT NULL
            AND coa.code        LIKE '21%'`,
        [tenantId],
      ),
    ]);

    return res.json({
      feeCollectedThisMonth: Number(feeCollectedRes.rows[0]?.total ?? 0),
      feeOutstanding:        Number(feeOutstandingRes.rows[0]?.total ?? 0),
      salariesThisMonth:     Number(salariesRes.rows[0]?.total ?? 0),
      vendorApOutstanding:   Number(vendorApRes.rows[0]?.total ?? 0),
      month: thisMonth,
    });
  } catch (err) {
    req.log.error({ err }, "GET /admin/finance/summary failed");
    return res.status(500).json({ error: "Failed to load finance summary" });
  }
});

// ── Backfill endpoint: post JEs for historically confirmed application fees ────
// POST /admin/finance/application-fees/backfill-je
// Finds all applications with feeStatus="paid" that have no journal entry with
// source_module="application-fee", then posts a JE for each.  Idempotent.
router.post(
  "/admin/finance/application-fees/backfill-je",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

      // Find paid applications with no application-fee JE (checked against both
      // app.id and any payment_transactions.id for that app, to handle both admin
      // and online-gateway confirmed fees).
      const paidApps = await pool.query<{
        id: string;
        fee_paid_amount: string | null;
        fee_bank_ref: string | null;
        fee_confirmed_at: string | null;
        reference_id: string;
      }>(`
        SELECT
          a.id,
          a.fee_paid_amount,
          a.fee_bank_ref,
          a.fee_confirmed_at,
          a.reference_id
        FROM applications a
        WHERE a.tenant_id = $1::uuid
          AND a.fee_status = 'paid'
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries je
            WHERE je.source_module = 'application-fee'
              AND (
                je.source_ref_id = a.id
                OR je.source_ref_id IN (
                  SELECT pt.id FROM payment_transactions pt
                  WHERE pt.application_id = a.id
                )
              )
          )
        ORDER BY a.fee_confirmed_at ASC NULLS LAST
      `, [tenantId]);

      const apps = paidApps.rows;
      let posted   = 0;
      let skipped  = 0;
      const errors: string[] = [];

      for (const app of apps) {
        const amount = app.fee_paid_amount ? Number(app.fee_paid_amount) : 2000;
        const date   = app.fee_confirmed_at
          ? new Date(app.fee_confirmed_at).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);

        const result = await postApplicationFeeJE({
          tenantId,
          amount,
          reference:   app.fee_bank_ref ?? app.reference_id,
          date,
          sourceRefId: app.id,
          description: "Application fee received (backfill)",
          logger:      req.log,
        });

        if (result.ok) {
          posted++;
        } else {
          skipped++;
          if (result.warning) errors.push(`${app.reference_id}: ${result.warning}`);
        }
      }

      return res.json({
        processed: apps.length,
        posted,
        skipped,
        errors: errors.slice(0, 50),  // cap to avoid oversized responses
      });
    } catch (err) {
      req.log.error({ err }, "application-fee backfill-je failed");
      return res.status(500).json({ error: "Backfill failed" });
    }
  },
);

export default router;

// ── Startup auto-seed (called from index.ts) ────────────────────────────────

// Codes that are permanently non-deletable (system / cash accounts).
const SYSTEM_ACCOUNT_CODES = new Set(["1100"]);

/**
 * Seeds the default COA for a single tenant (idempotent — skips if any
 * accounts already exist for that tenant).  Used both by autoSeedCoa at
 * startup and by seedNewTenant when a new tenant is created.
 */
export async function seedCoaForTenant(tenantId: string, tenantSlug?: string): Promise<void> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(chartOfAccountsTable)
    .where(eq(chartOfAccountsTable.tenantId, tenantId));

  if (Number(n) > 0) return; // already seeded

  const codeToId = new Map<string, string>();
  for (const entry of DEFAULT_ACCOUNTS) {
    const parentId = entry.parentCode ? (codeToId.get(entry.parentCode) ?? null) : null;
    const [row] = await db
      .insert(chartOfAccountsTable)
      .values({
        tenantId,
        code:            entry.code,
        name:            entry.name,
        type:            entry.type,
        kind:            seedKind(entry),
        normalBalance:   seedNormBal(entry.type),
        parentId,
        description:     entry.description ?? null,
        sortOrder:       entry.sortOrder,
        // Mark special system accounts as non-deletable
        isSystemAccount: SYSTEM_ACCOUNT_CODES.has(entry.code),
      })
      .onConflictDoNothing()
      .returning({ id: chartOfAccountsTable.id, code: chartOfAccountsTable.code });

    if (row) {
      codeToId.set(entry.code, row.id);
    } else {
      const [ex] = await db
        .select({ id: chartOfAccountsTable.id })
        .from(chartOfAccountsTable)
        .where(and(eq(chartOfAccountsTable.code, entry.code), eq(chartOfAccountsTable.tenantId, tenantId)))
        .limit(1);
      if (ex) codeToId.set(entry.code, ex.id);
    }
  }
  console.log(`[seedCoaForTenant] Seeded COA defaults for tenant: ${tenantSlug ?? tenantId}`);
}

// ── POST /admin/coa/backfill-students ─────────────────────────────────────────
// Idempotent: only processes students whose coa_id is still NULL.

router.post("/admin/coa/backfill-students", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const { rows } = await pool.query<{
      id: string; full_name: string; applicant_id: string;
    }>(
      `SELECT id, full_name, applicant_id
         FROM students
        WHERE tenant_id = $1::uuid AND coa_id IS NULL`,
      [tenantId],
    );

    let created = 0, failed = 0;
    for (const s of rows) {
      const coaId = await syncStudentCoa(
        { id: s.id, fullName: s.full_name, applicantId: s.applicant_id },
        tenantId,
      );
      if (coaId) created++; else failed++;
    }
    return res.json({ created, failed, message: `Student sub-ledgers: ${created} created, ${failed} skipped/failed.` });
  } catch (err: any) {
    req.log.error({ err }, "POST /admin/coa/backfill-students failed");
    return res.status(500).json({ error: err?.message ?? "Backfill failed" });
  }
});

// ── POST /admin/coa/backfill-challan-jes ──────────────────────────────────────
// Retroactively posts the billing JE (DR student-receivable / CR fee-income) for
// every approved/paid/pending challan that never had one posted (because the
// student had no coa_id at generation time).  Fully idempotent — checks for an
// existing fee-billed JE before posting, so safe to run multiple times.

router.post("/admin/coa/backfill-challan-jes", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    // Find challans whose student now has a coa_id, whose fee-type has a coa_id,
    // but for which no fee-billed JE has been posted yet.
    const { rows: challans } = await pool.query<{
      id: string; amount: number; challan_number: string | null; issue_date: string;
      student_coa_id: string; ft_coa_id: string;
    }>(`
      SELECT
        fc.id,
        fc.amount,
        fc.challan_number,
        fc.issue_date,
        s.coa_id    AS student_coa_id,
        ft.coa_id   AS ft_coa_id
      FROM fee_challans fc
      JOIN students    s  ON s.id  = fc.student_id  AND s.tenant_id  = $1::uuid
      JOIN fee_types   ft ON ft.id = fc.fee_type_id AND ft.tenant_id = $1::uuid
      WHERE fc.tenant_id = $1::uuid
        AND fc.amount > 0
        AND s.coa_id  IS NOT NULL
        AND ft.coa_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je
          WHERE je.source_module = 'fee-billed'
            AND je.source_ref_id = fc.id
            AND je.tenant_id     = $1::uuid
        )
    `, [tenantId]);

    if (!challans.length) {
      return res.json({ posted: 0, failed: 0, message: "No outstanding billing JEs to backfill." });
    }

    // Batch-resolve all COA accounts needed
    const neededCoaIds = [...new Set([
      ...challans.map(c => c.student_coa_id),
      ...challans.map(c => c.ft_coa_id),
    ])];
    const { rows: coaRows } = await pool.query<{ id: string; code: string; name: string }>(
      `SELECT id, code, name FROM chart_of_accounts WHERE id = ANY($1::uuid[]) AND tenant_id = $2::uuid`,
      [neededCoaIds, tenantId],
    );
    const coaMap = new Map(coaRows.map(r => [r.id, r]));

    let posted = 0, failed = 0;
    for (const c of challans) {
      const studentCoa = coaMap.get(c.student_coa_id);
      const ftCoa      = coaMap.get(c.ft_coa_id);
      if (!studentCoa || !ftCoa) { failed++; continue; }
      try {
        await createAndPostJE({
          tenantId,
          date:         c.issue_date,
          description:  `Fee billed — ${c.challan_number ?? c.id}`,
          reference:    c.challan_number ?? null,
          sourceModule: "fee-billed",
          sourceRefId:  c.id,
          lines: [
            { coaId: studentCoa.id, coaCode: studentCoa.code, coaName: studentCoa.name, debitAmount: c.amount,  creditAmount: 0,        narration: `Challan ${c.challan_number ?? c.id}` },
            { coaId: ftCoa.id,      coaCode: ftCoa.code,      coaName: ftCoa.name,      debitAmount: 0,         creditAmount: c.amount, narration: `Fee income recognised` },
          ],
        });
        posted++;
      } catch {
        failed++;
      }
    }
    return res.json({ posted, failed, message: `Billing JEs: ${posted} posted, ${failed} failed.` });
  } catch (err: any) {
    req.log.error({ err }, "POST /admin/coa/backfill-challan-jes failed");
    return res.status(500).json({ error: err?.message ?? "Backfill failed" });
  }
});

// ── POST /admin/coa/backfill-employees ────────────────────────────────────────

router.post("/admin/coa/backfill-employees", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const { rows } = await pool.query<{
      id: string; full_name: string; staff_id: string; role: string; contract_type: string | null;
    }>(
      `SELECT id, full_name, staff_id, role, contract_type
         FROM employees
        WHERE tenant_id = $1::uuid AND status = 'active' AND coa_id IS NULL`,
      [tenantId],
    );

    let created = 0, failed = 0;
    for (const e of rows) {
      const coaId = await syncEmployeeCoa(
        {
          id:           e.id,
          fullName:     e.full_name,
          staffId:      e.staff_id,
          role:         e.role,
          contractType: e.contract_type ?? "permanent",
        },
        tenantId,
      );
      if (coaId) created++; else failed++;
    }
    return res.json({ created, failed, message: `Employee sub-ledgers: ${created} created, ${failed} skipped/failed.` });
  } catch (err: any) {
    req.log.error({ err }, "POST /admin/coa/backfill-employees failed");
    return res.status(500).json({ error: err?.message ?? "Backfill failed" });
  }
});

/**
 * Called once at server startup.
 * 1. If chart_of_accounts is empty for any tenant, inserts the DEFAULT_ACCOUNTS.
 * 2. Then runs a full module backfill (fee types, bank accounts, store
 *    categories, vendors) so every linked record has a COA sub-account.
 * Fully idempotent — safe to call on every restart.
 */
export async function autoSeedCoa(): Promise<void> {
  try {
    const tenants = await db.select({ id: tenantsTable.id, slug: tenantsTable.slug }).from(tenantsTable);

    for (const tenant of tenants) {
      await seedCoaForTenant(tenant.id, tenant.slug);
      // Idempotent backfill: ensure the two system fine fee types exist (with COA
      // income accounts) for every existing tenant, not just newly created ones.
      try {
        await ensureFineFeeTypes(tenant.id);
      } catch (fineErr) {
        console.error("[autoSeedCoa] ensureFineFeeTypes failed for", tenant.slug ?? tenant.id, fineErr);
      }
    }

    // Backfill isSystemAccount=true for code 1100 on any tenant that was seeded
    // before this flag was introduced (one-time, idempotent).
    await db
      .update(chartOfAccountsTable)
      .set({ isSystemAccount: true })
      .where(
        and(
          eq(chartOfAccountsTable.code, "1100"),
          eq(chartOfAccountsTable.isSystemAccount, false),
        ),
      );

    // ── Task #49 migration: flatten fee-type COA accounts directly under 4000 ──
    // Re-parents any fee-type ledgers that currently sit under 4100–4560 to 4000,
    // then deletes the now-empty sub-group rows (skips any that still have JE lines).
    try {
      await pool.query(`
        UPDATE chart_of_accounts child
           SET parent_id = parent4000.id,
               updated_at = NOW()
          FROM chart_of_accounts parent4000
         WHERE parent4000.code      = '4000'
           AND parent4000.tenant_id = child.tenant_id
           AND child.parent_id IN (
                 SELECT id FROM chart_of_accounts
                 WHERE code IN ('4100','4200','4300','4400','4500',
                                '4510','4520','4530','4540','4550','4560')
                   AND tenant_id = child.tenant_id
               )
      `);

      await pool.query(`
        DELETE FROM chart_of_accounts coa
         WHERE coa.code IN ('4100','4200','4300','4400','4500',
                            '4510','4520','4530','4540','4550','4560')
           AND NOT EXISTS (
                 SELECT 1 FROM chart_of_accounts child WHERE child.parent_id = coa.id
               )
           AND NOT EXISTS (
                 SELECT 1 FROM journal_entry_lines jel WHERE jel.account_id = coa.id
               )
      `);
      console.log("[autoSeedCoa] Task #49 migration: fee sub-groups flattened under 4000");
    } catch (migErr) {
      console.error("[autoSeedCoa] Task #49 migration error (non-fatal):", migErr);
    }

    // ── Task #51 migration: remove legacy hardcoded standalone COA ledgers ────
    // Drops unused reference ledgers (source_module IS NULL) that no module ever
    // writes to. Guarded by no-JE + no-children so nothing with transactions or
    // a live child is removed. Leaf codes first, then now-empty group headers.
    // Only ever targets known legacy template codes; module-generated ledgers,
    // code-wired control accounts (2200, 5540/5550/5610/5640, 4300) and current
    // group headers are excluded. Idempotent — safe on every restart.
    try {
      await pool.query(`
        DELETE FROM chart_of_accounts coa
         WHERE coa.source_module IS NULL
           AND coa.code IN ('1210','1300','1310','1320','1510','1520','1530','1540','1550','1560','1570','1580',
                            '1810','1820','1830','1840','1850','2110','2210','2220','2230','2300','2310','2320',
                            '2400','2410','2420','2610','2620','2630','2640','3010','3100','3200','3300','3400',
                            '3500','3600','3700','4610','4620','4630','4710','4720','4730','4740','4750','4760',
                            '5020','5040','5060','5070','5080','5510','5520','5530','5560','5570','5620','5630',
                            '5710','5720','5730','5740','5750','5760','5810','5820','5830','5840','5845','5848',
                            '5855','5860','5865','5870','5910','5920','5930','5955','5960','5965','5970')
           AND NOT EXISTS (SELECT 1 FROM journal_entry_lines jel WHERE jel.account_id = coa.id)
           AND NOT EXISTS (SELECT 1 FROM chart_of_accounts child WHERE child.parent_id = coa.id)
      `);
      await pool.query(`
        DELETE FROM chart_of_accounts coa
         WHERE coa.source_module IS NULL
           AND coa.code IN ('1500','1800','2600','3000','4600','4700','5700','5800','5850','5900','5950')
           AND NOT EXISTS (SELECT 1 FROM journal_entry_lines jel WHERE jel.account_id = coa.id)
           AND NOT EXISTS (SELECT 1 FROM chart_of_accounts child WHERE child.parent_id = coa.id)
      `);
      console.log("[autoSeedCoa] Task #51 migration: legacy standalone COA ledgers removed");
    } catch (migErr) {
      console.error("[autoSeedCoa] Task #51 migration error (non-fatal):", migErr);
    }

    // ── Task #39 migration: unify Cash & Bank under single 1100 parent ────────
    // Idempotent — safe to run on every restart.
    try {
      await pool.query(`
        UPDATE chart_of_accounts
           SET name        = 'Cash & Bank Accounts',
               description = 'All cash and bank accounts'
         WHERE code = '1100'
           AND name IN ('Cash in Hand', 'Cash & Bank Accounts')
      `);

      // Re-parent any COA rows whose direct parent is 1110 → move them to 1100
      await pool.query(`
        UPDATE chart_of_accounts child
           SET parent_id = parent1100.id
          FROM chart_of_accounts parent1100
          JOIN chart_of_accounts parent1110
            ON parent1110.code = '1110'
           AND parent1110.tenant_id = parent1100.tenant_id
         WHERE parent1100.code    = '1100'
           AND child.parent_id    = parent1110.id
      `);

      // Delete 1110/1120/1130 seed rows that have no children and no JE lines
      for (const code of ["1110", "1120", "1130"]) {
        await pool.query(`
          DELETE FROM chart_of_accounts coa
          WHERE coa.code = $1
            AND NOT EXISTS (
              SELECT 1 FROM chart_of_accounts child WHERE child.parent_id = coa.id
            )
            AND NOT EXISTS (
              SELECT 1 FROM journal_entry_lines jel WHERE jel.account_id = coa.id
            )
        `, [code]);
      }
      console.log("[autoSeedCoa] Task #39 COA migration applied (1100 unified, 1110/1120/1130 pruned)");
    } catch (migErr) {
      console.error("[autoSeedCoa] Task #39 COA migration error (non-fatal):", migErr);
    }

    // Backfill module accounts for all existing records, scoped per-tenant
    for (const tenant of tenants) {
      const tenantFeeTypes = await db.select().from(feeTypesTable).where(eq(feeTypesTable.tenantId, tenant.id));
      const bankAccs       = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.tenantId, tenant.id));
      const cats           = await db.select().from(storeItemCategoriesTable).where(eq(storeItemCategoriesTable.tenantId, tenant.id));
      const vends          = await db.select().from(vendorsTable).where(eq(vendorsTable.tenantId, tenant.id));

      await Promise.all([
        ...tenantFeeTypes.map(ft => syncFeeTypeCoa({ id: ft.id, name: ft.name, feeCategory: ft.feeCategory, feeCode: ft.feeCode }, tenant.id)),
        ...bankAccs.map(ba       => syncBankAccountCoa({ id: ba.id, type: ba.type, accountTitle: ba.accountTitle, bankName: ba.bankName }, tenant.id)),
        ...cats.map(cat          => syncStoreCategoryCoa({ id: cat.id, name: cat.name }, tenant.id)),
        ...vends.map(v           => syncVendorCoa({ id: v.id, name: v.name, vendorCode: v.vendorCode }, tenant.id)),
      ]);
    }

    // Cross-tenant module-ledger cleanup. An earlier unscoped backfill fetched
    // bank_accounts / vendors / store_item_categories globally and synced them
    // into EVERY tenant, so each tenant's COA carried every other tenant's bank,
    // vendor and inventory ledgers. The scoped backfill above already re-links
    // each source row's coa_id to its correct same-tenant ledger; here we remove
    // the leaked orphans — a bank/vendor/store COA row whose source_ref_id has no
    // matching row in the SAME tenant. Runs on every boot (idempotent) so a
    // restore from an already-polluted backup cannot reintroduce the leak.
    try {
      const moduleSrc: Array<[string, string]> = [
        ["bank",   "bank_accounts"],
        ["vendor", "vendors"],
        ["store",  "store_item_categories"],
      ];
      for (const [mod, srcTable] of moduleSrc) {
        // Never hard-delete an orphan that somehow carries journal lines —
        // deactivate it and keep it for audit instead.
        await pool.query(`
          UPDATE chart_of_accounts coa
             SET is_active = false, updated_at = now()
           WHERE coa.source_module = $1
             AND coa.source_ref_id IS NOT NULL
             AND coa.is_active = true
             AND NOT EXISTS (
               SELECT 1 FROM ${srcTable} s
               WHERE s.id = coa.source_ref_id AND s.tenant_id = coa.tenant_id
             )
             AND EXISTS (
               SELECT 1 FROM journal_entry_lines jel WHERE jel.account_id = coa.id
             )
        `, [mod]);
        // Delete the remaining orphans (no journal lines, no children).
        await pool.query(`
          DELETE FROM chart_of_accounts coa
           WHERE coa.source_module = $1
             AND coa.source_ref_id IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM ${srcTable} s
               WHERE s.id = coa.source_ref_id AND s.tenant_id = coa.tenant_id
             )
             AND NOT EXISTS (
               SELECT 1 FROM journal_entry_lines jel WHERE jel.account_id = coa.id
             )
             AND NOT EXISTS (
               SELECT 1 FROM chart_of_accounts child WHERE child.parent_id = coa.id
             )
        `, [mod]);
      }
      console.log("[autoSeedCoa] cross-tenant module-ledger cleanup applied (bank/vendor/store)");
    } catch (cleanErr) {
      console.error("[autoSeedCoa] cross-tenant module-ledger cleanup error (non-fatal):", cleanErr);
    }
  } catch (err) {
    // Non-fatal — log and continue so the server still starts
    console.error("[autoSeedCoa] error:", err);
  }
}
