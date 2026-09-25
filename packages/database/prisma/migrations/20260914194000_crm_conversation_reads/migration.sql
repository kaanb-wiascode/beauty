BEGIN;

CREATE TABLE crm_conversation_reads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES crm_leads(id) ON DELETE CASCADE,
  opportunity_id TEXT REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(num_nonnulls(customer_id,lead_id,opportunity_id)=1)
);

CREATE UNIQUE INDEX crm_conversation_reads_customer_unique
  ON crm_conversation_reads(tenant_id,company_id,branch_id,user_id,customer_id)
  WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX crm_conversation_reads_lead_unique
  ON crm_conversation_reads(tenant_id,company_id,branch_id,user_id,lead_id)
  WHERE lead_id IS NOT NULL;
CREATE UNIQUE INDEX crm_conversation_reads_opportunity_unique
  ON crm_conversation_reads(tenant_id,company_id,branch_id,user_id,opportunity_id)
  WHERE opportunity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_crm_conversation_read_scope() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c JOIN branches b ON b."companyId"=c.id
    WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id AND b.id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm conversation read organization scope mismatch'; END IF;
  IF NEW.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM customers c WHERE c.id=NEW.customer_id AND c."tenantId"=NEW.tenant_id AND c."branchId"=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm conversation read customer scope mismatch'; END IF;
  IF NEW.lead_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id=NEW.lead_id AND l.tenant_id=NEW.tenant_id AND l.company_id=NEW.company_id AND l.branch_id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm conversation read lead scope mismatch'; END IF;
  IF NEW.opportunity_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM crm_opportunities o WHERE o.id=NEW.opportunity_id AND o.tenant_id=NEW.tenant_id AND o.company_id=NEW.company_id AND o.branch_id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm conversation read opportunity scope mismatch'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_conversation_reads_scope_guard
  BEFORE INSERT OR UPDATE ON crm_conversation_reads
  FOR EACH ROW EXECUTE FUNCTION validate_crm_conversation_read_scope();

COMMIT;
