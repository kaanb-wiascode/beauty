BEGIN;

CREATE TABLE IF NOT EXISTS quality_score_schedules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'MONTHLY',
  period_mode TEXT NOT NULL DEFAULT 'PREVIOUS_MONTH',
  policy_id TEXT REFERENCES quality_score_policies(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  next_run_at TIMESTAMP(3) NOT NULL,
  last_run_at TIMESTAMP(3),
  last_period_start DATE,
  last_period_end DATE,
  lease_owner TEXT,
  lease_expires_at TIMESTAMP(3),
  last_error TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_score_schedules_cadence_chk CHECK(cadence IN ('DAILY','WEEKLY','MONTHLY')),
  CONSTRAINT quality_score_schedules_period_mode_chk CHECK(period_mode IN ('PREVIOUS_DAY','PREVIOUS_WEEK','PREVIOUS_MONTH')),
  UNIQUE(tenant_id,company_id,branch_id,name)
);

CREATE TABLE IF NOT EXISTS quality_score_schedule_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  schedule_id TEXT NOT NULL REFERENCES quality_score_schedules(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  score_run_id TEXT REFERENCES branch_quality_score_runs(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_score_schedule_events_type_chk CHECK(event_type IN ('CALCULATED','SKIPPED_EXISTING','FAILED'))
);

CREATE INDEX IF NOT EXISTS quality_score_schedules_due_idx
  ON quality_score_schedules(tenant_id,company_id,branch_id,next_run_at)
  WHERE is_active=true;

CREATE INDEX IF NOT EXISTS quality_score_schedule_events_lookup_idx
  ON quality_score_schedule_events(tenant_id,company_id,branch_id,schedule_id,created_at DESC);

COMMIT;
