BEGIN;

CREATE TABLE IF NOT EXISTS training_courses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  delivery_type TEXT NOT NULL DEFAULT 'BLENDED',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_courses_delivery_chk CHECK (delivery_type IN ('THEORY','PRACTICAL','BLENDED')),
  CONSTRAINT training_courses_category_chk CHECK (category IN ('SERVICE','SALES','CUSTOMER_EXPERIENCE','CORPORATE','MANAGEMENT','QUALITY','OTHER')),
  UNIQUE(tenant_id,company_id,code)
);

CREATE TABLE IF NOT EXISTS training_assignments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  course_id TEXT NOT NULL REFERENCES training_courses(id) ON DELETE RESTRICT,
  staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  source_rule_id TEXT,
  source_key TEXT,
  rationale JSONB,
  status TEXT NOT NULL DEFAULT 'ASSIGNED',
  assigned_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_at TIMESTAMP(3),
  started_at TIMESTAMP(3),
  completed_at TIMESTAMP(3),
  assigned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_assignments_source_chk CHECK (source_type IN ('MANUAL','QUALITY_RULE','COMPETENCY_GAP')),
  CONSTRAINT training_assignments_status_chk CHECK (status IN ('ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED','EXPIRED')),
  UNIQUE(tenant_id,company_id,source_key)
);

CREATE TABLE IF NOT EXISTS quality_training_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  course_id TEXT NOT NULL REFERENCES training_courses(id) ON DELETE RESTRICT,
  finding_category TEXT,
  minimum_severity TEXT,
  occurrence_threshold INTEGER NOT NULL DEFAULT 2,
  lookback_days INTEGER NOT NULL DEFAULT 90,
  cooldown_days INTEGER NOT NULL DEFAULT 30,
  target_scope TEXT NOT NULL DEFAULT 'BRANCH',
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_training_rules_severity_chk CHECK (minimum_severity IS NULL OR minimum_severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  CONSTRAINT quality_training_rules_target_chk CHECK (target_scope IN ('BRANCH','STAFF')),
  CONSTRAINT quality_training_rules_threshold_chk CHECK (occurrence_threshold >= 1),
  CONSTRAINT quality_training_rules_lookback_chk CHECK (lookback_days BETWEEN 1 AND 3650),
  CONSTRAINT quality_training_rules_cooldown_chk CHECK (cooldown_days BETWEEN 0 AND 3650),
  CONSTRAINT quality_training_rules_effective_chk CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE(tenant_id,company_id,name,version)
);

ALTER TABLE training_assignments
  DROP CONSTRAINT IF EXISTS training_assignments_source_rule_fk;
ALTER TABLE training_assignments
  ADD CONSTRAINT training_assignments_source_rule_fk FOREIGN KEY(source_rule_id) REFERENCES quality_training_rules(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS quality_training_rule_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  rule_id TEXT NOT NULL REFERENCES quality_training_rules(id) ON DELETE CASCADE,
  assignment_id TEXT REFERENCES training_assignments(id) ON DELETE SET NULL,
  staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_training_rule_events_type_chk CHECK (event_type IN ('MATCHED','ASSIGNMENT_CREATED','SKIPPED_COOLDOWN','NO_ELIGIBLE_STAFF'))
);

CREATE INDEX IF NOT EXISTS training_courses_scope_idx ON training_courses(tenant_id,company_id,is_active);
CREATE INDEX IF NOT EXISTS training_assignments_scope_idx ON training_assignments(tenant_id,company_id,branch_id,status,assigned_at DESC);
CREATE INDEX IF NOT EXISTS training_assignments_staff_idx ON training_assignments(tenant_id,company_id,staff_id,assigned_at DESC) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS quality_training_rules_active_idx ON quality_training_rules(tenant_id,company_id,is_active,effective_from,effective_to);
CREATE INDEX IF NOT EXISTS quality_training_rule_events_scope_idx ON quality_training_rule_events(tenant_id,company_id,branch_id,created_at DESC);

COMMIT;
