BEGIN;

CREATE TABLE IF NOT EXISTS position_competency_profile_mappings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  position_key TEXT NOT NULL,
  position_label TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES competency_profiles(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT position_competency_mapping_dates_chk CHECK(effective_to IS NULL OR effective_to>=effective_from),
  UNIQUE(tenant_id,company_id,position_key,effective_from)
);

CREATE INDEX IF NOT EXISTS position_competency_profile_mappings_active_idx
  ON position_competency_profile_mappings(tenant_id,company_id,position_key,effective_from DESC)
  WHERE is_active=true;

CREATE TABLE IF NOT EXISTS position_competency_mapping_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  mapping_id TEXT NOT NULL REFERENCES position_competency_profile_mappings(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT position_competency_mapping_events_type_chk CHECK(event_type IN ('CREATED','STAFF_PROFILE_ASSIGNED','SKIPPED_EXISTING_PROFILE'))
);

COMMIT;
