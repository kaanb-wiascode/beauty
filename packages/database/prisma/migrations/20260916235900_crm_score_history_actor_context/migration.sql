BEGIN;

-- Attribute score history rows to the actor supplied by the application transaction.
-- Automatic/background scoring remains nullable when no authenticated actor exists.
CREATE OR REPLACE FUNCTION crm_record_lead_score_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor_user_id TEXT;
BEGIN
  v_actor_user_id := NULLIF(current_setting('crm.actor_user_id', TRUE), '');

  IF TG_OP = 'INSERT'
     OR NEW.lead_score IS DISTINCT FROM OLD.lead_score
     OR NEW.lead_temperature IS DISTINCT FROM OLD.lead_temperature
     OR NEW.lead_score_version IS DISTINCT FROM OLD.lead_score_version THEN
    INSERT INTO crm_lead_score_history(
      tenant_id, company_id, branch_id, lead_id, score, temperature,
      score_version, explanation, source, actor_user_id, reason
    ) VALUES (
      NEW.tenant_id, NEW.company_id, NEW.branch_id, NEW.id, NEW.lead_score, NEW.lead_temperature,
      NEW.lead_score_version, NEW.lead_score_explanation,
      CASE WHEN NEW.lead_score_overridden THEN 'MANUAL_OVERRIDE' ELSE 'AUTOMATIC' END,
      v_actor_user_id,
      NEW.lead_score_override_reason
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
