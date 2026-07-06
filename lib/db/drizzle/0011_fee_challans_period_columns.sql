-- Add period tracking columns to fee_challans for multi-month duration support
-- Supports durations: single, bi-monthly, tri-monthly, tetra-monthly, six-monthly, annual
-- Applied: 2026-06-29

ALTER TABLE "fee_challans"
  ADD COLUMN IF NOT EXISTS "period_month_start" text,
  ADD COLUMN IF NOT EXISTS "period_month_end"   text;

CREATE INDEX IF NOT EXISTS "fee_challans_period_start_idx"
  ON "fee_challans" ("period_month_start");
