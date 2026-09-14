BEGIN;
CREATE TABLE crm_messages (
 id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
 branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
 lead_id TEXT REFERENCES crm_leads(id) ON DELETE CASCADE,
 opportunity_id TEXT REFERENCES crm_opportunities(id) ON DELETE CASCADE,
 direction TEXT NOT NULL CHECK(direction IN ('INBOUND','OUTBOUND')),
 channel TEXT NOT NULL CHECK(channel IN ('EMAIL','SMS','WHATSAPP')),
 status TEXT NOT NULL CHECK(status IN ('DRAFT','QUEUED','SENT','DELIVERED','FAILED','CANCELLED')),
 provider_key TEXT,
 recipient TEXT NOT NULL CHECK(length(btrim(recipient)) >= 3),
 subject TEXT,
 body TEXT NOT NULL CHECK(length(btrim(body)) >= 1),
 idempotency_key TEXT,
 external_message_id TEXT,
 error_message TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
 created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 sent_at TIMESTAMPTZ,
 delivered_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(num_nonnulls(customer_id,lead_id,opportunity_id) >= 1),
 CHECK(delivered_at IS NULL OR sent_at IS NOT NULL)
);
CREATE INDEX crm_messages_scope_time_idx ON crm_messages(tenant_id,company_id,branch_id,created_at DESC);
CREATE INDEX crm_messages_customer_time_idx ON crm_messages(customer_id,created_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX crm_messages_lead_time_idx ON crm_messages(lead_id,created_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX crm_messages_opportunity_time_idx ON crm_messages(opportunity_id,created_at DESC) WHERE opportunity_id IS NOT NULL;
CREATE UNIQUE INDEX crm_messages_idempotency_unique ON crm_messages(tenant_id,company_id,branch_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE OR REPLACE FUNCTION validate_crm_message_scope() RETURNS TRIGGER AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM companies c JOIN branches b ON b."companyId"=c.id WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id AND b.id=NEW.branch_id) THEN RAISE EXCEPTION 'crm message organization scope mismatch'; END IF;
 IF NEW.customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id=NEW.customer_id AND c."tenantId"=NEW.tenant_id AND c."branchId"=NEW.branch_id) THEN RAISE EXCEPTION 'crm message customer scope mismatch'; END IF;
 IF NEW.lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM crm_leads l WHERE l.id=NEW.lead_id AND l.tenant_id=NEW.tenant_id AND l.company_id=NEW.company_id AND l.branch_id=NEW.branch_id) THEN RAISE EXCEPTION 'crm message lead scope mismatch'; END IF;
 IF NEW.opportunity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM crm_opportunities o WHERE o.id=NEW.opportunity_id AND o.tenant_id=NEW.tenant_id AND o.company_id=NEW.company_id AND o.branch_id=NEW.branch_id) THEN RAISE EXCEPTION 'crm message opportunity scope mismatch'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER crm_messages_scope_guard BEFORE INSERT OR UPDATE ON crm_messages FOR EACH ROW EXECUTE FUNCTION validate_crm_message_scope();
COMMIT;
