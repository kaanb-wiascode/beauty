BEGIN;

CREATE TABLE IF NOT EXISTS training_effectiveness_followups (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  effectiveness_run_id TEXT NOT NULL REFERENCES training_effectiveness_runs(id) ON DELETE CASCADE,
  assignment_id TEXT NOT NULL REFERENCES training_assignments(id) ON DELETE CASCADE,
  staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  status TEXT NOT NULL DEFAULT 'OPEN',
  rationale JSONB NOT NULL DEFAULT '{}'::jsonb,
  due_at TIMESTAMP(3),
  acknowledged_at TIMESTAMP(3),
  acknowledged_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP(3),
  resolved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  cancelled_at TIMESTAMP(3),
  cancelled_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  cancellation_reason TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_effectiveness_followups_action_chk CHECK(action_type IN ('INVESTIGATE_ROOT_CAUSE','REASSESS_COMPETENCY','REVIEW_BASELINE_DATA')),
  CONSTRAINT training_effectiveness_followups_priority_chk CHECK(priority IN ('NORMAL','HIGH')),
  CONSTRAINT training_effectiveness_followups_status_chk CHECK(status IN ('OPEN','ACKNOWLEDGED','RESOLVED','CANCELLED')),
  UNIQUE(tenant_id,company_id,effectiveness_run_id)
);

CREATE INDEX IF NOT EXISTS training_effectiveness_followups_scope_idx
  ON training_effectiveness_followups(tenant_id,company_id,branch_id,status,due_at);
CREATE INDEX IF NOT EXISTS training_effectiveness_followups_staff_idx
  ON training_effectiveness_followups(tenant_id,company_id,staff_id,status,due_at)
  WHERE staff_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS training_effectiveness_followup_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  followup_id TEXT NOT NULL REFERENCES training_effectiveness_followups(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_effectiveness_followup_events_type_chk CHECK(event_type IN ('OPENED','ACKNOWLEDGED','RESOLVED','CANCELLED'))
);

CREATE INDEX IF NOT EXISTS training_effectiveness_followup_events_followup_idx
  ON training_effectiveness_followup_events(followup_id,created_at,id);

COMMIT;
