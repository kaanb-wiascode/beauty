-- CRM Phase 1 hardening: structured lost reasons must remain referentially valid.
-- Scope/is-active validation remains enforced by crm_validate_lost_reason_scope().

ALTER TABLE crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_lost_reason_id_fkey;
ALTER TABLE crm_leads
  ADD CONSTRAINT crm_leads_lost_reason_id_fkey
  FOREIGN KEY (lost_reason_id) REFERENCES crm_lost_reasons(id)
  ON UPDATE RESTRICT ON DELETE RESTRICT NOT VALID;
ALTER TABLE crm_leads
  VALIDATE CONSTRAINT crm_leads_lost_reason_id_fkey;

ALTER TABLE crm_opportunities
  DROP CONSTRAINT IF EXISTS crm_opportunities_lost_reason_id_fkey;
ALTER TABLE crm_opportunities
  ADD CONSTRAINT crm_opportunities_lost_reason_id_fkey
  FOREIGN KEY (lost_reason_id) REFERENCES crm_lost_reasons(id)
  ON UPDATE RESTRICT ON DELETE RESTRICT NOT VALID;
ALTER TABLE crm_opportunities
  VALIDATE CONSTRAINT crm_opportunities_lost_reason_id_fkey;
