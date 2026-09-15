-- CRM Phase 1 / 5.2: normalized acquisition hierarchy.
-- Lead snapshot fields remain authoritative historical attribution; taxonomy rows provide
-- configurable identities without rewriting acquisition history when names change.

CREATE TABLE IF NOT EXISTS crm_acquisition_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, company_id, code)
);

CREATE TABLE IF NOT EXISTS crm_acquisition_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  channel_id UUID NOT NULL REFERENCES crm_acquisition_channels(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  provider TEXT,
  external_id TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, company_id, channel_id, code)
);

CREATE TABLE IF NOT EXISTS crm_acquisition_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES crm_acquisition_sources(id) ON DELETE RESTRICT,
  external_id TEXT,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_acquisition_ad_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  campaign_id UUID NOT NULL REFERENCES crm_acquisition_campaigns(id) ON DELETE RESTRICT,
  external_id TEXT,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_acquisition_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  ad_set_id UUID NOT NULL REFERENCES crm_acquisition_ad_sets(id) ON DELETE RESTRICT,
  external_id TEXT,
  name TEXT NOT NULL,
  creative_name TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS acquisition_channel_id UUID,
  ADD COLUMN IF NOT EXISTS acquisition_source_id UUID,
  ADD COLUMN IF NOT EXISTS acquisition_campaign_ref_id UUID,
  ADD COLUMN IF NOT EXISTS acquisition_ad_set_ref_id UUID,
  ADD COLUMN IF NOT EXISTS acquisition_ad_ref_id UUID;

-- Do not cascade-delete attribution references from leads. Historical lead snapshots must survive.
ALTER TABLE crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_acquisition_channel_fk,
  DROP CONSTRAINT IF EXISTS crm_leads_acquisition_source_fk,
  DROP CONSTRAINT IF EXISTS crm_leads_acquisition_campaign_fk,
  DROP CONSTRAINT IF EXISTS crm_leads_acquisition_ad_set_fk,
  DROP CONSTRAINT IF EXISTS crm_leads_acquisition_ad_fk;

ALTER TABLE crm_leads
  ADD CONSTRAINT crm_leads_acquisition_channel_fk FOREIGN KEY (acquisition_channel_id) REFERENCES crm_acquisition_channels(id) ON DELETE SET NULL,
  ADD CONSTRAINT crm_leads_acquisition_source_fk FOREIGN KEY (acquisition_source_id) REFERENCES crm_acquisition_sources(id) ON DELETE SET NULL,
  ADD CONSTRAINT crm_leads_acquisition_campaign_fk FOREIGN KEY (acquisition_campaign_ref_id) REFERENCES crm_acquisition_campaigns(id) ON DELETE SET NULL,
  ADD CONSTRAINT crm_leads_acquisition_ad_set_fk FOREIGN KEY (acquisition_ad_set_ref_id) REFERENCES crm_acquisition_ad_sets(id) ON DELETE SET NULL,
  ADD CONSTRAINT crm_leads_acquisition_ad_fk FOREIGN KEY (acquisition_ad_ref_id) REFERENCES crm_acquisition_ads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_acquisition_sources_scope ON crm_acquisition_sources(tenant_id, company_id, channel_id, active);
CREATE INDEX IF NOT EXISTS idx_crm_acquisition_campaigns_scope ON crm_acquisition_campaigns(tenant_id, company_id, source_id, active);
CREATE INDEX IF NOT EXISTS idx_crm_acquisition_ad_sets_scope ON crm_acquisition_ad_sets(tenant_id, company_id, campaign_id, active);
CREATE INDEX IF NOT EXISTS idx_crm_acquisition_ads_scope ON crm_acquisition_ads(tenant_id, company_id, ad_set_id, active);
CREATE INDEX IF NOT EXISTS idx_crm_leads_acquisition_refs_scope ON crm_leads(tenant_id, company_id, branch_id, acquisition_source_id, acquisition_campaign_ref_id);

-- Provider IDs are unique only when supplied, and always within tenant/company/provider scope.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_acquisition_source_external
  ON crm_acquisition_sources(tenant_id, company_id, provider, external_id)
  WHERE provider IS NOT NULL AND external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_acquisition_campaign_external
  ON crm_acquisition_campaigns(tenant_id, company_id, source_id, external_id)
  WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_acquisition_ad_set_external
  ON crm_acquisition_ad_sets(tenant_id, company_id, campaign_id, external_id)
  WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_acquisition_ad_external
  ON crm_acquisition_ads(tenant_id, company_id, ad_set_id, external_id)
  WHERE external_id IS NOT NULL;

-- Defense in depth: reject a hierarchy whose parent belongs to another tenant/company.
CREATE OR REPLACE FUNCTION crm_validate_acquisition_scope()
RETURNS trigger AS $$
DECLARE parent_tenant TEXT; parent_company TEXT;
BEGIN
  IF TG_TABLE_NAME = 'crm_acquisition_sources' THEN
    SELECT tenant_id, company_id INTO parent_tenant, parent_company FROM crm_acquisition_channels WHERE id=NEW.channel_id;
  ELSIF TG_TABLE_NAME = 'crm_acquisition_campaigns' THEN
    SELECT tenant_id, company_id INTO parent_tenant, parent_company FROM crm_acquisition_sources WHERE id=NEW.source_id;
  ELSIF TG_TABLE_NAME = 'crm_acquisition_ad_sets' THEN
    SELECT tenant_id, company_id INTO parent_tenant, parent_company FROM crm_acquisition_campaigns WHERE id=NEW.campaign_id;
  ELSE
    SELECT tenant_id, company_id INTO parent_tenant, parent_company FROM crm_acquisition_ad_sets WHERE id=NEW.ad_set_id;
  END IF;
  IF parent_tenant IS DISTINCT FROM NEW.tenant_id OR parent_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'CRM acquisition hierarchy scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_acquisition_sources_scope_guard ON crm_acquisition_sources;
CREATE TRIGGER crm_acquisition_sources_scope_guard BEFORE INSERT OR UPDATE ON crm_acquisition_sources FOR EACH ROW EXECUTE FUNCTION crm_validate_acquisition_scope();
DROP TRIGGER IF EXISTS crm_acquisition_campaigns_scope_guard ON crm_acquisition_campaigns;
CREATE TRIGGER crm_acquisition_campaigns_scope_guard BEFORE INSERT OR UPDATE ON crm_acquisition_campaigns FOR EACH ROW EXECUTE FUNCTION crm_validate_acquisition_scope();
DROP TRIGGER IF EXISTS crm_acquisition_ad_sets_scope_guard ON crm_acquisition_ad_sets;
CREATE TRIGGER crm_acquisition_ad_sets_scope_guard BEFORE INSERT OR UPDATE ON crm_acquisition_ad_sets FOR EACH ROW EXECUTE FUNCTION crm_validate_acquisition_scope();
DROP TRIGGER IF EXISTS crm_acquisition_ads_scope_guard ON crm_acquisition_ads;
CREATE TRIGGER crm_acquisition_ads_scope_guard BEFORE INSERT OR UPDATE ON crm_acquisition_ads FOR EACH ROW EXECUTE FUNCTION crm_validate_acquisition_scope();
