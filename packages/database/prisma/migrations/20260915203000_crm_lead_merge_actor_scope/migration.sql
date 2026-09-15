-- CRM Phase 1 merge hardening: a merge actor must belong to the same tenant.
-- The existing users(id) FK proves existence only; this trigger closes the tenant-scope gap.

CREATE OR REPLACE FUNCTION crm_validate_lead_merge_actor_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.merged_by_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM users actor
    WHERE actor.id = NEW.merged_by_user_id
      AND actor."tenantId" = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'CRM lead merge actor tenant scope mismatch';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_merge_actor_scope_guard ON crm_leads;
CREATE TRIGGER crm_leads_merge_actor_scope_guard
BEFORE INSERT OR UPDATE OF merged_by_user_id, tenant_id ON crm_leads
FOR EACH ROW EXECUTE FUNCTION crm_validate_lead_merge_actor_scope();
