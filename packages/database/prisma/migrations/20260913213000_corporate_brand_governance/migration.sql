BEGIN;

CREATE TABLE corporate_brand_governance_profiles (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  name TEXT NOT NULL,
  tone_of_voice TEXT,
  brand_personality JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_phrases JSONB NOT NULL DEFAULT '[]'::jsonb,
  forbidden_phrases JSONB NOT NULL DEFAULT '[]'::jsonb,
  hashtag_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  color_tokens JSONB NOT NULL DEFAULT '[]'::jsonb,
  font_tokens JSONB NOT NULL DEFAULT '[]'::jsonb,
  logo_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT corporate_brand_governance_revision_positive CHECK (revision > 0),
  CONSTRAINT corporate_brand_governance_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT corporate_brand_governance_branch_fk FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT corporate_brand_governance_creator_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT corporate_brand_governance_updater_fk FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX corporate_brand_governance_company_default_uq
  ON corporate_brand_governance_profiles(company_id)
  WHERE branch_id IS NULL AND active=TRUE;

CREATE UNIQUE INDEX corporate_brand_governance_branch_uq
  ON corporate_brand_governance_profiles(company_id, branch_id)
  WHERE branch_id IS NOT NULL AND active=TRUE;

CREATE INDEX corporate_brand_governance_scope_idx
  ON corporate_brand_governance_profiles(tenant_id, company_id, branch_id, active);

CREATE TABLE corporate_brand_governance_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  profile_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT corporate_brand_governance_event_revision_positive CHECK (revision > 0),
  CONSTRAINT corporate_brand_governance_event_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT corporate_brand_governance_event_branch_fk FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT corporate_brand_governance_event_profile_fk FOREIGN KEY (profile_id) REFERENCES corporate_brand_governance_profiles(id) ON DELETE CASCADE,
  CONSTRAINT corporate_brand_governance_event_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX corporate_brand_governance_event_profile_idx
  ON corporate_brand_governance_events(company_id, profile_id, revision DESC, created_at DESC);

CREATE OR REPLACE FUNCTION validate_corporate_brand_governance_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c
    WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'corporate brand governance company scope mismatch';
  END IF;

  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id=NEW.branch_id AND b."companyId"=NEW.company_id
  ) THEN
    RAISE EXCEPTION 'corporate brand governance branch scope mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_corporate_brand_governance_event_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM corporate_brand_governance_profiles p
    WHERE p.id=NEW.profile_id
      AND p.tenant_id=NEW.tenant_id
      AND p.company_id=NEW.company_id
      AND p.branch_id IS NOT DISTINCT FROM NEW.branch_id
      AND p.revision=NEW.revision
  ) THEN
    RAISE EXCEPTION 'corporate brand governance event scope mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER corporate_brand_governance_scope_guard
BEFORE INSERT OR UPDATE ON corporate_brand_governance_profiles
FOR EACH ROW EXECUTE FUNCTION validate_corporate_brand_governance_scope();

CREATE TRIGGER corporate_brand_governance_event_scope_guard
BEFORE INSERT ON corporate_brand_governance_events
FOR EACH ROW EXECUTE FUNCTION validate_corporate_brand_governance_event_scope();

COMMIT;
