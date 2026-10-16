-- Scope provider transaction identifiers to the financial integration that owns them.
-- Different POS providers/integrations can legitimately emit the same external transaction id.

ALTER TABLE pos_transactions
  ADD COLUMN integration_id TEXT;

UPDATE pos_transactions p
SET integration_id = t.integration_id
FROM pos_terminals t
WHERE p.terminal_id = t.id
  AND p.integration_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pos_transactions WHERE integration_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot scope POS transaction identity: one or more transactions have no resolvable integration';
  END IF;
END $$;

ALTER TABLE pos_transactions
  ALTER COLUMN integration_id SET NOT NULL,
  ADD CONSTRAINT pos_transactions_integration_fkey
    FOREIGN KEY (integration_id) REFERENCES finance_integrations(id) ON DELETE RESTRICT;

ALTER TABLE pos_transactions
  DROP CONSTRAINT IF EXISTS pos_transactions_company_id_provider_transaction_id_key;

CREATE UNIQUE INDEX pos_transactions_integration_provider_transaction_uq
  ON pos_transactions(integration_id, provider_transaction_id);

CREATE INDEX pos_transactions_integration_status_idx
  ON pos_transactions(integration_id, status, created_at DESC);
