ALTER TABLE crm_quotes
  ADD COLUMN IF NOT EXISTS sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS crm_quotes_sale_idx
  ON crm_quotes(sale_id)
  WHERE sale_id IS NOT NULL;
