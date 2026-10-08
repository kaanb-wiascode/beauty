CREATE TABLE IF NOT EXISTS payroll_tax_base_opening_balances (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  tax_year INTEGER NOT NULL,
  cumulative_tax_base DECIMAL(14,2) NOT NULL DEFAULT 0,
  source_reference TEXT,
  note TEXT,
  recorded_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_tax_base_opening_balances_year_check CHECK (tax_year BETWEEN 2000 AND 2200),
  CONSTRAINT payroll_tax_base_opening_balances_amount_check CHECK (cumulative_tax_base >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_tax_base_opening_balances_staff_year_key
  ON payroll_tax_base_opening_balances(tenant_id,company_id,staff_id,tax_year);

CREATE INDEX IF NOT EXISTS payroll_tax_base_opening_balances_scope_idx
  ON payroll_tax_base_opening_balances(tenant_id,company_id,branch_id,tax_year);
