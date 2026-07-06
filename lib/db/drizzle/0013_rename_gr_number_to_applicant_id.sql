-- Rename gr_number → applicant_id across all five tables
-- Data is preserved; only the column name changes.

ALTER TABLE students           RENAME COLUMN gr_number TO applicant_id;
ALTER TABLE library_issues     RENAME COLUMN gr_number TO applicant_id;
ALTER TABLE hostel_allocations RENAME COLUMN gr_number TO applicant_id;
ALTER TABLE gate_outpass       RENAME COLUMN gr_number TO applicant_id;
ALTER TABLE medical_visits     RENAME COLUMN gr_number TO applicant_id;

-- Rename the unique index on students
ALTER INDEX IF EXISTS students_gr_number_idx RENAME TO students_applicant_id_idx;

-- Rename the gate_outpass index
ALTER INDEX IF EXISTS gate_outpass_gr_idx RENAME TO gate_outpass_applicant_id_idx;
