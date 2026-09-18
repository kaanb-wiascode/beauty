BEGIN;

ALTER TABLE competency_profiles
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS effective_to DATE;

ALTER TABLE competency_profiles
  DROP CONSTRAINT IF EXISTS competency_profiles_tenant_id_company_id_code_key;

ALTER TABLE competency_profiles
  DROP CONSTRAINT IF EXISTS competency_profiles_effective_chk;
ALTER TABLE competency_profiles
  ADD CONSTRAINT competency_profiles_effective_chk
  CHECK(effective_to IS NULL OR effective_to >= effective_from);

CREATE UNIQUE INDEX IF NOT EXISTS competency_profiles_version_uq
  ON competency_profiles(tenant_id,company_id,code,version);
CREATE INDEX IF NOT EXISTS competency_profiles_current_idx
  ON competency_profiles(tenant_id,company_id,code,is_active,effective_from DESC,version DESC);

COMMIT;
