-- CRM Phase 1 / 5.2: ensure normalized lead attribution references belong to the same
-- tenant/company and form one internally consistent Channel -> Source -> Campaign -> Ad Set -> Ad chain.

CREATE OR REPLACE FUNCTION crm_validate_lead_acquisition_refs()
RETURNS trigger AS $$
DECLARE
  ref_tenant TEXT;
  ref_company TEXT;
  parent_id UUID;
BEGIN
  IF NEW.acquisition_channel_id IS NOT NULL THEN
    SELECT tenant_id, company_id INTO ref_tenant, ref_company
    FROM crm_acquisition_channels WHERE id=NEW.acquisition_channel_id;
    IF ref_tenant IS DISTINCT FROM NEW.tenant_id OR ref_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'CRM lead acquisition channel scope mismatch';
    END IF;
  END IF;

  IF NEW.acquisition_source_id IS NOT NULL THEN
    SELECT tenant_id, company_id, channel_id INTO ref_tenant, ref_company, parent_id
    FROM crm_acquisition_sources WHERE id=NEW.acquisition_source_id;
    IF ref_tenant IS DISTINCT FROM NEW.tenant_id OR ref_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'CRM lead acquisition source scope mismatch';
    END IF;
    IF NEW.acquisition_channel_id IS NOT NULL AND parent_id IS DISTINCT FROM NEW.acquisition_channel_id THEN
      RAISE EXCEPTION 'CRM lead acquisition channel/source hierarchy mismatch';
    END IF;
  END IF;

  IF NEW.acquisition_campaign_ref_id IS NOT NULL THEN
    SELECT tenant_id, company_id, source_id INTO ref_tenant, ref_company, parent_id
    FROM crm_acquisition_campaigns WHERE id=NEW.acquisition_campaign_ref_id;
    IF ref_tenant IS DISTINCT FROM NEW.tenant_id OR ref_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'CRM lead acquisition campaign scope mismatch';
    END IF;
    IF NEW.acquisition_source_id IS NOT NULL AND parent_id IS DISTINCT FROM NEW.acquisition_source_id THEN
      RAISE EXCEPTION 'CRM lead acquisition source/campaign hierarchy mismatch';
    END IF;
  END IF;

  IF NEW.acquisition_ad_set_ref_id IS NOT NULL THEN
    SELECT tenant_id, company_id, campaign_id INTO ref_tenant, ref_company, parent_id
    FROM crm_acquisition_ad_sets WHERE id=NEW.acquisition_ad_set_ref_id;
    IF ref_tenant IS DISTINCT FROM NEW.tenant_id OR ref_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'CRM lead acquisition ad set scope mismatch';
    END IF;
    IF NEW.acquisition_campaign_ref_id IS NOT NULL AND parent_id IS DISTINCT FROM NEW.acquisition_campaign_ref_id THEN
      RAISE EXCEPTION 'CRM lead acquisition campaign/ad set hierarchy mismatch';
    END IF;
  END IF;

  IF NEW.acquisition_ad_ref_id IS NOT NULL THEN
    SELECT tenant_id, company_id, ad_set_id INTO ref_tenant, ref_company, parent_id
    FROM crm_acquisition_ads WHERE id=NEW.acquisition_ad_ref_id;
    IF ref_tenant IS DISTINCT FROM NEW.tenant_id OR ref_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'CRM lead acquisition ad scope mismatch';
    END IF;
    IF NEW.acquisition_ad_set_ref_id IS NOT NULL AND parent_id IS DISTINCT FROM NEW.acquisition_ad_set_ref_id THEN
      RAISE EXCEPTION 'CRM lead acquisition ad set/ad hierarchy mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_leads_acquisition_scope_guard ON crm_leads;
CREATE TRIGGER crm_leads_acquisition_scope_guard
BEFORE INSERT OR UPDATE OF tenant_id, company_id, acquisition_channel_id, acquisition_source_id, acquisition_campaign_ref_id, acquisition_ad_set_ref_id, acquisition_ad_ref_id
ON crm_leads
FOR EACH ROW EXECUTE FUNCTION crm_validate_lead_acquisition_refs();
