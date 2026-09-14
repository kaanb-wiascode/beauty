BEGIN;

CREATE TABLE crm_contact_channel_permissions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
  lead_id TEXT REFERENCES crm_leads(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK(channel IN ('EMAIL','SMS','WHATSAPP')),
  status TEXT NOT NULL CHECK(status IN ('OPTED_IN','OPTED_OUT','UNKNOWN')),
  source TEXT NOT NULL CHECK(source IN ('MANUAL','IMPORT','INBOUND_KEYWORD','PROVIDER','SYSTEM')),
  reason TEXT,
  changed_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(num_nonnulls(customer_id,lead_id)=1)
);

CREATE UNIQUE INDEX crm_contact_channel_permissions_customer_unique
  ON crm_contact_channel_permissions(tenant_id,company_id,branch_id,customer_id,channel)
  WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX crm_contact_channel_permissions_lead_unique
  ON crm_contact_channel_permissions(tenant_id,company_id,branch_id,lead_id,channel)
  WHERE lead_id IS NOT NULL;
CREATE INDEX crm_contact_channel_permissions_scope_idx
  ON crm_contact_channel_permissions(tenant_id,company_id,branch_id,status,channel);

CREATE OR REPLACE FUNCTION validate_crm_contact_channel_permission_scope() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c
    JOIN branches b ON b."companyId"=c.id
    WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id AND b.id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm contact permission organization scope mismatch'; END IF;
  IF NEW.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id=NEW.customer_id AND c."tenantId"=NEW.tenant_id AND c."branchId"=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm contact permission customer scope mismatch'; END IF;
  IF NEW.lead_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM crm_leads l
    WHERE l.id=NEW.lead_id AND l.tenant_id=NEW.tenant_id AND l.company_id=NEW.company_id AND l.branch_id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm contact permission lead scope mismatch'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_contact_channel_permissions_scope_guard
  BEFORE INSERT OR UPDATE ON crm_contact_channel_permissions
  FOR EACH ROW EXECUTE FUNCTION validate_crm_contact_channel_permission_scope();

CREATE TABLE crm_unresolved_inbound_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  provider_key TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  external_message_id TEXT,
  channel TEXT NOT NULL CHECK(channel IN ('EMAIL','SMS','WHATSAPP')),
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL CHECK(length(btrim(body))>=1),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED','DISMISSED')),
  customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
  lead_id TEXT REFERENCES crm_leads(id) ON DELETE RESTRICT,
  resolved_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,company_id,branch_id,provider_key,external_event_id),
  CHECK(num_nonnulls(customer_id,lead_id)<=1),
  CHECK((status='OPEN' AND resolved_at IS NULL) OR (status IN ('RESOLVED','DISMISSED') AND resolved_at IS NOT NULL)),
  CHECK(status<>'RESOLVED' OR num_nonnulls(customer_id,lead_id)=1)
);

CREATE INDEX crm_unresolved_inbound_scope_status_idx
  ON crm_unresolved_inbound_messages(tenant_id,company_id,branch_id,status,created_at DESC);

CREATE OR REPLACE FUNCTION validate_crm_unresolved_inbound_scope() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c
    JOIN branches b ON b."companyId"=c.id
    WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id AND b.id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm unresolved inbound organization scope mismatch'; END IF;
  IF NEW.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id=NEW.customer_id AND c."tenantId"=NEW.tenant_id AND c."branchId"=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm unresolved inbound customer scope mismatch'; END IF;
  IF NEW.lead_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM crm_leads l
    WHERE l.id=NEW.lead_id AND l.tenant_id=NEW.tenant_id AND l.company_id=NEW.company_id AND l.branch_id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm unresolved inbound lead scope mismatch'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_unresolved_inbound_scope_guard
  BEFORE INSERT OR UPDATE ON crm_unresolved_inbound_messages
  FOR EACH ROW EXECUTE FUNCTION validate_crm_unresolved_inbound_scope();

COMMIT;
