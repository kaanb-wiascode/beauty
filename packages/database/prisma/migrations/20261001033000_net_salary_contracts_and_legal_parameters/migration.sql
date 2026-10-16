CREATE TABLE IF NOT EXISTS hr_salary_contracts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  salary_basis TEXT NOT NULL DEFAULT 'MONTHLY_NET',
  net_amount DECIMAL(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY',
  effective_from DATE NOT NULL,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  note TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT hr_salary_contracts_basis_check CHECK (salary_basis IN ('MONTHLY_NET','DAILY_NET','HOURLY_NET')),
  CONSTRAINT hr_salary_contracts_amount_check CHECK (net_amount >= 0),
  CONSTRAINT hr_salary_contracts_currency_check CHECK (char_length(currency)=3),
  CONSTRAINT hr_salary_contracts_range_check CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT hr_salary_contracts_status_check CHECK (status IN ('ACTIVE','ENDED','CANCELLED'))
);

CREATE INDEX IF NOT EXISTS hr_salary_contracts_staff_effective_idx
  ON hr_salary_contracts(tenant_id,company_id,staff_id,effective_from DESC);

CREATE UNIQUE INDEX IF NOT EXISTS hr_salary_contracts_open_active_key
  ON hr_salary_contracts(tenant_id,company_id,staff_id)
  WHERE status='ACTIVE' AND effective_to IS NULL;

CREATE TABLE IF NOT EXISTS payroll_legal_parameter_versions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  jurisdiction TEXT NOT NULL DEFAULT 'TR',
  version_label TEXT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_reference TEXT,
  note TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  published_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_legal_parameter_versions_range_check CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT payroll_legal_parameter_versions_status_check CHECK (status IN ('DRAFT','PUBLISHED','RETIRED')),
  CONSTRAINT payroll_legal_parameter_versions_parameters_object_check CHECK (jsonb_typeof(parameters)='object')
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_legal_parameter_versions_label_key
  ON payroll_legal_parameter_versions(tenant_id,company_id,jurisdiction,version_label);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_legal_parameter_versions_published_start_key
  ON payroll_legal_parameter_versions(tenant_id,company_id,jurisdiction,effective_from)
  WHERE status='PUBLISHED';

CREATE INDEX IF NOT EXISTS payroll_legal_parameter_versions_effective_idx
  ON payroll_legal_parameter_versions(tenant_id,company_id,jurisdiction,effective_from DESC,effective_to);
