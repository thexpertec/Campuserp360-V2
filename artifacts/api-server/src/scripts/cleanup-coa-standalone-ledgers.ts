/**
 * One-time cleanup: remove standalone COA ledgers that no module writes to.
 *
 * Safe to re-run: accounts with journal_entry_lines are skipped and logged.
 * Run order: leaf accounts first, then now-empty group accounts.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server tsx src/scripts/cleanup-coa-standalone-ledgers.ts
 */

import { pool } from "@workspace/db";

const LEAF_CODES = [
  "1210","1300","1310","1320",
  "1510","1520","1530","1540","1550","1560","1570","1580",
  "1810","1820","1830","1840","1850",
  "2110","2210","2220","2230","2300","2310","2320","2400","2410","2420",
  "2610","2620","2630","2640",
  "3010","3100","3200","3300","3400","3500","3600","3700",
  "4610","4620","4630",
  "4710","4720","4730","4740","4750","4760",
  "5020","5040","5060","5070","5080",
  "5510","5520","5530","5560","5570",
  "5620","5630",
  "5710","5720","5730","5740","5750","5760",
  "5810","5820","5830","5840","5845","5848",
  "5855","5860","5865","5870",
  "5910","5920","5930",
  "5955","5960","5965","5970",
];

const GROUP_CODES = [
  "1500","1800","2600","3000","4600","4700","5700","5800","5850","5900","5950",
];

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const leafPlaceholders = LEAF_CODES.map((_, i) => `$${i + 1}`).join(",");
    const leafRes = await client.query<{ code: string; name: string; tenant_id: string }>(`
      WITH to_delete AS (
        SELECT id, code, name, tenant_id
        FROM chart_of_accounts
        WHERE code IN (${leafPlaceholders})
          AND source_module IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM journal_entry_lines jel WHERE jel.account_id = chart_of_accounts.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM chart_of_accounts child WHERE child.parent_id = chart_of_accounts.id
          )
      )
      DELETE FROM chart_of_accounts WHERE id IN (SELECT id FROM to_delete)
      RETURNING code, name, tenant_id
    `, LEAF_CODES);

    console.log(`[cleanup-coa] Deleted ${leafRes.rowCount} leaf accounts`);

    const skippedLeafsRes = await client.query<{ code: string; name: string; tenant_id: string; je_count: string }>(`
      SELECT coa.code, coa.name, coa.tenant_id, COUNT(jel.id)::text AS je_count
      FROM chart_of_accounts coa
      JOIN journal_entry_lines jel ON jel.account_id = coa.id
      WHERE coa.code IN (${leafPlaceholders})
      GROUP BY coa.code, coa.name, coa.tenant_id
    `, LEAF_CODES);

    if (skippedLeafsRes.rowCount && skippedLeafsRes.rowCount > 0) {
      console.warn("[cleanup-coa] Skipped leaf accounts (have JE lines):");
      for (const r of skippedLeafsRes.rows) {
        console.warn(`  tenant=${r.tenant_id} code=${r.code} name="${r.name}" je_lines=${r.je_count}`);
      }
    }

    const groupPlaceholders = GROUP_CODES.map((_, i) => `$${i + 1}`).join(",");
    const groupRes = await client.query<{ code: string; name: string }>(`
      WITH to_delete AS (
        SELECT id, code, name
        FROM chart_of_accounts
        WHERE code IN (${groupPlaceholders})
          AND source_module IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM journal_entry_lines jel WHERE jel.account_id = chart_of_accounts.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM chart_of_accounts child WHERE child.parent_id = chart_of_accounts.id
          )
      )
      DELETE FROM chart_of_accounts WHERE id IN (SELECT id FROM to_delete)
      RETURNING code, name
    `, GROUP_CODES);

    console.log(`[cleanup-coa] Deleted ${groupRes.rowCount} now-empty group accounts`);

    const skippedGroupsRes = await client.query<{ code: string; name: string; reason: string }>(`
      SELECT coa.code, coa.name,
        CASE
          WHEN EXISTS (SELECT 1 FROM journal_entry_lines jel WHERE jel.account_id = coa.id)
            THEN 'has JE lines'
          WHEN EXISTS (SELECT 1 FROM chart_of_accounts child WHERE child.parent_id = coa.id)
            THEN 'still has children'
          ELSE 'unknown'
        END AS reason
      FROM chart_of_accounts coa
      WHERE coa.code IN (${groupPlaceholders})
    `, GROUP_CODES);

    if (skippedGroupsRes.rowCount && skippedGroupsRes.rowCount > 0) {
      console.warn("[cleanup-coa] Skipped group accounts:");
      for (const r of skippedGroupsRes.rows) {
        console.warn(`  code=${r.code} name="${r.name}" reason="${r.reason}"`);
      }
    }

    await client.query("COMMIT");
    console.log("[cleanup-coa] Done.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[cleanup-coa] ROLLBACK due to error:", err);
    process.exit(1);
  } finally {
    client.release();
  }
}

main();
