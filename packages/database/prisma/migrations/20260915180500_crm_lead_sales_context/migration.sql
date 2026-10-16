-- CRM Phase 1 / 5.1: sales ownership, scoring and lifecycle timestamps.

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS team TEXT,
  ADD COLUMN IF NOT EXISTS lead_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_temperature TEXT NOT NULL DEFAULT 'COLD',
  ADD COLUMN IF NOT EXISTS first_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disqualified_at TIMESTAMPTZ;

ALTER TABLE crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_score_check,
  DROP CONSTRAINT IF EXISTS crm_leads_temperature_check;

ALTER TABLE crm_leads
  ADD CONSTRAINT crm_leads_score_check CHECK (lead_score BETWEEN 0 AND 100),
  ADD CONSTRAINT crm_leads_temperature_check CHECK (lead_temperature IN ('COLD','WARM','HOT'));

-- Existing owned leads were assigned no later than their creation timestamp.
UPDATE crm_leads
SET first_assigned_at = created_at
WHERE owner_user_id IS NOT NULL AND first_assigned_at IS NULL;

-- Preserve lifecycle facts for existing records when status already implies them.
UPDATE crm_leads
SET first_contacted_at = COALESCE(first_contacted_at, updated_at)
WHERE status IN ('CONTACTED','QUALIFIED','CONVERTED') AND first_contacted_at IS NULL;

UPDATE crm_leads
SET qualified_at = COALESCE(qualified_at, updated_at)
WHERE status IN ('QUALIFIED','CONVERTED') AND qualified_at IS NULL;

UPDATE crm_leads
SET disqualified_at = COALESCE(disqualified_at, updated_at)
WHERE status = 'LOST' AND disqualified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_sales_queue_scope
  ON crm_leads(tenant_id, company_id, branch_id, lead_temperature, lead_score DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_leads_team_scope
  ON crm_leads(tenant_id, company_id, branch_id, team)
  WHERE team IS NOT NULL;
