CREATE TABLE IF NOT EXISTS pos_refund_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  integration_id TEXT NOT NULL,
  pos_transaction_id TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_transaction_id TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROCESSING',
  provider_reference TEXT,
  financial_event_id TEXT,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider_succeeded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT pos_refund_requests_status_check CHECK (status IN ('PROCESSING','PROVIDER_SUCCEEDED','SUCCEEDED','FAILED')),
  CONSTRAINT pos_refund_requests_amount_check CHECK (amount > 0),
  CONSTRAINT pos_refund_requests_external_event_unique UNIQUE (tenant_id, company_id, external_event_id)
);

CREATE INDEX IF NOT EXISTS pos_refund_requests_scope_idx
  ON pos_refund_requests(tenant_id, company_id, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pos_refund_requests_pos_idx
  ON pos_refund_requests(pos_transaction_id, created_at DESC);
