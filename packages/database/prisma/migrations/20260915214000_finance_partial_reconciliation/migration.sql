DROP INDEX IF EXISTS "finance_reconciliation_matches_active_bank_tx_key";
DROP INDEX IF EXISTS "finance_reconciliation_matches_active_expense_payment_key";
DROP INDEX IF EXISTS "finance_reconciliation_matches_active_income_collection_key";

CREATE INDEX IF NOT EXISTS "finance_reconciliation_matches_active_bank_tx_idx"
  ON "finance_reconciliation_matches"("bank_transaction_id")
  WHERE "reversed_at" IS NULL;
CREATE INDEX IF NOT EXISTS "finance_reconciliation_matches_active_expense_payment_idx"
  ON "finance_reconciliation_matches"("expense_payment_id")
  WHERE "expense_payment_id" IS NOT NULL AND "reversed_at" IS NULL;
CREATE INDEX IF NOT EXISTS "finance_reconciliation_matches_active_income_collection_idx"
  ON "finance_reconciliation_matches"("income_collection_id")
  WHERE "income_collection_id" IS NOT NULL AND "reversed_at" IS NULL;

CREATE OR REPLACE FUNCTION validate_finance_reconciliation_allocation()
RETURNS trigger AS $$
DECLARE
  bank_amount numeric;
  bank_currency text;
  target_amount numeric;
  target_currency text;
  allocated_bank numeric;
  allocated_target numeric;
BEGIN
  IF NEW.reversed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT amount, currency INTO bank_amount, bank_currency
  FROM bank_transactions
  WHERE id = NEW.bank_transaction_id
    AND tenant_id = NEW.tenant_id
    AND company_id = NEW.company_id
    AND (NEW.branch_id IS NULL OR branch_id = NEW.branch_id)
  FOR UPDATE;

  IF bank_amount IS NULL THEN
    RAISE EXCEPTION 'Scoped bank transaction not found for reconciliation allocation.' USING ERRCODE = '23514';
  END IF;

  IF NEW.expense_payment_id IS NOT NULL THEN
    SELECT ep.amount, e.currency INTO target_amount, target_currency
    FROM expense_payments ep
    JOIN expenses e ON e.id = ep.expense_id
    LEFT JOIN expense_payment_reversals r ON r.expense_payment_id = ep.id
    WHERE ep.id = NEW.expense_payment_id
      AND ep.tenant_id = NEW.tenant_id
      AND ep.company_id = NEW.company_id
      AND (NEW.branch_id IS NULL OR ep.branch_id = NEW.branch_id)
      AND r.id IS NULL
    FOR UPDATE OF ep;

    IF target_amount IS NULL OR bank_amount >= 0 THEN
      RAISE EXCEPTION 'Expense payment reconciliation requires an active payment and negative bank transaction.' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT ic.amount, i.currency INTO target_amount, target_currency
    FROM income_collections ic
    JOIN income_records i ON i.id = ic.income_record_id
    LEFT JOIN income_collection_reversals r ON r.income_collection_id = ic.id
    WHERE ic.id = NEW.income_collection_id
      AND ic.tenant_id = NEW.tenant_id
      AND ic.company_id = NEW.company_id
      AND (NEW.branch_id IS NULL OR ic.branch_id = NEW.branch_id)
      AND r.id IS NULL
    FOR UPDATE OF ic;

    IF target_amount IS NULL OR bank_amount <= 0 THEN
      RAISE EXCEPTION 'Income collection reconciliation requires an active collection and positive bank transaction.' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF bank_currency <> NEW.currency OR target_currency <> NEW.currency THEN
    RAISE EXCEPTION 'Reconciliation allocation currency mismatch.' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO allocated_bank
  FROM finance_reconciliation_matches
  WHERE bank_transaction_id = NEW.bank_transaction_id
    AND reversed_at IS NULL
    AND id <> NEW.id;

  IF allocated_bank + NEW.amount > ABS(bank_amount) + 0.01 THEN
    RAISE EXCEPTION 'Reconciliation allocation exceeds bank transaction amount.' USING ERRCODE = '23514';
  END IF;

  IF NEW.expense_payment_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO allocated_target
    FROM finance_reconciliation_matches
    WHERE expense_payment_id = NEW.expense_payment_id
      AND reversed_at IS NULL
      AND id <> NEW.id;
  ELSE
    SELECT COALESCE(SUM(amount), 0) INTO allocated_target
    FROM finance_reconciliation_matches
    WHERE income_collection_id = NEW.income_collection_id
      AND reversed_at IS NULL
      AND id <> NEW.id;
  END IF;

  IF allocated_target + NEW.amount > target_amount + 0.01 THEN
    RAISE EXCEPTION 'Reconciliation allocation exceeds finance target amount.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_finance_reconciliation_allocation ON finance_reconciliation_matches;
CREATE TRIGGER trg_validate_finance_reconciliation_allocation
BEFORE INSERT OR UPDATE OF bank_transaction_id, expense_payment_id, income_collection_id, amount, currency, reversed_at
ON finance_reconciliation_matches
FOR EACH ROW EXECUTE FUNCTION validate_finance_reconciliation_allocation();
