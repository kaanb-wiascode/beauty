ALTER TABLE crm_interactions
  ADD COLUMN IF NOT EXISTS outcome_code TEXT;

ALTER TABLE crm_interactions
  DROP CONSTRAINT IF EXISTS crm_interactions_outcome_code_check;

ALTER TABLE crm_interactions
  ADD CONSTRAINT crm_interactions_outcome_code_check
  CHECK (
    outcome_code IS NULL OR outcome_code IN (
      'REACHED',
      'NOT_REACHED',
      'INTERESTED',
      'UNDECIDED',
      'AWAITING_QUOTE',
      'APPOINTMENT_CREATED',
      'CALLBACK',
      'SALE',
      'NOT_INTERESTED',
      'OTHER'
    )
  );

CREATE INDEX IF NOT EXISTS crm_interactions_outcome_idx
  ON crm_interactions(tenant_id,company_id,branch_id,outcome_code,started_at DESC)
  WHERE outcome_code IS NOT NULL;
