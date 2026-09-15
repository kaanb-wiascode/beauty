-- Ensure the expense-payment base-currency guard is installed after expense_payments exists.
-- This intentionally repeats the function definition so upgrades remain safe even when older
-- environments applied the original guard migration before expense payments were introduced.

CREATE OR REPLACE FUNCTION enforce_expense_payment_base_currency()
RETURNS TRIGGER AS $$
DECLARE
  record_currency TEXT;
BEGIN
  SELECT "currency"
    INTO record_currency
    FROM "expenses"
   WHERE "id" = NEW."expense_id";

  IF record_currency IS NULL THEN
    RAISE EXCEPTION 'Expense not found for payment.'
      USING ERRCODE = '23503';
  END IF;

  IF record_currency <> 'TRY' THEN
    RAISE EXCEPTION 'Foreign-currency expense payments are not supported until base-currency ledger FX is implemented.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "expense_payments_base_currency_guard" ON "expense_payments";
CREATE TRIGGER "expense_payments_base_currency_guard"
BEFORE INSERT
ON "expense_payments"
FOR EACH ROW
EXECUTE FUNCTION enforce_expense_payment_base_currency();
