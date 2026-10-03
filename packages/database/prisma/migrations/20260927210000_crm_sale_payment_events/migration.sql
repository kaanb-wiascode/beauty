ALTER TABLE crm_events
  ADD COLUMN IF NOT EXISTS sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_id TEXT REFERENCES sale_payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_events_sale_idx
  ON crm_events(sale_id, created_at DESC)
  WHERE sale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_events_payment_idx
  ON crm_events(payment_id, created_at DESC)
  WHERE payment_id IS NOT NULL;
