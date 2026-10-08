UPDATE payroll_periods pp
SET company_id = b."companyId"
FROM branches b
WHERE pp.branch_id = b.id
  AND pp.company_id IS NULL;

DROP INDEX IF EXISTS payroll_periods_tenant_year_month_key;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_periods_branch_period_key
  ON payroll_periods(tenant_id,company_id,branch_id,year,month)
  WHERE branch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_periods_central_period_key
  ON payroll_periods(tenant_id,company_id,year,month)
  WHERE branch_id IS NULL;
