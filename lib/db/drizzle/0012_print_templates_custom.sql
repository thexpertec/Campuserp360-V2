-- Add custom-template support to print_templates
-- is_custom: marks admin-created (non-built-in) templates
-- category:  tag palette / audience for custom templates ("builtin" | "student" | "employee")
-- Applied: 2026-06-30

ALTER TABLE "print_templates"
  ADD COLUMN IF NOT EXISTS "is_custom" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "category"  text    NOT NULL DEFAULT 'builtin';
