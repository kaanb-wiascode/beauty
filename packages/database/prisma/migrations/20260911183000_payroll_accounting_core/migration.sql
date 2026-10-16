ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS company_id TEXT,
  ADD COLUMN IF NOT EXISTS branch_id TEXT,
  ADD COLUMN IF NOT EXISTS approved_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS journal_entry_id TEXT;

ALTER TABLE payroll_items
  ADD COLUMN IF NOT EXISTS company_id TEXT,
  ADD COLUMN IF NOT EXISTS cost_center_id TEXT,
  ADD COLUMN IF NOT EXISTS income_tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stamp_tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employee_social_security NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unemployment_employee NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employer_social_security NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unemployment_employer NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calculation_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE payroll_items pi
SET company_id=b."companyId"
FROM branches b
WHERE pi.branch_id=b.id AND pi.company_id IS NULL;

UPDATE payroll_periods pp
SET company_id=x.company_id, branch_id=x.branch_id
FROM (
  SELECT period_id, MIN(company_id) AS company_id,
         CASE WHEN COUNT(DISTINCT branch_id)=1 THEN MIN(branch_id) ELSE NULL END AS branch_id
  FROM payroll_items GROUP BY period_id
) x
WHERE pp.id=x.period_id AND pp.company_id IS NULL;

CREATE INDEX IF NOT EXISTS payroll_periods_company_period_idx ON payroll_periods(company_id,year,month,status);
CREATE INDEX IF NOT EXISTS payroll_items_company_period_idx ON payroll_items(company_id,period_id);
CREATE INDEX IF NOT EXISTS payroll_items_cost_center_idx ON payroll_items(cost_center_id,period_id);

ALTER TABLE payroll_periods DROP CONSTRAINT IF EXISTS payroll_periods_company_fkey;
ALTER TABLE payroll_periods ADD CONSTRAINT payroll_periods_company_fkey FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT;
ALTER TABLE payroll_items DROP CONSTRAINT IF EXISTS payroll_items_company_fkey;
ALTER TABLE payroll_items ADD CONSTRAINT payroll_items_company_fkey FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT;
ALTER TABLE payroll_items DROP CONSTRAINT IF EXISTS payroll_items_cost_center_fkey;
ALTER TABLE payroll_items ADD CONSTRAINT payroll_items_cost_center_fkey FOREIGN KEY(cost_center_id) REFERENCES cost_centers(id) ON DELETE SET NULL;

ALTER TABLE payroll_items DROP CONSTRAINT IF EXISTS payroll_items_amounts_nonnegative_chk;
ALTER TABLE payroll_items ADD CONSTRAINT payroll_items_amounts_nonnegative_chk CHECK (
  gross_amount>=0 AND net_amount>=0 AND deductions>=0 AND employer_cost>=0 AND
  income_tax>=0 AND stamp_tax>=0 AND employee_social_security>=0 AND unemployment_employee>=0 AND
  employer_social_security>=0 AND unemployment_employer>=0 AND other_deductions>=0
) NOT VALID;