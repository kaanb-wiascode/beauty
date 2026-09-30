ALTER TABLE hr_job_postings
  ADD COLUMN IF NOT EXISTS department_id TEXT,
  ADD COLUMN IF NOT EXISTS position_id TEXT;

CREATE INDEX IF NOT EXISTS hr_job_postings_department_idx
  ON hr_job_postings(tenant_id,company_id,department_id)
  WHERE department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hr_job_postings_position_idx
  ON hr_job_postings(tenant_id,company_id,position_id)
  WHERE position_id IS NOT NULL;
