CREATE TABLE pos_webhook_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  integration_id TEXT NOT NULL REFERENCES finance_integrations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
  payload_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','PROCESSED','IGNORED','FAILED')),
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(integration_id,external_event_id)
);
CREATE INDEX pos_webhook_events_status_idx ON pos_webhook_events(company_id,status,created_at DESC);

CREATE TABLE pos_settlement_items (
  id TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL REFERENCES pos_settlements(id) ON DELETE CASCADE,
  pos_transaction_id TEXT NOT NULL REFERENCES pos_transactions(id) ON DELETE RESTRICT,
  gross_amount NUMERIC(18,2) NOT NULL CHECK (gross_amount >= 0),
  fee_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  net_amount NUMERIC(18,2) NOT NULL CHECK (net_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(settlement_id,pos_transaction_id)
);
CREATE INDEX pos_settlement_items_transaction_idx ON pos_settlement_items(pos_transaction_id);

ALTER TABLE pos_settlements
  ADD COLUMN accounting_journal_entry_id TEXT,
  ADD COLUMN matched_bank_transaction_id TEXT REFERENCES bank_transactions(id) ON DELETE SET NULL;

CREATE INDEX pos_settlements_bank_match_idx
  ON pos_settlements(company_id,reconciliation_status,settled_at DESC);
