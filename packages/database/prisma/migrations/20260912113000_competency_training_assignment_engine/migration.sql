BEGIN;

CREATE TABLE IF NOT EXISTS competency_training_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  competency_id TEXT NOT NULL REFERENCES competency_definitions(id) ON DELETE RESTRICT,
  course_id TEXT NOT NULL REFERENCES training_courses(id) ON DELETE RESTRICT,
  minimum_gap NUMERIC(5,2) NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,
  due_days INTEGER NOT NULL DEFAULT 30,
  cooldown_days INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT competency_training_rules_gap_chk CHECK(minimum_gap > 0 AND minimum_gap <= 100),
  CONSTRAINT competency_training_rules_priority_chk CHECK(priority BETWEEN 1 AND 10000),
  CONSTRAINT competency_training_rules_due_chk CHECK(due_days BETWEEN 0 AND 3650),
  CONSTRAINT competency_training_rules_cooldown_chk CHECK(cooldown_days BETWEEN 0 AND 3650),
  CONSTRAINT competency_training_rules_effective_chk CHECK(effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE(tenant_id,company_id,name,version)
);

ALTER TABLE training_assignments
  ADD COLUMN IF NOT EXISTS competency_rule_id TEXT;

ALTER TABLE training_assignments
  DROP CONSTRAINT IF EXISTS training_assignments_competency_rule_fk;
ALTER TABLE training_assignments
  ADD CONSTRAINT training_assignments_competency_rule_fk
  FOREIGN KEY(competency_rule_id) REFERENCES competency_training_rules(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS competency_training_rule_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL REFERENCES competency_training_rules(id) ON DELETE CASCADE,
  assignment_id TEXT REFERENCES training_assignments(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  profile_id TEXT REFERENCES competency_profiles(id) ON DELETE SET NULL,
  competency_id TEXT NOT NULL REFERENCES competency_definitions(id) ON DELETE RESTRICT,
  required_level NUMERIC(5,2) NOT NULL,
  current_level NUMERIC(5,2),
  gap NUMERIC(5,2) NOT NULL,
  assessment_id TEXT REFERENCES staff_competency_assessments(id) ON DELETE SET NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT competency_training_rule_events_type_chk CHECK(event_type IN ('ASSIGNMENT_CREATED','SKIPPED_COOLDOWN','SKIPPED_NO_PUBLISHED_VERSION','DUPLICATE_SOURCE_KEY')),
  CONSTRAINT competency_training_rule_events_required_chk CHECK(required_level BETWEEN 0 AND 100),
  CONSTRAINT competency_training_rule_events_current_chk CHECK(current_level IS NULL OR current_level BETWEEN 0 AND 100),
  CONSTRAINT competency_training_rule_events_gap_chk CHECK(gap > 0 AND gap <= 100)
);

CREATE INDEX IF NOT EXISTS competency_training_rules_active_idx
  ON competency_training_rules(tenant_id,company_id,competency_id,is_active,effective_from,effective_to,priority);
CREATE INDEX IF NOT EXISTS training_assignments_competency_rule_idx
  ON training_assignments(tenant_id,company_id,competency_rule_id,staff_id,created_at DESC)
  WHERE competency_rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS competency_training_rule_events_staff_idx
  ON competency_training_rule_events(tenant_id,company_id,branch_id,staff_id,created_at DESC);

COMMIT;
