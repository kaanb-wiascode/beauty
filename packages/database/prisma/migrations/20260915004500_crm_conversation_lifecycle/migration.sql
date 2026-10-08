BEGIN;

CREATE TABLE crm_conversation_states (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES crm_leads(id) ON DELETE CASCADE,
  opportunity_id TEXT REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','SNOOZED','CLOSED')),
  snoozed_until TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  closed_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(num_nonnulls(customer_id,lead_id,opportunity_id)=1),
  CHECK((status='SNOOZED' AND snoozed_until IS NOT NULL AND closed_at IS NULL) OR
        (status='CLOSED' AND snoozed_until IS NULL AND closed_at IS NOT NULL) OR
        (status='OPEN' AND snoozed_until IS NULL AND closed_at IS NULL))
);

CREATE UNIQUE INDEX crm_conversation_states_customer_unique
  ON crm_conversation_states(tenant_id,company_id,branch_id,customer_id) WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX crm_conversation_states_lead_unique
  ON crm_conversation_states(tenant_id,company_id,branch_id,lead_id) WHERE lead_id IS NOT NULL;
CREATE UNIQUE INDEX crm_conversation_states_opportunity_unique
  ON crm_conversation_states(tenant_id,company_id,branch_id,opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX crm_conversation_states_queue_idx
  ON crm_conversation_states(tenant_id,company_id,branch_id,status,snoozed_until);

CREATE OR REPLACE FUNCTION validate_crm_conversation_state_scope() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c JOIN branches b ON b."companyId"=c.id
    WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id AND b.id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm conversation state organization scope mismatch'; END IF;
  IF NEW.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM customers c WHERE c.id=NEW.customer_id AND c."tenantId"=NEW.tenant_id AND c."branchId"=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm conversation state customer scope mismatch'; END IF;
  IF NEW.lead_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id=NEW.lead_id AND l.tenant_id=NEW.tenant_id AND l.company_id=NEW.company_id AND l.branch_id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm conversation state lead scope mismatch'; END IF;
  IF NEW.opportunity_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM crm_opportunities o WHERE o.id=NEW.opportunity_id AND o.tenant_id=NEW.tenant_id AND o.company_id=NEW.company_id AND o.branch_id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm conversation state opportunity scope mismatch'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_conversation_states_scope_guard
  BEFORE INSERT OR UPDATE ON crm_conversation_states
  FOR EACH ROW EXECUTE FUNCTION validate_crm_conversation_state_scope();

COMMIT;
