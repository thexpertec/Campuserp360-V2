import { db, pool } from "@workspace/db";
import {
  chartOfAccountsTable,
  bankAccountsTable,
  journalEntriesTable,
} from "@workspace/db";
import { eq, and, or } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JELine {
  coaId?:       string | null;
  coaCode:      string;
  coaName:      string;
  debitAmount:  number;
  creditAmount: number;
  narration?:   string | null;
}

export interface CreateJEInput {
  tenantId?:     string | null;
  date:          string;
  description:   string;
  reference?:    string | null;   // human-readable source_ref (e.g. voucher number)
  sourceModule?: string | null;
  sourceRefId?:  string | null;   // UUID FK to source document
  createdBy?:    string | null;   // admin/user UUID who posted
  notes?:        string | null;
  lines:         JELine[];
}

// ── COA lookup helpers ────────────────────────────────────────────────────────

export async function coaByCode(code: string, tenantId?: string | null): Promise<{ id: string; code: string; name: string } | null> {
  const [row] = await db
    .select({ id: chartOfAccountsTable.id, code: chartOfAccountsTable.code, name: chartOfAccountsTable.name })
    .from(chartOfAccountsTable)
    .where(tenantId
      ? and(eq(chartOfAccountsTable.code, code), eq(chartOfAccountsTable.tenantId, tenantId))
      : eq(chartOfAccountsTable.code, code))
    .limit(1);
  return row ?? null;
}

export async function coaById(id: string, tenantId?: string | null): Promise<{ id: string; code: string; name: string } | null> {
  const [row] = await db
    .select({ id: chartOfAccountsTable.id, code: chartOfAccountsTable.code, name: chartOfAccountsTable.name })
    .from(chartOfAccountsTable)
    .where(tenantId
      ? and(eq(chartOfAccountsTable.id, id), eq(chartOfAccountsTable.tenantId, tenantId))
      : eq(chartOfAccountsTable.id, id))
    .limit(1);
  return row ?? null;
}

// ── COA auto-seed helper ──────────────────────────────────────────────────────
// Ensures a COA account (and its parent chain) exists for a tenant.
// Returns the account row, creating it (and any missing ancestors) if absent.
// All inserts use ON CONFLICT DO NOTHING for idempotency.

interface SeedSpec {
  code:          string;
  name:          string;
  type:          "asset" | "income";
  kind:          "group" | "ledger";
  normalBalance: "dr" | "cr";
  sortOrder:     number;
  parentCode:    string | null;
}

const APP_FEE_COA_CHAIN: SeedSpec[] = [
  // Asset chain for cash/bank debit side
  { code: "1000", name: "Current Assets",       type: "asset",  kind: "group",  normalBalance: "dr", sortOrder: 10, parentCode: null   },
  { code: "1100", name: "Cash & Bank Accounts", type: "asset",  kind: "group",  normalBalance: "dr", sortOrder: 10, parentCode: "1000" },
  { code: "1110", name: "Cash at Hand",          type: "asset",  kind: "ledger", normalBalance: "dr", sortOrder: 10, parentCode: "1100" },
  // Income chain for application-fee credit side
  { code: "4000", name: "Fee Income",                        type: "income", kind: "group",  normalBalance: "cr", sortOrder: 10, parentCode: null   },
  { code: "4300", name: "Admission & Registration Fee",      type: "income", kind: "ledger", normalBalance: "cr", sortOrder: 30, parentCode: "4000" },
];

async function ensureCoa(
  targetCode: string,
  tenantId:   string,
  logger?:    { warn: (obj: unknown, msg: string) => void },
): Promise<{ id: string; code: string; name: string } | null> {
  // Return immediately if already present
  const existing = await coaByCode(targetCode, tenantId);
  if (existing) return existing;

  // Determine which chain to walk (asset chain or income chain)
  const chain = APP_FEE_COA_CHAIN.filter(s =>
    targetCode.startsWith("1") ? s.type === "asset" : s.type === "income"
  );

  const codeToId = new Map<string, string>();

  // Pre-load any already-existing ancestors
  for (const spec of chain) {
    const row = await coaByCode(spec.code, tenantId);
    if (row) codeToId.set(spec.code, row.id);
  }

  // Insert any missing members of the chain up to and including targetCode
  for (const spec of chain) {
    if (codeToId.has(spec.code)) continue;

    const parentId = spec.parentCode ? (codeToId.get(spec.parentCode) ?? null) : null;

    const [inserted] = await db
      .insert(chartOfAccountsTable)
      .values({
        tenantId,
        code:          spec.code,
        name:          spec.name,
        type:          spec.type,
        kind:          spec.kind,
        normalBalance: spec.normalBalance,
        parentId,
        sortOrder:     spec.sortOrder,
      })
      .onConflictDoNothing()
      .returning({ id: chartOfAccountsTable.id });

    if (inserted) {
      codeToId.set(spec.code, inserted.id);
    } else {
      // Raced with another request — fetch what's there
      const raced = await coaByCode(spec.code, tenantId);
      if (raced) codeToId.set(spec.code, raced.id);
    }

    if (spec.code === targetCode) break;
  }

  const result = await coaByCode(targetCode, tenantId);
  if (!result) {
    logger?.warn({ tenantId, targetCode }, "ensureCoa: failed to seed COA account");
  }
  return result;
}

// ── Application Fee JE helper ─────────────────────────────────────────────────
// Shared across all three confirmation paths (bank-confirm, cash-record, online
// gateway).  Handles idempotency, auto-seeds missing COA accounts, and returns
// a structured result so callers can surface a jeWarning when the ledger posting
// fails without failing the HTTP response itself.

export interface PostApplicationFeeJEInput {
  tenantId:        string;
  amount:          number;
  reference:       string | null;
  date:            string;          // YYYY-MM-DD
  sourceRefId:     string;          // JE idempotency key — app.id (admin) or txn.id (online)
  description?:    string;
  narrationDebit?: string;
  narrationCredit?: string;
  logger?:         { warn: (obj: unknown, msg: string) => void; error: (obj: unknown, msg: string) => void };
}

export interface PostApplicationFeeJEResult {
  ok:       boolean;
  jeId?:    string;
  warning?: string;
}

export async function postApplicationFeeJE(
  input: PostApplicationFeeJEInput,
): Promise<PostApplicationFeeJEResult> {
  const {
    tenantId, amount, reference, date, sourceRefId,
    description = "Application fee received",
    narrationDebit  = reference ?? "Bank / Cash",
    narrationCredit = "Application fee",
    logger,
  } = input;

  if (!(amount > 0)) {
    return { ok: false, warning: "application-fee JE skipped: amount is not greater than zero" };
  }

  try {
    // ── Idempotency: skip if a JE was already posted for this source document ──
    const [existing] = await db
      .select({ id: journalEntriesTable.id })
      .from(journalEntriesTable)
      .where(and(
        eq(journalEntriesTable.sourceModule, "application-fee"),
        eq(journalEntriesTable.sourceRefId, sourceRefId),
      ))
      .limit(1);
    if (existing) return { ok: true, jeId: existing.id };

    // ── Resolve bank/cash COA (DR side) ──────────────────────────────────────
    // Preference: linked bank account COA → code 1110 → auto-seed 1110
    const [acct] = await db
      .select({ coaId: bankAccountsTable.coaId })
      .from(bankAccountsTable)
      .where(and(eq(bankAccountsTable.tenantId, tenantId), eq(bankAccountsTable.isActive, true)))
      .orderBy(bankAccountsTable.sortOrder)
      .limit(1);

    let bankCoa = (acct?.coaId ? await coaById(acct.coaId, tenantId) : null)
      ?? await coaByCode("1110", tenantId);

    if (!bankCoa) {
      // Auto-seed 1000 → 1100 → 1110 for this tenant
      logger?.warn({ tenantId }, "application-fee JE: cash/bank COA not found — auto-seeding 1110");
      bankCoa = await ensureCoa("1110", tenantId, logger);
    }

    if (!bankCoa) {
      const w = "application-fee JE skipped: could not resolve or seed cash/bank COA (1110)";
      logger?.error({ tenantId }, w);
      return { ok: false, warning: w };
    }

    // ── Resolve Application Fee Income COA 4300 (CR side) ────────────────────
    let feeCoa = await coaByCode("4300", tenantId);

    if (!feeCoa) {
      // Auto-seed 4000 → 4300 for this tenant
      logger?.warn({ tenantId }, "application-fee JE: COA 4300 not found — auto-seeding");
      feeCoa = await ensureCoa("4300", tenantId, logger);
    }

    if (!feeCoa) {
      const w = "application-fee JE skipped: could not resolve or seed COA 4300 (Admission & Registration Fee)";
      logger?.error({ tenantId }, w);
      return { ok: false, warning: w };
    }

    // ── Post the journal entry ────────────────────────────────────────────────
    const jeId = await createAndPostJE({
      tenantId,
      date,
      description,
      reference,
      sourceModule: "application-fee",
      sourceRefId,
      lines: [
        { coaId: bankCoa.id, coaCode: bankCoa.code, coaName: bankCoa.name, debitAmount: amount, creditAmount: 0,      narration: narrationDebit  },
        { coaId: feeCoa.id,  coaCode: feeCoa.code,  coaName: feeCoa.name,  debitAmount: 0,      creditAmount: amount, narration: narrationCredit },
      ],
    });

    return { ok: true, jeId };
  } catch (err: any) {
    // Silently swallow table-not-yet-created errors on first boot
    if (err?.code === "42P01") return { ok: false, warning: "application-fee JE skipped: JE tables not yet created" };
    const w = `application-fee JE failed: ${err?.message ?? String(err)}`;
    if (logger) {
      logger.error({ err }, w);
    } else {
      console.error("[je-factory] postApplicationFeeJE failed:", err);
    }
    return { ok: false, warning: w };
  }
}

// ── Journal Entry posting ─────────────────────────────────────────────────────
// Creates a balanced double-entry JE in journal_entries + journal_entry_lines.
// Returns the new journal_entries.id.

// Shared type for a minimal query-capable DB client (PoolClient duck-type).
type QueryClient = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };

function validateJEInput(input: CreateJEInput): void {
  if (!input.tenantId) throw new Error("createAndPostJE: tenantId is required");
  const totalDr = input.lines.reduce((s, l) => s + l.debitAmount, 0);
  const totalCr = input.lines.reduce((s, l) => s + l.creditAmount, 0);
  if (Math.abs(totalDr - totalCr) > 0.001) {
    throw new Error(`createAndPostJE: JE is unbalanced — DR ${totalDr} ≠ CR ${totalCr}`);
  }
}

async function _insertJE(client: QueryClient, input: CreateJEInput): Promise<string> {
  const { tenantId, date, description, reference, sourceModule, sourceRefId, createdBy, lines } = input;

  const jeRes = await client.query(`
    INSERT INTO journal_entries
      (tenant_id, date, narration, source_ref, source_module, source_ref_id, created_by, posted_at)
    VALUES
      ($1::uuid, $2::date, $3, $4, $5, $6, $7, NOW())
    RETURNING id
  `, [tenantId, date, description, reference ?? null, sourceModule ?? null, sourceRefId ?? null, createdBy ?? null]);

  const jeId = (jeRes.rows[0] as { id: string }).id;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.coaId) continue;
    await client.query(`
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, dr_amount, cr_amount, memo, sort_order)
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
    `, [jeId, l.coaId, l.debitAmount, l.creditAmount, l.narration ?? null, i]);
  }

  return jeId;
}

// Use when the caller manages its own BEGIN/COMMIT/ROLLBACK transaction.
export async function insertJEWithinTransaction(client: QueryClient, input: CreateJEInput): Promise<string> {
  validateJEInput(input);
  return _insertJE(client, input);
}

// Standalone self-contained call: opens a client, runs a transaction, releases.
export async function createAndPostJE(input: CreateJEInput): Promise<string> {
  validateJEInput(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const jeId = await _insertJE(client, input);
    await client.query("COMMIT");
    return jeId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function tryCreateAndPostJE(
  input: CreateJEInput,
  logger?: { error: (obj: any, msg: string) => void },
): Promise<string | null> {
  try {
    return await createAndPostJE(input);
  } catch (err: any) {
    // Silently ignore undefined_table (42P01) — migration still pending on first boot
    if (err?.code === "42P01") return null;
    if (logger) {
      logger.error({ err }, "tryCreateAndPostJE failed");
    } else {
      console.error("[je-factory] tryCreateAndPostJE failed", err);
    }
    return null;
  }
}
