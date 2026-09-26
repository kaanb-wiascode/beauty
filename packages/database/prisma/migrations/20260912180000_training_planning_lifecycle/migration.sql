BEGIN;

CREATE TABLE IF NOT EXISTS training_session_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_session_events_type_chk CHECK(event_type IN ('CREATED','STARTED','COMPLETED','CANCELLED','ENROLLMENT_ADDED','ENROLLMENT_STATUS_CHANGED'))
);

CREATE INDEX IF NOT EXISTS training_session_events_session_idx ON training_session_events(session_id,created_at);
CREATE INDEX IF NOT EXISTS training_session_events_scope_idx ON training_session_events(tenant_id,company_id,branch_id,created_at DESC);

ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

ALTER TABLE training_session_enrollments
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS status_updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE staff_development_plan_items
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS status_updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

COMMIT;
