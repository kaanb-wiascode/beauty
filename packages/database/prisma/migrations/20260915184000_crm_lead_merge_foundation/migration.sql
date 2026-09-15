-- CRM Phase 1 / 5.4: controlled lead merge provenance.
-- Source leads remain addressable for audit/history and point to the surviving canonical lead.

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS merged_into_lead_id TEXT,
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS merged_by_user_id TEXT;

ALTER TABLE crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_merged_into_fkey,
  DROP CONSTRAINT IF EXISTS crm_leads_merged_by_fkey,
  DROP CONSTRAINT IF EXISTS crm_leads_merge_state_check,
  ADD CONSTRAINT crm_leads_merged_into_fkey FOREIGN KEY (merged_into_lead_id) REFERENCES crm_leads(id) ON DELETE RESTRICT,
  ADD CONSTRAINT crm_leads_merged_by_fkey FOREIGN KEY (merged_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT crm_leads_merge_state_check CHECK (
    (merged_into_lead_id IS NULL AND merged_at IS NULL AND merged_by_user_id IS NULL)
    OR
    (merged_into_lead_id IS NOT NULL AND merged_at IS NOT NULL AND merged_by_user_id IS NOT NULL AND merged_into_lead_id <> id)
  );

CREATE INDEX IF NOT EXISTS idx_crm_leads_merge_target
  ON crm_leads(tenant_id, company_id, branch_id, merged_into_lead_id)
  WHERE merged_into_lead_id IS NOT NULL;

CREATE OR REPLACE FUNCTION crm_validate_lead_merge_target()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.merged_into_lead_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM crm_leads target
    WHERE target.id=NEW.merged_into_lead_id
      AND target.tenant_id=NEW.tenant_id
      AND target.company_id=NEW.company_id
      AND target.branch_id=NEW.branch_id
      AND target.merged_into_lead_id IS NULL
  ) THEN
    RAISE EXCEPTION 'CRM lead merge target must be an active lead in the same organization scope';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_merge_target_guard ON crm_leads;
CREATE TRIGGER crm_leads_merge_target_guard
BEFORE INSERT OR UPDATE OF merged_into_lead_id ON crm_leads
FOR EACH ROW EXECUTE FUNCTION crm_validate_lead_merge_target();
