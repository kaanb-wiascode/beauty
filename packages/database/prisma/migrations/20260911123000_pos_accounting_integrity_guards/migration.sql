-- Enforce core POS accounting invariants at the database boundary.
-- Fail loudly if legacy data violates one-settlement-per-transaction; remediation must be explicit.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pos_settlement_items
    GROUP BY pos_transaction_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce POS settlement uniqueness: duplicate pos_transaction_id values exist in pos_settlement_items';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS pos_settlement_items_pos_transaction_uq
  ON pos_settlement_items(pos_transaction_id);

ALTER TABLE pos_settlements
  ADD CONSTRAINT pos_settlements_nonnegative_amounts_ck
    CHECK (gross_amount >= 0 AND fee_amount >= 0 AND net_amount >= 0) NOT VALID,
  ADD CONSTRAINT pos_settlements_balanced_amounts_ck
    CHECK (gross_amount = net_amount + fee_amount) NOT VALID;

ALTER TABLE pos_settlement_items
  ADD CONSTRAINT pos_settlement_items_balanced_amounts_ck
    CHECK (gross_amount = net_amount + fee_amount) NOT VALID;

CREATE OR REPLACE FUNCTION enforce_pos_financial_event_cumulative_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  transaction_amount NUMERIC(18,2);
  prior_reversal_amount NUMERIC(18,2);
BEGIN
  SELECT amount
    INTO transaction_amount
    FROM pos_transactions
   WHERE id = NEW.pos_transaction_id
   FOR UPDATE;

  IF transaction_amount IS NULL THEN
    RAISE EXCEPTION 'POS transaction % does not exist', NEW.pos_transaction_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO prior_reversal_amount
    FROM pos_financial_events
   WHERE pos_transaction_id = NEW.pos_transaction_id
     AND id <> NEW.id;

  IF prior_reversal_amount + NEW.amount > transaction_amount + 0.01 THEN
    RAISE EXCEPTION 'Combined POS refund/chargeback amount exceeds transaction amount';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pos_financial_events_cumulative_limit_trg ON pos_financial_events;
CREATE TRIGGER pos_financial_events_cumulative_limit_trg
BEFORE INSERT OR UPDATE OF amount, pos_transaction_id
ON pos_financial_events
FOR EACH ROW
EXECUTE FUNCTION enforce_pos_financial_event_cumulative_limit();
