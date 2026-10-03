ALTER TABLE sgk_records
  ADD COLUMN IF NOT EXISTS employee_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employer_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS sgk_records_tenant_staff_period_uq
  ON sgk_records(tenant_id,staff_id,period_year,period_month);
