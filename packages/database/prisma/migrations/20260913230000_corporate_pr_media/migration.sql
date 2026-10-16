BEGIN;

CREATE TABLE corporate_pr_activities (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
  campaign_id TEXT REFERENCES corporate_communication_campaigns(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PLANNED',
  title TEXT NOT NULL,
  outlet_name TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  location TEXT,
  objective TEXT,
  key_message TEXT,
  cost_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  estimated_reach BIGINT NOT NULL DEFAULT 0,
  actual_reach BIGINT NOT NULL DEFAULT 0,
  estimated_media_value NUMERIC(18,2) NOT NULL DEFAULT 0,
  attributed_revenue NUMERIC(18,2) NOT NULL DEFAULT 0,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT corporate_pr_activities_type_check CHECK (
    activity_type IN ('PRESS_RELEASE','MEDIA_RELATION','INTERVIEW','EVENT','SPONSORSHIP','CRISIS_COMMUNICATION','AWARD','OTHER')
  ),
  CONSTRAINT corporate_pr_activities_status_check CHECK (
    status IN ('PLANNED','CONTACTED','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED')
  ),
  CONSTRAINT corporate_pr_activities_date_check CHECK (
    ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at
  ),
  CONSTRAINT corporate_pr_activities_metrics_check CHECK (
    cost_amount >= 0 AND estimated_reach >= 0 AND actual_reach >= 0 AND estimated_media_value >= 0 AND attributed_revenue >= 0
  )
);

CREATE INDEX corporate_pr_activities_scope_status_idx
  ON corporate_pr_activities(tenant_id, company_id, branch_id, status, starts_at DESC);
CREATE INDEX corporate_pr_activities_type_idx
  ON corporate_pr_activities(tenant_id, company_id, activity_type, status);
CREATE INDEX corporate_pr_activities_campaign_idx
  ON corporate_pr_activities(campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_corporate_pr_activity_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'corporate pr company scope mismatch';
  END IF;

  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM branches b WHERE b.id=NEW.branch_id AND b."companyId"=NEW.company_id
  ) THEN
    RAISE EXCEPTION 'corporate pr branch scope mismatch';
  END IF;

  IF NEW.campaign_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM corporate_communication_campaigns c
    WHERE c.id=NEW.campaign_id AND c.tenant_id=NEW.tenant_id AND c.company_id=NEW.company_id
      AND (NEW.branch_id IS NULL OR c.branch_id IS NULL OR c.branch_id=NEW.branch_id)
  ) THEN
    RAISE EXCEPTION 'corporate pr campaign scope mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER corporate_pr_activities_scope_guard
BEFORE INSERT OR UPDATE ON corporate_pr_activities
FOR EACH ROW EXECUTE FUNCTION validate_corporate_pr_activity_scope();

COMMIT;
