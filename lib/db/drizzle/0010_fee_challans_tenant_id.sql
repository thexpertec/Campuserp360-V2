-- Add tenant_id to fee_challans to satisfy RLS INSERT policy
-- Applied: 2026-06-28

ALTER TABLE "fee_challans" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE RESTRICT;

-- Backfill existing rows via fee_types (students.tenant_id was NULL due to
-- pre-existing cross-tenant data corruption, so fee_types is the reliable path)
UPDATE "fee_challans" fc
SET "tenant_id" = ft."tenant_id"
FROM "fee_types" ft
WHERE fc."fee_type_id" = ft."id"
  AND fc."tenant_id" IS NULL;

-- Enforce NOT NULL once all rows are populated
ALTER TABLE "fee_challans" ALTER COLUMN "tenant_id" SET NOT NULL;
