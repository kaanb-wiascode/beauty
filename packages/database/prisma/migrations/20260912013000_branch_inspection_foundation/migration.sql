BEGIN;

CREATE TABLE IF NOT EXISTS quality_inspection_templates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, company_id, name, version)
);

CREATE TABLE IF NOT EXISTS quality_inspection_template_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  template_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  response_type TEXT NOT NULL DEFAULT 'PASS_FAIL',
  is_required BOOLEAN NOT NULL DEFAULT true,
  weight NUMERIC(8,2) NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_inspection_item_response_chk CHECK (response_type IN ('PASS_FAIL','SCORE','TEXT')) NOT VALID,
  CONSTRAINT quality_inspection_item_weight_chk CHECK (weight >= 0) NOT VALID,
  UNIQUE (template_id, sort_order),
  UNIQUE (template_id, code)
);

CREATE TABLE IF NOT EXISTS quality_inspection_schedules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  cadence TEXT NOT NULL,
  next_due_at TIMESTAMP(3) NOT NULL,
  assignee_user_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, company_id, branch_id, template_id, cadence)
);

CREATE TABLE IF NOT EXISTS quality_inspections (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  schedule_id TEXT,
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNED',
  planned_for TIMESTAMP(3) NOT NULL,
  started_at TIMESTAMP(3),
  completed_at TIMESTAMP(3),
  inspector_user_id TEXT,
  score NUMERIC(8,2),
  notes TEXT,
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_inspections_status_chk CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED')) NOT VALID,
  CONSTRAINT quality_inspections_score_chk CHECK (score IS NULL OR (score >= 0 AND score <= 100)) NOT VALID,
  UNIQUE (tenant_id, company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS quality_inspection_results (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  inspection_id TEXT NOT NULL,
  template_item_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  numeric_score NUMERIC(8,2),
  note TEXT,
  recorded_by_user_id TEXT NOT NULL,
  recorded_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_inspection_result_outcome_chk CHECK (outcome IN ('PASS','FAIL','NA','SCORE','TEXT')) NOT VALID,
  CONSTRAINT quality_inspection_result_score_chk CHECK (numeric_score IS NULL OR (numeric_score >= 0 AND numeric_score <= 100)) NOT VALID,
  UNIQUE (inspection_id, template_item_id)
);

CREATE TABLE IF NOT EXISTS quality_findings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  inspection_id TEXT NOT NULL,
  inspection_result_id TEXT,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  quality_case_id TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_findings_severity_chk CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')) NOT VALID,
  CONSTRAINT quality_findings_status_chk CHECK (status IN ('OPEN','CASE_CREATED','CLOSED')) NOT VALID
);

CREATE TABLE IF NOT EXISTS branch_quality_scores (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  inspection_score NUMERIC(8,2),
  finding_penalty NUMERIC(8,2) NOT NULL DEFAULT 0,
  final_score NUMERIC(8,2) NOT NULL,
  calculated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT branch_quality_period_chk CHECK (period_end >= period_start) NOT VALID,
  CONSTRAINT branch_quality_final_score_chk CHECK (final_score >= 0 AND final_score <= 100) NOT VALID,
  UNIQUE (tenant_id, company_id, branch_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS quality_inspections_scope_idx ON quality_inspections(tenant_id, company_id, branch_id, planned_for DESC);
CREATE INDEX IF NOT EXISTS quality_findings_scope_idx ON quality_findings(tenant_id, company_id, branch_id, status, severity);
CREATE INDEX IF NOT EXISTS branch_quality_scores_scope_idx ON branch_quality_scores(tenant_id, company_id, branch_id, period_start DESC);

ALTER TABLE quality_inspection_templates ADD CONSTRAINT quality_inspection_templates_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_inspection_templates ADD CONSTRAINT quality_inspection_templates_company_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_inspection_templates ADD CONSTRAINT quality_inspection_templates_created_by_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_inspection_template_items ADD CONSTRAINT quality_inspection_template_items_template_fkey FOREIGN KEY (template_id) REFERENCES quality_inspection_templates(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_inspection_schedules ADD CONSTRAINT quality_inspection_schedules_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_inspection_schedules ADD CONSTRAINT quality_inspection_schedules_template_fkey FOREIGN KEY (template_id) REFERENCES quality_inspection_templates(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_inspection_schedules ADD CONSTRAINT quality_inspection_schedules_assignee_fkey FOREIGN KEY (assignee_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_inspection_schedules ADD CONSTRAINT quality_inspection_schedules_created_by_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_inspections ADD CONSTRAINT quality_inspections_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_inspections ADD CONSTRAINT quality_inspections_template_fkey FOREIGN KEY (template_id) REFERENCES quality_inspection_templates(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_inspections ADD CONSTRAINT quality_inspections_schedule_fkey FOREIGN KEY (schedule_id) REFERENCES quality_inspection_schedules(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_inspections ADD CONSTRAINT quality_inspections_inspector_fkey FOREIGN KEY (inspector_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_inspections ADD CONSTRAINT quality_inspections_created_by_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_inspections ADD CONSTRAINT quality_inspections_updated_by_fkey FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_inspection_results ADD CONSTRAINT quality_inspection_results_inspection_fkey FOREIGN KEY (inspection_id) REFERENCES quality_inspections(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_inspection_results ADD CONSTRAINT quality_inspection_results_item_fkey FOREIGN KEY (template_item_id) REFERENCES quality_inspection_template_items(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_inspection_results ADD CONSTRAINT quality_inspection_results_recorded_by_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_findings ADD CONSTRAINT quality_findings_inspection_fkey FOREIGN KEY (inspection_id) REFERENCES quality_inspections(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_findings ADD CONSTRAINT quality_findings_result_fkey FOREIGN KEY (inspection_result_id) REFERENCES quality_inspection_results(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_findings ADD CONSTRAINT quality_findings_case_fkey FOREIGN KEY (quality_case_id) REFERENCES quality_cases(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_findings ADD CONSTRAINT quality_findings_created_by_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE branch_quality_scores ADD CONSTRAINT branch_quality_scores_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
