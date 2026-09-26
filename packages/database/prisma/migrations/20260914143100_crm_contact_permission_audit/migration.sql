BEGIN;

CREATE TABLE crm_contact_channel_permission_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  permission_id TEXT NOT NULL REFERENCES crm_contact_channel_permissions(id) ON DELETE RESTRICT,
  customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
  lead_id TEXT REFERENCES crm_leads(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK(channel IN ('EMAIL','SMS','WHATSAPP')),
  previous_status TEXT CHECK(previous_status IS NULL OR previous_status IN ('OPTED_IN','OPTED_OUT','UNKNOWN')),
  status TEXT NOT NULL CHECK(status IN ('OPTED_IN','OPTED_OUT','UNKNOWN')),
  source TEXT NOT NULL CHECK(source IN ('MANUAL','IMPORT','INBOUND_KEYWORD','PROVIDER','SYSTEM')),
  reason TEXT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(num_nonnulls(customer_id,lead_id)=1)
);

CREATE INDEX crm_contact_permission_events_scope_time_idx
  ON crm_contact_channel_permission_events(tenant_id,company_id,branch_id,created_at DESC);
CREATE INDEX crm_contact_permission_events_permission_time_idx
  ON crm_contact_channel_permission_events(permission_id,created_at DESC);

CREATE OR REPLACE FUNCTION prevent_crm_contact_permission_event_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'crm contact permission events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_contact_permission_events_no_update
  BEFORE UPDATE OR DELETE ON crm_contact_channel_permission_events
  FOR EACH ROW EXECUTE FUNCTION prevent_crm_contact_permission_event_mutation();

COMMIT;
