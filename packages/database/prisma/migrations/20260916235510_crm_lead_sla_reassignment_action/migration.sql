BEGIN;

-- Phase 2 SLA escalation level 3 is an actual queue action, not only an audit marker.
-- The append-only crm_lead_sla_events unique(clock_id,event_type) constraint makes this idempotent.
CREATE OR REPLACE FUNCTION crm_apply_lead_sla_reassignment_action()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type <> 'REASSIGNMENT_REQUIRED' THEN
    RETURN NEW;
  END IF;

  UPDATE crm_leads
  SET owner_user_id = NULL,
      updated_at = NOW()
  WHERE id = NEW.lead_id
    AND tenant_id = NEW.tenant_id
    AND company_id = NEW.company_id
    AND branch_id = NEW.branch_id
    AND owner_user_id IS NOT NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_lead_sla_reassignment_action ON crm_lead_sla_events;
CREATE TRIGGER crm_lead_sla_reassignment_action
AFTER INSERT ON crm_lead_sla_events
FOR EACH ROW EXECUTE FUNCTION crm_apply_lead_sla_reassignment_action();

COMMIT;
