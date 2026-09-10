-- POS ↔ sale payment linkage hardening and provider financial-event audit.

CREATE UNIQUE INDEX IF NOT EXISTS pos_transactions_sale_payment_uq
  ON pos_transactions(sale_payment_id)
  WHERE sale_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pos_transactions_unlinked_idx
  ON pos_transactions(company_id, branch_id, status, created_at DESC)
  WHERE sale_payment_id IS NULL AND status IN ('AUTHORIZED','CAPTURED');

CREATE TABLE pos_financial_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  pos_transaction_id TEXT NOT NULL REFERENCES pos_transactions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('REFUND','CHARGEBACK')),
  external_event_id TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  fee_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  occurred_at TIMESTAMPTZ NOT NULL,
  accounting_journal_entry_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pos_transaction_id,event_type,external_event_id)
);

CREATE INDEX pos_financial_events_company_date_idx
  ON pos_financial_events(company_id, occurred_at DESC);
