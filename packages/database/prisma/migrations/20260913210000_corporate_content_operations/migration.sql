BEGIN;

CREATE TABLE corporate_content_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
  campaign_id TEXT REFERENCES corporate_communication_campaigns(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  platform TEXT NOT NULL,
  format TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IDEA',
  caption TEXT,
  cta TEXT,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT corporate_content_items_platform_check CHECK (
    platform IN ('INSTAGRAM','FACEBOOK','TIKTOK','YOUTUBE','LINKEDIN','WEBSITE','EMAIL','SMS','WHATSAPP','OTHER')
  ),
  CONSTRAINT corporate_content_items_format_check CHECK (
    format IN ('POST','REEL','STORY','VIDEO','ARTICLE','EMAIL','SMS','BANNER','OTHER')
  ),
  CONSTRAINT corporate_content_items_status_check CHECK (
    status IN ('IDEA','BRIEF','PRODUCTION','REVIEW','APPROVED','SCHEDULED','PUBLISHED','ARCHIVED')
  ),
  CONSTRAINT corporate_content_items_publish_check CHECK (
    (status <> 'PUBLISHED') OR published_at IS NOT NULL
  ),
  CONSTRAINT corporate_content_items_schedule_check CHECK (
    (status <> 'SCHEDULED') OR scheduled_at IS NOT NULL
  )
);

CREATE INDEX corporate_content_items_scope_status_idx
  ON corporate_content_items(tenant_id,company_id,branch_id,status,updated_at DESC);
CREATE INDEX corporate_content_items_calendar_idx
  ON corporate_content_items(tenant_id,company_id,scheduled_at)
  WHERE scheduled_at IS NOT NULL;
CREATE INDEX corporate_content_items_campaign_idx
  ON corporate_content_items(campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE TABLE corporate_content_approvals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
  content_id TEXT NOT NULL REFERENCES corporate_content_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  requested_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  decision_note TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT corporate_content_approvals_status_check CHECK (
    status IN ('PENDING','APPROVED','CHANGES_REQUESTED','REJECTED','CANCELLED')
  ),
  CONSTRAINT corporate_content_approvals_decision_check CHECK (
    (status = 'PENDING' AND decided_at IS NULL) OR
    (status <> 'PENDING' AND decided_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX corporate_content_approvals_pending_key
  ON corporate_content_approvals(content_id)
  WHERE status='PENDING';
CREATE INDEX corporate_content_approvals_queue_idx
  ON corporate_content_approvals(tenant_id,company_id,status,created_at);

CREATE TABLE corporate_content_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
  content_id TEXT NOT NULL REFERENCES corporate_content_items(id) ON DELETE CASCADE,
  approval_id TEXT REFERENCES corporate_content_approvals(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX corporate_content_events_content_idx
  ON corporate_content_events(content_id,created_at,id);

CREATE OR REPLACE FUNCTION validate_corporate_content_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c
    WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'corporate content company scope mismatch';
  END IF;

  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id=NEW.branch_id AND b."companyId"=NEW.company_id
  ) THEN
    RAISE EXCEPTION 'corporate content branch scope mismatch';
  END IF;

  IF TG_TABLE_NAME='corporate_content_items' AND NEW.campaign_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM corporate_communication_campaigns c
    WHERE c.id=NEW.campaign_id
      AND c.tenant_id=NEW.tenant_id
      AND c.company_id=NEW.company_id
      AND (NEW.branch_id IS NULL OR c.branch_id IS NULL OR c.branch_id=NEW.branch_id)
  ) THEN
    RAISE EXCEPTION 'corporate content campaign scope mismatch';
  END IF;

  IF TG_TABLE_NAME='corporate_content_approvals' AND NOT EXISTS (
    SELECT 1 FROM corporate_content_items c
    WHERE c.id=NEW.content_id
      AND c.tenant_id=NEW.tenant_id
      AND c.company_id=NEW.company_id
      AND c.branch_id IS NOT DISTINCT FROM NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'corporate content approval scope mismatch';
  END IF;

  IF TG_TABLE_NAME='corporate_content_events' AND NOT EXISTS (
    SELECT 1 FROM corporate_content_items c
    WHERE c.id=NEW.content_id
      AND c.tenant_id=NEW.tenant_id
      AND c.company_id=NEW.company_id
      AND c.branch_id IS NOT DISTINCT FROM NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'corporate content event scope mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER corporate_content_items_scope_guard
BEFORE INSERT OR UPDATE ON corporate_content_items
FOR EACH ROW EXECUTE FUNCTION validate_corporate_content_scope();

CREATE TRIGGER corporate_content_approvals_scope_guard
BEFORE INSERT OR UPDATE ON corporate_content_approvals
FOR EACH ROW EXECUTE FUNCTION validate_corporate_content_scope();

CREATE TRIGGER corporate_content_events_scope_guard
BEFORE INSERT OR UPDATE ON corporate_content_events
FOR EACH ROW EXECUTE FUNCTION validate_corporate_content_scope();

COMMIT;
