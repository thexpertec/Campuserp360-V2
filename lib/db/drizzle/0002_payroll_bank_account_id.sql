-- Migration: add bank_account_id to employee_salary_transactions
-- Records the institution bank account used when a salary is paid out.
ALTER TABLE "employee_salary_transactions" ADD COLUMN IF NOT EXISTS "bank_account_id" uuid;
