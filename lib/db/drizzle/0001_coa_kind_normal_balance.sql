-- Migration: add kind and normal_balance columns to chart_of_accounts
ALTER TABLE "chart_of_accounts" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'group';
ALTER TABLE "chart_of_accounts" ADD COLUMN IF NOT EXISTS "normal_balance" text NOT NULL DEFAULT 'dr';

-- Backfill kind: accounts that have children become groups; leaf accounts become ledgers
UPDATE "chart_of_accounts"
SET kind = 'group'
WHERE id IN (SELECT DISTINCT parent_id FROM "chart_of_accounts" WHERE parent_id IS NOT NULL);

UPDATE "chart_of_accounts"
SET kind = 'ledger'
WHERE id NOT IN (SELECT DISTINCT parent_id FROM "chart_of_accounts" WHERE parent_id IS NOT NULL);

-- Backfill normal_balance from account type
UPDATE "chart_of_accounts" SET normal_balance = 'cr'
WHERE type IN ('liability', 'equity', 'income');

UPDATE "chart_of_accounts" SET normal_balance = 'dr'
WHERE type IN ('asset', 'expense');
