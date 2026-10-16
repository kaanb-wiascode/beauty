CREATE TABLE IF NOT EXISTS hr_attendance_period_closures (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
  payroll_period_id TEXT REFERENCES payroll_periods(id) ON DELETE RESTRICT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'CLOSED',
  staff_count INTEGER NOT NULL DEFAULT 0,
  attendance_record_count INTEGER NOT NULL DEFAULT 0,
  open_exception_count INTEGER NOT NULL DEFAULT 0,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  closed_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  closed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT hr_attendance_period_closures_year_check CHECK (year BETWEEN 2000 AND 2200),
  CONSTRAINT hr_attendance_period_closures_month_check CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT hr_attendance_period_closures_range_check CHECK (period_start <= period_end),
  CONSTRAINT hr_attendance_period_closures_status_check CHECK (status IN ('CLOSED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_attendance_period_closures_scope_period_key
  ON hr_attendance_period_closures(
    tenant_id,
    company_id,
    year,
    month,
    COALESCE(branch_id, '')
  );

CREATE INDEX IF NOT EXISTS hr_attendance_period_closures_payroll_period_idx
  ON hr_attendance_period_closures(payroll_period_id);

CREATE INDEX IF NOT EXISTS hr_attendance_period_closures_closed_at_idx
  ON hr_attendance_period_closures(tenant_id, company_id, closed_at DESC);
