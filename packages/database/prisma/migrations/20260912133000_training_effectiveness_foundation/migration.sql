BEGIN;

CREATE TABLE IF NOT EXISTS training_effectiveness_runs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  assignment_id TEXT NOT NULL REFERENCES training_assignments(id) ON DELETE CASCADE,
  source_rule_id TEXT REFERENCES quality_training_rules(id) ON DELETE SET NULL,
  staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
  finding_category TEXT,
  pre_window_days INTEGER NOT NULL,
  post_window_days INTEGER NOT NULL,
  pre_window_start TIMESTAMP(3) NOT NULL,
  pre_window_end TIMESTAMP(3) NOT NULL,
  post_window_start TIMESTAMP(3) NOT NULL,
  post_window_end TIMESTAMP(3) NOT NULL,
  pre_finding_count INTEGER NOT NULL,
  post_finding_count INTEGER NOT NULL,
  delta_count INTEGER NOT NULL,
  improvement_pct NUMERIC(8,2),
  outcome TEXT NOT NULL,
  explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  calculated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_effectiveness_window_chk CHECK(pre_window_days BETWEEN 1 AND 3650 AND post_window_days BETWEEN 1 AND 3650),
  CONSTRAINT training_effectiveness_counts_chk CHECK(pre_finding_count>=0 AND post_finding_count>=0),
  CONSTRAINT training_effectiveness_outcome_chk CHECK(outcome IN ('IMPROVED','STABLE','WORSE','INSUFFICIENT_BASELINE')),
  UNIQUE(tenant_id,company_id,assignment_id,pre_window_days,post_window_days)
);

CREATE INDEX IF NOT EXISTS training_effectiveness_scope_idx
  ON training_effectiveness_runs(tenant_id,company_id,branch_id,calculated_at DESC);
CREATE INDEX IF NOT EXISTS training_effectiveness_staff_idx
  ON training_effectiveness_runs(tenant_id,company_id,staff_id,calculated_at DESC)
  WHERE staff_id IS NOT NULL;

COMMIT;
