-- CRM Phase 1 / 5.1: lifecycle facts are derived in the database so every writer
-- (API, automation, integration or backoffice job) follows the same semantics.

CREATE OR REPLACE FUNCTION crm_leads_sync_sales_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Assignment is a first-occurrence fact and must never be rewritten by reassignment.
  IF NEW.owner_user_id IS NOT NULL AND NEW.first_assigned_at IS NULL THEN
    NEW.first_assigned_at := NOW();
  END IF;

  -- CONTACTED or a later successful state proves that first contact happened.
  IF NEW.status IN ('CONTACTED', 'QUALIFIED', 'CONVERTED')
     AND NEW.first_contacted_at IS NULL THEN
    NEW.first_contacted_at := NOW();
  END IF;

  -- Qualification is also a first-occurrence fact.
  IF NEW.status IN ('QUALIFIED', 'CONVERTED') AND NEW.qualified_at IS NULL THEN
    NEW.qualified_at := NOW();
  END IF;

  -- Record the first transition into LOST. Reopening a lead does not erase history.
  IF NEW.status = 'LOST'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'LOST')
     AND NEW.disqualified_at IS NULL THEN
    NEW.disqualified_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_sales_lifecycle_guard ON crm_leads;
CREATE TRIGGER crm_leads_sales_lifecycle_guard
BEFORE INSERT OR UPDATE OF owner_user_id, status ON crm_leads
FOR EACH ROW EXECUTE FUNCTION crm_leads_sync_sales_lifecycle();

-- Protect first-occurrence lifecycle timestamps from accidental clearing or rewriting.
CREATE OR REPLACE FUNCTION crm_leads_preserve_first_lifecycle_facts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.first_assigned_at IS NOT NULL THEN NEW.first_assigned_at := OLD.first_assigned_at; END IF;
  IF OLD.first_contacted_at IS NOT NULL THEN NEW.first_contacted_at := OLD.first_contacted_at; END IF;
  IF OLD.first_response_at IS NOT NULL THEN NEW.first_response_at := OLD.first_response_at; END IF;
  IF OLD.qualified_at IS NOT NULL THEN NEW.qualified_at := OLD.qualified_at; END IF;
  IF OLD.disqualified_at IS NOT NULL THEN NEW.disqualified_at := OLD.disqualified_at; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_preserve_first_lifecycle_facts_guard ON crm_leads;
CREATE TRIGGER crm_leads_preserve_first_lifecycle_facts_guard
BEFORE UPDATE OF first_assigned_at, first_contacted_at, first_response_at, qualified_at, disqualified_at ON crm_leads
FOR EACH ROW EXECUTE FUNCTION crm_leads_preserve_first_lifecycle_facts();
