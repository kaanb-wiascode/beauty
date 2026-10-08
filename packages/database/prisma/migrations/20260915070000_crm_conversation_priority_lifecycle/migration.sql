BEGIN;

ALTER TABLE crm_conversation_states
  ADD COLUMN priority TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN resolved_at TIMESTAMPTZ,
  ADD COLUMN resolved_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE crm_conversation_states
  DROP CONSTRAINT IF EXISTS crm_conversation_states_status_check,
  DROP CONSTRAINT IF EXISTS crm_conversation_states_check;

ALTER TABLE crm_conversation_states
  ADD CONSTRAINT crm_conversation_states_status_check
    CHECK(status IN ('OPEN','PENDING','RESOLVED','SNOOZED','CLOSED')),
  ADD CONSTRAINT crm_conversation_states_priority_check
    CHECK(priority IN ('LOW','NORMAL','HIGH','URGENT')),
  ADD CONSTRAINT crm_conversation_states_lifecycle_check
    CHECK(
      (status='SNOOZED' AND snoozed_until IS NOT NULL AND resolved_at IS NULL AND closed_at IS NULL) OR
      (status='RESOLVED' AND snoozed_until IS NULL AND resolved_at IS NOT NULL AND closed_at IS NULL) OR
      (status='CLOSED' AND snoozed_until IS NULL AND resolved_at IS NULL AND closed_at IS NOT NULL) OR
      (status IN ('OPEN','PENDING') AND snoozed_until IS NULL AND resolved_at IS NULL AND closed_at IS NULL)
    );

DROP INDEX IF EXISTS crm_conversation_states_queue_idx;
CREATE INDEX crm_conversation_states_queue_idx
  ON crm_conversation_states(tenant_id,company_id,branch_id,status,priority,snoozed_until);

CREATE TABLE crm_conversation_state_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_state_id TEXT NOT NULL REFERENCES crm_conversation_states(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES crm_leads(id) ON DELETE CASCADE,
  opportunity_id TEXT REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  previous_status TEXT,
  status TEXT NOT NULL,
  previous_priority TEXT,
  priority TEXT NOT NULL,
  state_version INTEGER NOT NULL CHECK(state_version >= 1),
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(num_nonnulls(customer_id,lead_id,opportunity_id)=1),
  CHECK(previous_status IS NULL OR previous_status IN ('OPEN','PENDING','RESOLVED','SNOOZED','CLOSED')),
  CHECK(status IN ('OPEN','PENDING','RESOLVED','SNOOZED','CLOSED')),
  CHECK(previous_priority IS NULL OR previous_priority IN ('LOW','NORMAL','HIGH','URGENT')),
  CHECK(priority IN ('LOW','NORMAL','HIGH','URGENT'))
);

CREATE INDEX crm_conversation_state_events_subject_idx
  ON crm_conversation_state_events(tenant_id,company_id,branch_id,created_at DESC);
CREATE INDEX crm_conversation_state_events_state_idx
  ON crm_conversation_state_events(conversation_state_id,created_at DESC);

CREATE OR REPLACE FUNCTION validate_crm_conversation_state_event_scope() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM crm_conversation_states s
    WHERE s.id=NEW.conversation_state_id
      AND s.tenant_id=NEW.tenant_id AND s.company_id=NEW.company_id AND s.branch_id=NEW.branch_id
      AND s.customer_id IS NOT DISTINCT FROM NEW.customer_id
      AND s.lead_id IS NOT DISTINCT FROM NEW.lead_id
      AND s.opportunity_id IS NOT DISTINCT FROM NEW.opportunity_id
  ) THEN RAISE EXCEPTION 'crm conversation state event scope mismatch'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_conversation_state_events_scope_guard
  BEFORE INSERT ON crm_conversation_state_events
  FOR EACH ROW EXECUTE FUNCTION validate_crm_conversation_state_event_scope();

CREATE OR REPLACE FUNCTION prevent_crm_conversation_state_event_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'crm conversation state events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_conversation_state_events_immutable
  BEFORE UPDATE OR DELETE ON crm_conversation_state_events
  FOR EACH ROW EXECUTE FUNCTION prevent_crm_conversation_state_event_mutation();

COMMIT;
