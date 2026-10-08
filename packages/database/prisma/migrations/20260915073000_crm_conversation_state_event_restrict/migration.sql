BEGIN;

ALTER TABLE crm_conversation_state_events
  DROP CONSTRAINT crm_conversation_state_events_conversation_state_id_fkey,
  DROP CONSTRAINT crm_conversation_state_events_customer_id_fkey,
  DROP CONSTRAINT crm_conversation_state_events_lead_id_fkey,
  DROP CONSTRAINT crm_conversation_state_events_opportunity_id_fkey;

ALTER TABLE crm_conversation_state_events
  ADD CONSTRAINT crm_conversation_state_events_conversation_state_id_fkey
    FOREIGN KEY (conversation_state_id) REFERENCES crm_conversation_states(id) ON DELETE RESTRICT,
  ADD CONSTRAINT crm_conversation_state_events_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  ADD CONSTRAINT crm_conversation_state_events_lead_id_fkey
    FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE RESTRICT,
  ADD CONSTRAINT crm_conversation_state_events_opportunity_id_fkey
    FOREIGN KEY (opportunity_id) REFERENCES crm_opportunities(id) ON DELETE RESTRICT;

COMMIT;
