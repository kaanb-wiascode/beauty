-- CRM Phase 1 / 5.1: immutable acquisition context captured on the lead.
-- Fields remain nullable so existing leads and integrations remain backward compatible.

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS source_detail TEXT,
  ADD COLUMN IF NOT EXISTS campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS campaign_name TEXT,
  ADD COLUMN IF NOT EXISTS ad_set_id TEXT,
  ADD COLUMN IF NOT EXISTS ad_set_name TEXT,
  ADD COLUMN IF NOT EXISTS ad_id TEXT,
  ADD COLUMN IF NOT EXISTS ad_name TEXT,
  ADD COLUMN IF NOT EXISTS landing_page TEXT,
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS click_identifiers JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_click_identifiers_object_check;

ALTER TABLE crm_leads
  ADD CONSTRAINT crm_leads_click_identifiers_object_check
  CHECK (jsonb_typeof(click_identifiers) = 'object');

CREATE INDEX IF NOT EXISTS idx_crm_leads_acquisition_campaign_scope
  ON crm_leads(tenant_id, company_id, branch_id, campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_acquisition_utm_scope
  ON crm_leads(tenant_id, company_id, branch_id, utm_source, utm_campaign)
  WHERE utm_source IS NOT NULL OR utm_campaign IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_click_identifiers_gin
  ON crm_leads USING GIN (click_identifiers);
