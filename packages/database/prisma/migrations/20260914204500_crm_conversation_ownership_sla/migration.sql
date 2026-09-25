BEGIN;

CREATE TABLE crm_conversation_assignments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES crm_leads(id) ON DELETE CASCADE,
  opportunity_id TEXT REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  assigned_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(num_nonnulls(customer_id,lead_id,opportunity_id)=1)
);

CREATE UNIQUE INDEX crm_conversation_assignments_customer_unique
  ON crm_conversation_assignments(tenant_id,company_id,branch_id,customer_id)
  WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX crm_conversation_assignments_lead_unique
  ON crm_conversation_assignments(tenant_id,company_id,branch_id,lead_id)
  WHERE lead_id IS NOT NULL;
CREATE UNIQUE INDEX crm_conversation_assignments_opportunity_unique
  ON crm_conversation_assignments(tenant_id,company_id,branch_id,opportunity_id)
  WHERE opportunity_id IS NOT NULL;
CREATE INDEX crm_conversation_assignments_user_idx
  ON crm_conversation_assignments(tenant_id,company_id,branch_id,assigned_user_id);

CREATE TABLE crm_conversation_sla_policies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  whatsapp_target_minutes INTEGER NOT NULL DEFAULT 120 CHECK(whatsapp_target_minutes BETWEEN 5 AND 10080),
  sms_target_minutes INTEGER NOT NULL DEFAULT 120 CHECK(sms_target_minutes BETWEEN 5 AND 10080),
  email_target_minutes INTEGER NOT NULL DEFAULT 240 CHECK(email_target_minutes BETWEEN 5 AND 10080),
  critical_after_minutes INTEGER NOT NULL DEFAULT 1440 CHECK(critical_after_minutes BETWEEN 30 AND 43200),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,company_id,branch_id)
);

CREATE OR REPLACE FUNCTION validate_crm_conversation_assignment_scope() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c JOIN branches b ON b."companyId"=c.id
    WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id AND b.id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm conversation assignment organization scope mismatch'; END IF;
  IF NEW.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM customers c WHERE c.id=NEW.customer_id AND c."tenantId"=NEW.tenant_id AND c."branchId"=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm conversation assignment customer scope mismatch'; END IF;
  IF NEW.lead_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id=NEW.lead_id AND l.tenant_id=NEW.tenant_id AND l.company_id=NEW.company_id AND l.branch_id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm conversation assignment lead scope mismatch'; END IF;
  IF NEW.opportunity_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM crm_opportunities o WHERE o.id=NEW.opportunity_id AND o.tenant_id=NEW.tenant_id AND o.company_id=NEW.company_id AND o.branch_id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm conversation assignment opportunity scope mismatch'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_conversation_assignments_scope_guard
  BEFORE INSERT OR UPDATE ON crm_conversation_assignments
  FOR EACH ROW EXECUTE FUNCTION validate_crm_conversation_assignment_scope();

CREATE OR REPLACE FUNCTION validate_crm_conversation_sla_scope() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c JOIN branches b ON b."companyId"=c.id
    WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id AND b.id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'crm conversation SLA organization scope mismatch'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_conversation_sla_scope_guard
  BEFORE INSERT OR UPDATE ON crm_conversation_sla_policies
  FOR EACH ROW EXECUTE FUNCTION validate_crm_conversation_sla_scope();

COMMIT;
