CREATE UNIQUE INDEX pos_settlements_matched_bank_tx_uq
  ON pos_settlements(matched_bank_transaction_id)
  WHERE matched_bank_transaction_id IS NOT NULL;

ALTER TABLE pos_settlements
  ADD COLUMN reconciliation_confidence NUMERIC(5,2),
  ADD COLUMN reconciled_at TIMESTAMPTZ,
  ADD COLUMN reconciliation_note TEXT;

CREATE INDEX bank_transactions_reconciliation_idx
  ON bank_transactions(company_id,reconciliation_status,booked_at DESC);
