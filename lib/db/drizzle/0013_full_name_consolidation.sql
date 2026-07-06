-- Migration: consolidate split name fields into a single full_name column
-- Applies to: students, employees, applications tables

-- students
ALTER TABLE students ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';
UPDATE students SET full_name = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) WHERE full_name = '';
ALTER TABLE students DROP COLUMN IF EXISTS first_name;
ALTER TABLE students DROP COLUMN IF EXISTS last_name;

-- employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';
UPDATE employees SET full_name = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) WHERE full_name = '';
ALTER TABLE employees DROP COLUMN IF EXISTS first_name;
ALTER TABLE employees DROP COLUMN IF EXISTS last_name;

-- applications
ALTER TABLE applications ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';
UPDATE applications SET full_name = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) WHERE full_name = '';
ALTER TABLE applications DROP COLUMN IF EXISTS first_name;
ALTER TABLE applications DROP COLUMN IF EXISTS last_name;
