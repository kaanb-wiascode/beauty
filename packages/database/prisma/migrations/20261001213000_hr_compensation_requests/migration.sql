CREATE TABLE IF NOT EXISTS hr_compensation_requests (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  branch_id text NOT NULL,
  staff_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('BONUS','COMMISSION')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'TRY',
  period_year integer NOT NULL CHECK (period_year BETWEEN 2000 AND 2200),
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED','APPLIED')),
  approval_request_id text,
  requested_by_user_id text NOT NULL,
  approved_at timestamptz,
  applied_payroll_period_id text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_compensation_requests_scope
  ON hr_compensation_requests(tenant_id,company_id,branch_id,period_year,period_month,status);

CREATE INDEX IF NOT EXISTS idx_hr_compensation_requests_staff
  ON hr_compensation_requests(tenant_id,company_id,staff_id,period_year,period_month);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_compensation_requests_approval_request
  ON hr_compensation_requests(approval_request_id)
  WHERE approval_request_id IS NOT NULL;
