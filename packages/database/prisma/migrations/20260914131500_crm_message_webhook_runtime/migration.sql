BEGIN;
ALTER TABLE crm_messages ALTER COLUMN created_by_user_id DROP NOT NULL;
CREATE TABLE crm_message_webhook_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
 branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 provider_key TEXT NOT NULL,
 external_event_id TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('DELIVERY','INBOUND')),
 external_message_id TEXT,
 message_id TEXT REFERENCES crm_messages(id) ON DELETE RESTRICT,
 outcome TEXT NOT NULL CHECK(outcome IN ('PROCESSED','IGNORED','FAILED')),
 error_message TEXT,
 received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(provider_key,external_event_id)
);
CREATE INDEX crm_message_webhook_scope_time_idx ON crm_message_webhook_events(tenant_id,company_id,branch_id,received_at DESC);
CREATE INDEX crm_message_webhook_message_idx ON crm_message_webhook_events(message_id,received_at DESC) WHERE message_id IS NOT NULL;
CREATE OR REPLACE FUNCTION validate_crm_message_webhook_scope() RETURNS TRIGGER AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM companies c JOIN branches b ON b."companyId"=c.id WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id AND b.id=NEW.branch_id) THEN RAISE EXCEPTION 'crm message webhook organization scope mismatch'; END IF;
 IF NEW.message_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM crm_messages m WHERE m.id=NEW.message_id AND m.tenant_id=NEW.tenant_id AND m.company_id=NEW.company_id AND m.branch_id=NEW.branch_id) THEN RAISE EXCEPTION 'crm message webhook message scope mismatch'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER crm_message_webhook_scope_guard BEFORE INSERT OR UPDATE ON crm_message_webhook_events FOR EACH ROW EXECUTE FUNCTION validate_crm_message_webhook_scope();
COMMIT;
