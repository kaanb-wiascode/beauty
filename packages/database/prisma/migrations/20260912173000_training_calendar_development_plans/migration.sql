BEGIN;

CREATE TABLE IF NOT EXISTS training_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  course_id TEXT NOT NULL REFERENCES training_courses(id) ON DELETE RESTRICT,
  course_version_id TEXT REFERENCES training_course_versions(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  starts_at TIMESTAMP(3) NOT NULL,
  ends_at TIMESTAMP(3) NOT NULL,
  capacity INTEGER,
  location TEXT,
  instructor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_sessions_time_chk CHECK(ends_at>starts_at),
  CONSTRAINT training_sessions_capacity_chk CHECK(capacity IS NULL OR capacity>=1),
  CONSTRAINT training_sessions_status_chk CHECK(status IN ('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED'))
);

CREATE TABLE IF NOT EXISTS training_session_enrollments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  assignment_id TEXT REFERENCES training_assignments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ENROLLED',
  enrolled_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  enrolled_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attended_at TIMESTAMP(3),
  CONSTRAINT training_session_enrollment_status_chk CHECK(status IN ('ENROLLED','ATTENDED','NO_SHOW','CANCELLED')),
  UNIQUE(tenant_id,company_id,session_id,staff_id)
);

CREATE TABLE IF NOT EXISTS staff_development_plans (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  target_date DATE,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT staff_development_plans_status_chk CHECK(status IN ('DRAFT','ACTIVE','COMPLETED','CANCELLED')),
  CONSTRAINT staff_development_plans_date_chk CHECK(target_date IS NULL OR target_date>=start_date)
);

CREATE TABLE IF NOT EXISTS staff_development_plan_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES staff_development_plans(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  competency_id TEXT REFERENCES competency_definitions(id) ON DELETE RESTRICT,
  course_id TEXT REFERENCES training_courses(id) ON DELETE RESTRICT,
  program_id TEXT REFERENCES training_programs(id) ON DELETE RESTRICT,
  target_level NUMERIC(5,2),
  note TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'PLANNED',
  completed_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT staff_development_plan_items_sequence_chk CHECK(sequence>=1),
  CONSTRAINT staff_development_plan_items_type_chk CHECK(item_type IN ('COMPETENCY','COURSE','PROGRAM','ACTION')),
  CONSTRAINT staff_development_plan_items_status_chk CHECK(status IN ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  CONSTRAINT staff_development_plan_items_level_chk CHECK(target_level IS NULL OR target_level BETWEEN 0 AND 100),
  CONSTRAINT staff_development_plan_items_target_chk CHECK(
    (item_type='COMPETENCY' AND competency_id IS NOT NULL AND course_id IS NULL AND program_id IS NULL)
    OR (item_type='COURSE' AND course_id IS NOT NULL AND competency_id IS NULL AND program_id IS NULL)
    OR (item_type='PROGRAM' AND program_id IS NOT NULL AND competency_id IS NULL AND course_id IS NULL)
    OR (item_type='ACTION' AND competency_id IS NULL AND course_id IS NULL AND program_id IS NULL)
  ),
  UNIQUE(plan_id,sequence)
);

CREATE TABLE IF NOT EXISTS staff_development_plan_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  plan_id TEXT NOT NULL REFERENCES staff_development_plans(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT staff_development_plan_events_type_chk CHECK(event_type IN ('CREATED','ITEM_ADDED','ITEM_STATUS_CHANGED','PLAN_COMPLETED','CANCELLED'))
);

CREATE INDEX IF NOT EXISTS training_sessions_calendar_idx ON training_sessions(tenant_id,company_id,branch_id,starts_at,status);
CREATE INDEX IF NOT EXISTS training_session_enrollments_staff_idx ON training_session_enrollments(tenant_id,company_id,staff_id,status);
CREATE INDEX IF NOT EXISTS staff_development_plans_staff_idx ON staff_development_plans(tenant_id,company_id,branch_id,staff_id,status);

COMMIT;
