CREATE TABLE corporate_communication_campaigns (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  name TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT 'LEAD_GENERATION',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  channel TEXT NOT NULL DEFAULT 'MULTI_CHANNEL',
  service_id TEXT,
  planned_budget NUMERIC(14,2) NOT NULL DEFAULT 0,
  spent_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  owner_user_id TEXT,
  notes TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT corporate_campaign_budget_nonnegative CHECK (planned_budget >= 0 AND spent_amount >= 0),
  CONSTRAINT corporate_campaign_dates_valid CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT corporate_campaign_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT corporate_campaign_branch_fk FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT corporate_campaign_service_fk FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
  CONSTRAINT corporate_campaign_owner_fk FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT corporate_campaign_creator_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX corporate_campaign_scope_idx ON corporate_communication_campaigns(tenant_id, company_id, branch_id);
CREATE INDEX corporate_campaign_status_idx ON corporate_communication_campaigns(company_id, status, starts_at);

CREATE TABLE corporate_marketing_leads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  campaign_id TEXT,
  provider TEXT NOT NULL DEFAULT 'MANUAL',
  external_lead_id TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'NEW',
  service_interest TEXT,
  preferred_branch_id TEXT,
  assigned_user_id TEXT,
  crm_lead_id TEXT,
  customer_id TEXT,
  source_payload JSONB,
  first_touch JSONB,
  last_touch JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_to_crm_at TIMESTAMPTZ,
  appointment_id TEXT,
  sale_id TEXT,
  revenue_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT corporate_marketing_lead_contact CHECK (phone IS NOT NULL OR email IS NOT NULL),
  CONSTRAINT corporate_marketing_lead_revenue_nonnegative CHECK (revenue_amount >= 0),
  CONSTRAINT corporate_marketing_lead_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT corporate_marketing_lead_branch_fk FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT corporate_marketing_lead_preferred_branch_fk FOREIGN KEY (preferred_branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT corporate_marketing_lead_campaign_fk FOREIGN KEY (campaign_id) REFERENCES corporate_communication_campaigns(id) ON DELETE SET NULL,
  CONSTRAINT corporate_marketing_lead_assignee_fk FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT corporate_marketing_lead_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT corporate_marketing_lead_appointment_fk FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  CONSTRAINT corporate_marketing_lead_sale_fk FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX corporate_marketing_lead_provider_external_uq
  ON corporate_marketing_leads(company_id, provider, external_lead_id)
  WHERE external_lead_id IS NOT NULL;
CREATE INDEX corporate_marketing_lead_scope_idx ON corporate_marketing_leads(tenant_id, company_id, branch_id);
CREATE INDEX corporate_marketing_lead_campaign_idx ON corporate_marketing_leads(company_id, campaign_id, received_at DESC);
CREATE INDEX corporate_marketing_lead_status_idx ON corporate_marketing_leads(company_id, status, received_at DESC);

CREATE TABLE corporate_marketing_touchpoints (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  marketing_lead_id TEXT NOT NULL,
  campaign_id TEXT,
  provider TEXT NOT NULL,
  touch_type TEXT NOT NULL,
  external_campaign_id TEXT,
  external_ad_group_id TEXT,
  external_ad_id TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  click_id TEXT,
  metadata JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT corporate_touchpoint_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT corporate_touchpoint_lead_fk FOREIGN KEY (marketing_lead_id) REFERENCES corporate_marketing_leads(id) ON DELETE CASCADE,
  CONSTRAINT corporate_touchpoint_campaign_fk FOREIGN KEY (campaign_id) REFERENCES corporate_communication_campaigns(id) ON DELETE SET NULL
);
CREATE INDEX corporate_touchpoint_lead_idx ON corporate_marketing_touchpoints(company_id, marketing_lead_id, occurred_at);

CREATE TABLE corporate_brand_assets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  storage_key TEXT,
  external_url TEXT,
  version TEXT,
  usage_rules TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT corporate_brand_asset_location CHECK (storage_key IS NOT NULL OR external_url IS NOT NULL),
  CONSTRAINT corporate_brand_asset_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT corporate_brand_asset_creator_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX corporate_brand_asset_scope_idx ON corporate_brand_assets(tenant_id, company_id, active);

CREATE TABLE corporate_marketing_provider_connections (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_account_id TEXT,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DISCONNECTED',
  credential_reference TEXT,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT corporate_provider_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT corporate_provider_creator_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX corporate_provider_account_uq
  ON corporate_marketing_provider_connections(company_id, provider, external_account_id)
  WHERE external_account_id IS NOT NULL;

CREATE TABLE corporate_lead_routing_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  provider TEXT,
  campaign_id TEXT,
  target_branch_id TEXT,
  target_user_id TEXT,
  strategy TEXT NOT NULL DEFAULT 'FIXED',
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT corporate_routing_priority_positive CHECK (priority > 0),
  CONSTRAINT corporate_routing_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT corporate_routing_campaign_fk FOREIGN KEY (campaign_id) REFERENCES corporate_communication_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT corporate_routing_branch_fk FOREIGN KEY (target_branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT corporate_routing_user_fk FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT corporate_routing_creator_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX corporate_routing_scope_idx ON corporate_lead_routing_rules(company_id, active, priority);

CREATE OR REPLACE FUNCTION enforce_corporate_communications_scope()
RETURNS trigger AS $$
DECLARE
  company_tenant TEXT;
  branch_company TEXT;
BEGIN
  SELECT "tenantId" INTO company_tenant FROM companies WHERE id = NEW.company_id;
  IF company_tenant IS NULL OR company_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'corporate communications company scope mismatch';
  END IF;

  IF NEW.branch_id IS NOT NULL THEN
    SELECT "companyId" INTO branch_company FROM branches WHERE id = NEW.branch_id;
    IF branch_company IS NULL OR branch_company <> NEW.company_id THEN
      RAISE EXCEPTION 'corporate communications branch scope mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER corporate_campaign_scope_guard
BEFORE INSERT OR UPDATE ON corporate_communication_campaigns
FOR EACH ROW EXECUTE FUNCTION enforce_corporate_communications_scope();

CREATE TRIGGER corporate_marketing_lead_scope_guard
BEFORE INSERT OR UPDATE ON corporate_marketing_leads
FOR EACH ROW EXECUTE FUNCTION enforce_corporate_communications_scope();

INSERT INTO permissions(id, resource, action, description)
VALUES
  (gen_random_uuid()::text, 'communications', 'read', 'Corporate communications read permission'),
  (gen_random_uuid()::text, 'communications', 'manage', 'Corporate communications manage permission'),
  (gen_random_uuid()::text, 'communications', 'approve', 'Corporate communications approval permission'),
  (gen_random_uuid()::text, 'communications', 'analytics', 'Corporate communications analytics permission')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO role_permissions("roleId", "permissionId")
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.resource='communications'
WHERE r.slug='owner'
ON CONFLICT DO NOTHING;
