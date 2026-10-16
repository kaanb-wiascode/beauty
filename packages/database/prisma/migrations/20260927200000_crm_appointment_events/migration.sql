ALTER TABLE crm_events
  ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_events_customer_idx
  ON crm_events(tenant_id, company_id, branch_id, customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_events_appointment_idx
  ON crm_events(appointment_id, created_at DESC)
  WHERE appointment_id IS NOT NULL;
