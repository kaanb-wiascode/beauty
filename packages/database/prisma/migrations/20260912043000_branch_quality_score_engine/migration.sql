BEGIN;

CREATE TABLE IF NOT EXISTS quality_score_policies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  missing_data_strategy TEXT NOT NULL DEFAULT 'EXCLUDE_AND_REWEIGHT',
  max_penalty_points NUMERIC(8,2) NOT NULL DEFAULT 25,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_score_policy_version_chk CHECK (version > 0) NOT VALID,
  CONSTRAINT quality_score_policy_missing_chk CHECK (missing_data_strategy IN ('EXCLUDE_AND_REWEIGHT','ZERO_FILL')) NOT VALID,
  CONSTRAINT quality_score_policy_penalty_chk CHECK (max_penalty_points >= 0 AND max_penalty_points <= 100) NOT VALID,
  CONSTRAINT quality_score_policy_period_chk CHECK (effective_to IS NULL OR effective_to >= effective_from) NOT VALID,
  UNIQUE (tenant_id, company_id, name, version)
);

CREATE TABLE IF NOT EXISTS quality_score_policy_dimensions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  policy_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_key TEXT,
  weight NUMERIC(8,4) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_score_dimension_source_chk CHECK (source_kind IN ('INSPECTION_CATEGORY','CUSTOMER_FEEDBACK','TRAINING_COMPLIANCE','CUSTOM_METRIC')) NOT VALID,
  CONSTRAINT quality_score_dimension_weight_chk CHECK (weight > 0) NOT VALID,
  UNIQUE (policy_id, code)
);

CREATE TABLE IF NOT EXISTS quality_score_penalty_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  policy_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  penalty_points NUMERIC(8,2) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_score_penalty_severity_chk CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')) NOT VALID,
  CONSTRAINT quality_score_penalty_points_chk CHECK (penalty_points >= 0 AND penalty_points <= 100) NOT VALID,
  UNIQUE (policy_id, severity)
);

CREATE TABLE IF NOT EXISTS branch_quality_score_runs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  base_score NUMERIC(8,2) NOT NULL,
  finding_penalty NUMERIC(8,2) NOT NULL DEFAULT 0,
  final_score NUMERIC(8,2) NOT NULL,
  missing_data_strategy TEXT NOT NULL,
  explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_by_user_id TEXT NOT NULL,
  calculated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT branch_quality_score_run_period_chk CHECK (period_end >= period_start) NOT VALID,
  CONSTRAINT branch_quality_score_run_scores_chk CHECK (base_score >= 0 AND base_score <= 100 AND final_score >= 0 AND final_score <= 100) NOT VALID
);

CREATE TABLE IF NOT EXISTS branch_quality_score_dimension_runs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  run_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  dimension_code TEXT NOT NULL,
  dimension_name TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_key TEXT,
  configured_weight NUMERIC(8,4) NOT NULL,
  effective_weight NUMERIC(12,6) NOT NULL DEFAULT 0,
  raw_score NUMERIC(8,2),
  weighted_score NUMERIC(8,2),
  source_count INTEGER NOT NULL DEFAULT 0,
  data_status TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT branch_quality_dimension_status_chk CHECK (data_status IN ('AVAILABLE','NO_DATA','UNSUPPORTED_SOURCE')) NOT VALID,
  UNIQUE (run_id, dimension_code)
);

ALTER TABLE branch_quality_scores
  ADD COLUMN IF NOT EXISTS latest_run_id TEXT,
  ADD COLUMN IF NOT EXISTS policy_id TEXT,
  ADD COLUMN IF NOT EXISTS policy_version INTEGER,
  ADD COLUMN IF NOT EXISTS explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS calculated_by_user_id TEXT;

CREATE INDEX IF NOT EXISTS quality_score_policy_active_idx
  ON quality_score_policies(tenant_id, company_id, effective_from DESC, version DESC)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS branch_quality_score_runs_scope_idx
  ON branch_quality_score_runs(tenant_id, company_id, branch_id, period_start DESC, calculated_at DESC);
CREATE INDEX IF NOT EXISTS branch_quality_score_dimension_runs_run_idx
  ON branch_quality_score_dimension_runs(run_id, dimension_code);

ALTER TABLE quality_score_policies ADD CONSTRAINT quality_score_policies_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_score_policies ADD CONSTRAINT quality_score_policies_company_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_score_policies ADD CONSTRAINT quality_score_policies_created_by_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_score_policy_dimensions ADD CONSTRAINT quality_score_policy_dimensions_policy_fkey FOREIGN KEY (policy_id) REFERENCES quality_score_policies(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_score_penalty_rules ADD CONSTRAINT quality_score_penalty_rules_policy_fkey FOREIGN KEY (policy_id) REFERENCES quality_score_policies(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE branch_quality_score_runs ADD CONSTRAINT branch_quality_score_runs_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE branch_quality_score_runs ADD CONSTRAINT branch_quality_score_runs_policy_fkey FOREIGN KEY (policy_id) REFERENCES quality_score_policies(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE branch_quality_score_runs ADD CONSTRAINT branch_quality_score_runs_calculated_by_fkey FOREIGN KEY (calculated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE branch_quality_score_dimension_runs ADD CONSTRAINT branch_quality_score_dimension_runs_run_fkey FOREIGN KEY (run_id) REFERENCES branch_quality_score_runs(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE branch_quality_scores ADD CONSTRAINT branch_quality_scores_latest_run_fkey FOREIGN KEY (latest_run_id) REFERENCES branch_quality_score_runs(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE branch_quality_scores ADD CONSTRAINT branch_quality_scores_policy_fkey FOREIGN KEY (policy_id) REFERENCES quality_score_policies(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE branch_quality_scores ADD CONSTRAINT branch_quality_scores_calculated_by_fkey FOREIGN KEY (calculated_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
