BEGIN;

CREATE TABLE IF NOT EXISTS training_role_academies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  position_id TEXT NOT NULL REFERENCES hr_positions(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
  auto_assign BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,company_id,position_id,program_id)
);

CREATE INDEX IF NOT EXISTS training_role_academies_scope_idx
  ON training_role_academies(tenant_id,company_id,position_id,is_active);

CREATE OR REPLACE FUNCTION training_role_academy_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  position_tenant TEXT;
  position_company TEXT;
  program_tenant TEXT;
  program_company TEXT;
BEGIN
  SELECT tenant_id,company_id INTO position_tenant,position_company FROM hr_positions WHERE id=NEW.position_id;
  SELECT tenant_id,company_id INTO program_tenant,program_company FROM training_programs WHERE id=NEW.program_id;
  IF position_tenant IS NULL OR program_tenant IS NULL THEN RAISE EXCEPTION 'Role academy position or program not found'; END IF;
  IF position_tenant<>NEW.tenant_id OR program_tenant<>NEW.tenant_id OR position_company<>NEW.company_id OR program_company<>NEW.company_id THEN
    RAISE EXCEPTION 'Role academy scope mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_training_role_academy_scope ON training_role_academies;
CREATE TRIGGER trg_training_role_academy_scope
BEFORE INSERT OR UPDATE ON training_role_academies
FOR EACH ROW EXECUTE FUNCTION training_role_academy_scope_guard();

COMMIT;
