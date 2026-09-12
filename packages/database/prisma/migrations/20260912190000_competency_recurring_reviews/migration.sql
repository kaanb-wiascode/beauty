BEGIN;

CREATE TABLE IF NOT EXISTS competency_review_schedules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  cadence_days INTEGER NOT NULL,
  due_offset_days INTEGER NOT NULL DEFAULT 14,
  profile_id TEXT REFERENCES competency_profiles(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  next_run_at TIMESTAMP(3) NOT NULL,
  last_run_at TIMESTAMP(3),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT competency_review_schedules_cadence_chk CHECK(cadence_days>=1),
  CONSTRAINT competency_review_schedules_due_offset_chk CHECK(due_offset_days>=0),
  UNIQUE(tenant_id,company_id,name)
);

CREATE TABLE IF NOT EXISTS competency_reviews (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  schedule_id TEXT REFERENCES competency_review_schedules(id) ON DELETE SET NULL,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES competency_profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  due_at TIMESTAMP(3) NOT NULL,
  opened_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP(3),
  completed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT competency_reviews_status_chk CHECK(status IN ('OPEN','COMPLETED','CANCELLED'))
);

CREATE TABLE IF NOT EXISTS competency_review_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  review_id TEXT NOT NULL REFERENCES competency_reviews(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT competency_review_events_type_chk CHECK(event_type IN ('OPENED','COMPLETED','CANCELLED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS competency_reviews_open_uq
  ON competency_reviews(tenant_id,company_id,staff_id,profile_id)
  WHERE status='OPEN';
CREATE INDEX IF NOT EXISTS competency_review_schedules_due_idx
  ON competency_review_schedules(tenant_id,company_id,next_run_at)
  WHERE is_active=true;
CREATE INDEX IF NOT EXISTS competency_reviews_due_idx
  ON competency_reviews(tenant_id,company_id,branch_id,due_at,status);

COMMIT;
