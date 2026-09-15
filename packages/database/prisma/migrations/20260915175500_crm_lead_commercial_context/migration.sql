-- CRM Phase 1 / 5.1: structured commercial intent before opportunity creation.
-- Service/package interests are arrays because one lead may express multiple interests.

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS interested_service_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS interested_package_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS preferred_branch_id TEXT,
  ADD COLUMN IF NOT EXISTS estimated_budget NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS budget_currency TEXT NOT NULL DEFAULT 'TRY',
  ADD COLUMN IF NOT EXISTS purchase_urgency TEXT,
  ADD COLUMN IF NOT EXISTS consultation_need TEXT,
  ADD COLUMN IF NOT EXISTS customer_intent TEXT;

ALTER TABLE crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_estimated_budget_check,
  DROP CONSTRAINT IF EXISTS crm_leads_budget_currency_check,
  DROP CONSTRAINT IF EXISTS crm_leads_purchase_urgency_check,
  DROP CONSTRAINT IF EXISTS crm_leads_consultation_need_check;

ALTER TABLE crm_leads
  ADD CONSTRAINT crm_leads_estimated_budget_check
    CHECK (estimated_budget IS NULL OR estimated_budget >= 0),
  ADD CONSTRAINT crm_leads_budget_currency_check
    CHECK (budget_currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT crm_leads_purchase_urgency_check
    CHECK (purchase_urgency IS NULL OR purchase_urgency IN ('IMMEDIATE','THIS_WEEK','THIS_MONTH','LATER','UNKNOWN')),
  ADD CONSTRAINT crm_leads_consultation_need_check
    CHECK (consultation_need IS NULL OR consultation_need IN ('REQUIRED','REQUESTED','NOT_NEEDED','UNKNOWN'));

CREATE INDEX IF NOT EXISTS idx_crm_leads_preferred_branch_scope
  ON crm_leads(tenant_id, company_id, preferred_branch_id)
  WHERE preferred_branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_interested_services_gin
  ON crm_leads USING GIN (interested_service_ids);

CREATE INDEX IF NOT EXISTS idx_crm_leads_interested_packages_gin
  ON crm_leads USING GIN (interested_package_ids);
