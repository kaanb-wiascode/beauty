CREATE TABLE IF NOT EXISTS hr_job_postings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  title TEXT NOT NULL,
  department_name TEXT,
  position_name TEXT,
  employment_type TEXT,
  location TEXT,
  description TEXT,
  requirements TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  published_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS hr_job_postings_scope_idx
  ON hr_job_postings(tenant_id, company_id, branch_id, status);

CREATE TABLE IF NOT EXISTS hr_candidates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  city TEXT,
  source TEXT,
  current_title TEXT,
  cv_url TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_candidates_email_unique
  ON hr_candidates(tenant_id, company_id, email)
  WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS hr_job_applications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  job_posting_id TEXT NOT NULL REFERENCES hr_job_postings(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES hr_candidates(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'APPLIED',
  rating NUMERIC(5,2),
  owner_staff_id TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  hired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_posting_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS hr_job_applications_scope_stage_idx
  ON hr_job_applications(tenant_id, company_id, stage, applied_at DESC);

CREATE TABLE IF NOT EXISTS hr_interviews (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  application_id TEXT NOT NULL REFERENCES hr_job_applications(id) ON DELETE CASCADE,
  interview_type TEXT NOT NULL DEFAULT 'INTERVIEW',
  scheduled_at TIMESTAMPTZ NOT NULL,
  interviewer_staff_id TEXT,
  location TEXT,
  score NUMERIC(5,2),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS hr_interviews_application_idx
  ON hr_interviews(application_id, scheduled_at);

CREATE TABLE IF NOT EXISTS hr_job_offers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  application_id TEXT NOT NULL REFERENCES hr_job_applications(id) ON DELETE CASCADE,
  offered_title TEXT,
  gross_salary NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'TRY',
  start_date DATE,
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  notes TEXT,
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS hr_job_offers_application_idx
  ON hr_job_offers(application_id, status);
