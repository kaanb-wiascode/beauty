BEGIN;

CREATE TABLE IF NOT EXISTS payroll_policy_settings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  apply_overtime BOOLEAN NOT NULL DEFAULT false,
  apply_unpaid_leave_deduction BOOLEAN NOT NULL DEFAULT false,
  standard_monthly_minutes INTEGER,
  overtime_multiplier DECIMAL(8,4),
  monthly_day_divisor DECIMAL(8,2),
  updated_by_user_id TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_policy_standard_minutes_chk CHECK (standard_monthly_minutes IS NULL OR standard_monthly_minutes > 0) NOT VALID,
  CONSTRAINT payroll_policy_overtime_multiplier_chk CHECK (overtime_multiplier IS NULL OR overtime_multiplier >= 0) NOT VALID,
  CONSTRAINT payroll_policy_day_divisor_chk CHECK (monthly_day_divisor IS NULL OR monthly_day_divisor > 0) NOT VALID
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_policy_settings_tenant_company_uq
  ON payroll_policy_settings(tenant_id, company_id);

ALTER TABLE payroll_policy_settings
  ADD CONSTRAINT payroll_policy_settings_tenant_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE payroll_policy_settings
  ADD CONSTRAINT payroll_policy_settings_company_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
