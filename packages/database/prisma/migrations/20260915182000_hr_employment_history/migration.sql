CREATE TABLE IF NOT EXISTS hr_employment_history (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE ON UPDATE CASCADE,
  event_type TEXT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  employment_type TEXT,
  gross_salary DECIMAL(14,2),
  salary_type TEXT,
  cost_center_id TEXT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT hr_employment_history_dates_chk CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT hr_employment_history_event_chk CHECK (event_type IN ('HIRED','EMPLOYMENT_TYPE_CHANGE','SALARY_CHANGE','COST_CENTER_CHANGE','SUSPENDED','REACTIVATED','TERMINATED','OTHER'))
);
CREATE INDEX IF NOT EXISTS hr_employment_history_staff_idx ON hr_employment_history(tenant_id,staff_id,effective_from DESC);
CREATE INDEX IF NOT EXISTS hr_employment_history_branch_idx ON hr_employment_history(tenant_id,branch_id,effective_from DESC);
CREATE UNIQUE INDEX IF NOT EXISTS hr_employment_history_active_idx ON hr_employment_history(tenant_id,staff_id) WHERE effective_to IS NULL;

INSERT INTO hr_employment_history(id,tenant_id,company_id,branch_id,staff_id,event_type,effective_from,employment_type,gross_salary,salary_type,reason,metadata)
SELECT 'employment-' || emr.staff_id,emr.tenant_id,b."companyId",emr.branch_id,emr.staff_id,'HIRED',COALESCE(emr.hire_date,s."createdAt"::date),emr.employment_type,emr.gross_salary,emr.salary_type,'INITIAL_BACKFILL','{}'::jsonb
FROM employee_master_records emr JOIN branches b ON b.id=emr.branch_id JOIN staff s ON s.id=emr.staff_id
WHERE NOT EXISTS (SELECT 1 FROM hr_employment_history h WHERE h.tenant_id=emr.tenant_id AND h.staff_id=emr.staff_id)
ON CONFLICT DO NOTHING;
