BEGIN;

CREATE TABLE corporate_creators (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  legal_name TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  primary_platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  profile_url TEXT,
  follower_count BIGINT NOT NULL DEFAULT 0,
  engagement_rate NUMERIC(8,4),
  audience_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  rate_card JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  attributed_revenue NUMERIC(18,2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT corporate_creators_status_check CHECK (status IN ('ACTIVE','PAUSED','ENDED','BLACKLISTED')),
  CONSTRAINT corporate_creators_platform_check CHECK (primary_platform IN ('INSTAGRAM','TIKTOK','YOUTUBE','FACEBOOK','LINKEDIN','OTHER')),
  CONSTRAINT corporate_creators_metrics_check CHECK (follower_count >= 0 AND (engagement_rate IS NULL OR engagement_rate >= 0) AND attributed_revenue >= 0)
);

CREATE UNIQUE INDEX corporate_creators_handle_key
  ON corporate_creators(tenant_id, company_id, primary_platform, lower(handle));
CREATE INDEX corporate_creators_scope_status_idx
  ON corporate_creators(tenant_id, company_id, branch_id, status, updated_at DESC);

CREATE TABLE corporate_creator_collaborations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
  creator_id TEXT NOT NULL REFERENCES corporate_creators(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES corporate_communication_campaigns(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PLANNED',
  fee_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  coupon_code TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  deliverables JSONB NOT NULL DEFAULT '[]'::jsonb,
  performance JSONB NOT NULL DEFAULT '{}'::jsonb,
  attributed_revenue NUMERIC(18,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT corporate_creator_collaborations_status_check CHECK (status IN ('PLANNED','CONTRACTED','IN_PROGRESS','DELIVERED','COMPLETED','CANCELLED')),
  CONSTRAINT corporate_creator_collaborations_dates_check CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT corporate_creator_collaborations_amounts_check CHECK (fee_amount >= 0 AND attributed_revenue >= 0)
);

CREATE INDEX corporate_creator_collaborations_creator_idx
  ON corporate_creator_collaborations(creator_id, status, updated_at DESC);
CREATE INDEX corporate_creator_collaborations_campaign_idx
  ON corporate_creator_collaborations(campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_corporate_creator_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM companies c WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id) THEN
    RAISE EXCEPTION 'corporate creator company scope mismatch';
  END IF;
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.id=NEW.branch_id AND b."companyId"=NEW.company_id) THEN
    RAISE EXCEPTION 'corporate creator branch scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_corporate_creator_collaboration_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM corporate_creators c
    WHERE c.id=NEW.creator_id AND c.tenant_id=NEW.tenant_id AND c.company_id=NEW.company_id
      AND c.branch_id IS NOT DISTINCT FROM NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'creator collaboration scope mismatch';
  END IF;
  IF NEW.campaign_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM corporate_communication_campaigns c
    WHERE c.id=NEW.campaign_id AND c.tenant_id=NEW.tenant_id AND c.company_id=NEW.company_id
      AND (NEW.branch_id IS NULL OR c.branch_id IS NULL OR c.branch_id=NEW.branch_id)
  ) THEN
    RAISE EXCEPTION 'creator collaboration campaign scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER corporate_creators_scope_guard
BEFORE INSERT OR UPDATE ON corporate_creators
FOR EACH ROW EXECUTE FUNCTION validate_corporate_creator_scope();

CREATE TRIGGER corporate_creator_collaborations_scope_guard
BEFORE INSERT OR UPDATE ON corporate_creator_collaborations
FOR EACH ROW EXECUTE FUNCTION validate_corporate_creator_collaboration_scope();

COMMIT;
