ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS lead_score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lead_score_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS crm_leads_score_idx
  ON crm_leads(tenant_id,company_id,branch_id,lead_score DESC,updated_at DESC);
