BEGIN;

CREATE TABLE IF NOT EXISTS training_programs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,company_id,code)
);

CREATE TABLE IF NOT EXISTS training_program_versions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  title TEXT NOT NULL,
  description TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_program_versions_status_chk CHECK(status IN ('DRAFT','PUBLISHED','RETIRED')),
  UNIQUE(tenant_id,company_id,program_id,version)
);
CREATE UNIQUE INDEX IF NOT EXISTS training_program_versions_one_published_uq
  ON training_program_versions(tenant_id,company_id,program_id) WHERE status='PUBLISHED';

CREATE TABLE IF NOT EXISTS training_program_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  program_version_id TEXT NOT NULL REFERENCES training_program_versions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  course_id TEXT NOT NULL REFERENCES training_courses(id) ON DELETE RESTRICT,
  is_required BOOLEAN NOT NULL DEFAULT true,
  due_offset_days INTEGER,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_program_items_sequence_chk CHECK(sequence>=1),
  CONSTRAINT training_program_items_due_chk CHECK(due_offset_days IS NULL OR due_offset_days>=0),
  UNIQUE(program_version_id,sequence),
  UNIQUE(program_version_id,course_id)
);

CREATE TABLE IF NOT EXISTS training_program_assignments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  program_id TEXT NOT NULL REFERENCES training_programs(id) ON DELETE RESTRICT,
  program_version_id TEXT NOT NULL REFERENCES training_program_versions(id) ON DELETE RESTRICT,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  source_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ASSIGNED',
  assigned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP(3),
  cancelled_at TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_program_assignments_status_chk CHECK(status IN ('ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  UNIQUE(tenant_id,company_id,source_key)
);

ALTER TABLE training_assignments
  ADD COLUMN IF NOT EXISTS program_assignment_id TEXT REFERENCES training_program_assignments(id) ON DELETE SET NULL;
ALTER TABLE training_assignments DROP CONSTRAINT IF EXISTS training_assignments_source_chk;
ALTER TABLE training_assignments ADD CONSTRAINT training_assignments_source_chk
  CHECK(source_type IN ('MANUAL','QUALITY_RULE','COMPETENCY_GAP','LEARNING_PROGRAM'));
CREATE INDEX IF NOT EXISTS training_assignments_program_idx
  ON training_assignments(tenant_id,company_id,program_assignment_id) WHERE program_assignment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS training_program_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
  program_id TEXT NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
  program_version_id TEXT REFERENCES training_program_versions(id) ON DELETE SET NULL,
  program_assignment_id TEXT REFERENCES training_program_assignments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_program_events_type_chk CHECK(event_type IN ('VERSION_CREATED','PUBLISHED','ASSIGNED','COURSE_ASSIGNMENTS_CREATED','COMPLETED','CANCELLED'))
);

CREATE INDEX IF NOT EXISTS training_programs_scope_idx ON training_programs(tenant_id,company_id,is_active,title);
CREATE INDEX IF NOT EXISTS training_program_assignments_staff_idx ON training_program_assignments(tenant_id,company_id,staff_id,status,assigned_at DESC);

CREATE OR REPLACE FUNCTION prevent_published_training_program_content_mutation()
RETURNS trigger AS $$
DECLARE s TEXT;
BEGIN
  SELECT status INTO s FROM training_program_versions WHERE id=COALESCE(NEW.program_version_id,OLD.program_version_id);
  IF s <> 'DRAFT' THEN RAISE EXCEPTION 'Published or retired training program content is immutable'; END IF;
  RETURN COALESCE(NEW,OLD);
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS training_program_items_immutable_trg ON training_program_items;
CREATE TRIGGER training_program_items_immutable_trg BEFORE UPDATE OR DELETE ON training_program_items
FOR EACH ROW EXECUTE FUNCTION prevent_published_training_program_content_mutation();

COMMIT;
