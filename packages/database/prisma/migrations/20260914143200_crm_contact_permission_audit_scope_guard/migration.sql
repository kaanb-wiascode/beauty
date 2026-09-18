BEGIN;

CREATE OR REPLACE FUNCTION validate_crm_contact_permission_event_scope() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM crm_contact_channel_permissions p
    WHERE p.id=NEW.permission_id
      AND p.tenant_id=NEW.tenant_id
      AND p.company_id=NEW.company_id
      AND p.branch_id=NEW.branch_id
      AND p.customer_id IS NOT DISTINCT FROM NEW.customer_id
      AND p.lead_id IS NOT DISTINCT FROM NEW.lead_id
      AND p.channel=NEW.channel
  ) THEN
    RAISE EXCEPTION 'crm contact permission audit scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_contact_permission_events_scope_guard
  BEFORE INSERT ON crm_contact_channel_permission_events
  FOR EACH ROW EXECUTE FUNCTION validate_crm_contact_permission_event_scope();

COMMIT;
