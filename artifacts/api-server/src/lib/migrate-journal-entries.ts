import { pool } from "@workspace/db";

export async function migrateJournalEntries(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID          NOT NULL,
      date            DATE          NOT NULL,
      narration       TEXT,
      source_module   TEXT,
      source_ref_id   UUID,
      is_voided       BOOLEAN       NOT NULL DEFAULT false,
      voided_at       TIMESTAMPTZ,
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS journal_entry_lines (
      id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
      journal_entry_id  UUID            NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_id        UUID            NOT NULL,
      dr_amount         NUMERIC(14,2)   NOT NULL DEFAULT 0,
      cr_amount         NUMERIC(14,2)   NOT NULL DEFAULT 0,
      memo              TEXT,
      sort_order        INTEGER         NOT NULL DEFAULT 0,
      created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
    )
  `);

  // Additive column additions — safe to run on an existing table
  await pool.query(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS created_by  UUID`);
  await pool.query(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS posted_at   TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS source_ref  TEXT`);

  // COA sub-ledger FK on students (employees already has coa_id in Drizzle schema)
  await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS coa_id UUID`);

  // Ensure parent accounts that will hold student/employee sub-ledgers are
  // kind='group' so the SetupCOA tree renders them as expandable nodes.
  // Idempotent — safe to run on every restart.
  await pool.query(`
    UPDATE chart_of_accounts
       SET kind = 'group'
     WHERE code IN ('1200', '5010', '5030', '5050')
       AND kind <> 'group'
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS je_tenant_idx   ON journal_entries(tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS je_date_idx     ON journal_entries(date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS je_source_idx   ON journal_entries(source_module, source_ref_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS jel_je_idx      ON journal_entry_lines(journal_entry_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS jel_account_idx ON journal_entry_lines(account_id)`);
}
