ALTER TABLE hr_job_applications
  ADD COLUMN IF NOT EXISTS hired_staff_id TEXT;

CREATE INDEX IF NOT EXISTS hr_job_applications_hired_staff_idx
  ON hr_job_applications(tenant_id, company_id, hired_staff_id)
  WHERE hired_staff_id IS NOT NULL;
