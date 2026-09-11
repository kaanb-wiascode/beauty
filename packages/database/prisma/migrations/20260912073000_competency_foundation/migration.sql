BEGIN;

CREATE TABLE IF NOT EXISTS competency_definitions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'GENERAL',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,company_id,code)
);

CREATE TABLE IF NOT EXISTS competency_profiles (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,company_id,code)
);

CREATE TABLE IF NOT EXISTS competency_profile_requirements (
  profile_id TEXT NOT NULL REFERENCES competency_profiles(id) ON DELETE CASCADE,
  competency_id TEXT NOT NULL REFERENCES competency_definitions(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  required_level NUMERIC(5,2) NOT NULL,
  weight NUMERIC(8,4) NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(profile_id,competency_id),
  CONSTRAINT competency_profile_required_level_chk CHECK(required_level BETWEEN 0 AND 100),
  CONSTRAINT competency_profile_weight_chk CHECK(weight > 0)
);

CREATE TABLE IF NOT EXISTS staff_competency_profiles (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES competency_profiles(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  assigned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT staff_competency_profile_effective_chk CHECK(effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE(tenant_id,company_id,staff_id,effective_from)
);

CREATE TABLE IF NOT EXISTS staff_competency_assessments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  competency_id TEXT NOT NULL REFERENCES competency_definitions(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  evidence JSONB,
  note TEXT,
  assessed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assessed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT staff_competency_assessment_source_chk CHECK(source_type IN ('MANUAL','EXAM','PRACTICAL','TRAINING','QUALITY')),
  CONSTRAINT staff_competency_assessment_score_chk CHECK(score BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS competency_definitions_scope_idx ON competency_definitions(tenant_id,company_id,is_active,category);
CREATE INDEX IF NOT EXISTS competency_profiles_scope_idx ON competency_profiles(tenant_id,company_id,is_active);
CREATE INDEX IF NOT EXISTS staff_competency_profiles_current_idx ON staff_competency_profiles(tenant_id,company_id,branch_id,staff_id,effective_from DESC);
CREATE INDEX IF NOT EXISTS staff_competency_assessments_staff_idx ON staff_competency_assessments(tenant_id,company_id,branch_id,staff_id,competency_id,assessed_at DESC);

COMMIT;
