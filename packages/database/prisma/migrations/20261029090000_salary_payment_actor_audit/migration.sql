-- Existing payments remain readable; new payments record the authenticated actor.
ALTER TABLE salary_payments
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT;

CREATE INDEX IF NOT EXISTS salary_payments_actor_lookup_idx
  ON salary_payments(tenant_id, company_id, created_by_user_id, paid_at DESC)
  WHERE created_by_user_id IS NOT NULL;
