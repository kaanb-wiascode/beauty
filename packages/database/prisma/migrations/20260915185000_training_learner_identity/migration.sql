BEGIN;

CREATE TABLE IF NOT EXISTS training_learner_identities (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,company_id,user_id),
  UNIQUE(tenant_id,company_id,staff_id)
);

CREATE INDEX IF NOT EXISTS training_learner_identities_staff_idx
  ON training_learner_identities(tenant_id,company_id,staff_id);

CREATE OR REPLACE FUNCTION enforce_training_learner_identity_scope()
RETURNS trigger AS $$
DECLARE
  staff_tenant TEXT;
  staff_company TEXT;
  membership_ok BOOLEAN;
BEGIN
  SELECT s."tenantId", b."companyId"
    INTO staff_tenant, staff_company
  FROM staff s
  JOIN branches b ON b.id=s."branchId"
  WHERE s.id=NEW.staff_id;

  IF staff_tenant IS NULL OR staff_tenant <> NEW.tenant_id OR staff_company <> NEW.company_id THEN
    RAISE EXCEPTION 'Learner staff is outside tenant/company scope';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM memberships m
    WHERE m."userId"=NEW.user_id
      AND m."tenantId"=NEW.tenant_id
      AND m.status='ACTIVE'
      AND (m."companyId" IS NULL OR m."companyId"=NEW.company_id)
  ) INTO membership_ok;

  IF NOT membership_ok THEN
    RAISE EXCEPTION 'Learner user has no active tenant/company membership';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS training_learner_identity_scope_trg ON training_learner_identities;
CREATE TRIGGER training_learner_identity_scope_trg
BEFORE INSERT OR UPDATE ON training_learner_identities
FOR EACH ROW EXECUTE FUNCTION enforce_training_learner_identity_scope();

COMMIT;
