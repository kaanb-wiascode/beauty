-- The current general ledger stores journal-line amounts without transaction/base-currency metadata.
-- Until ledger FX support is introduced, allowing non-TRY operational records to post would
-- silently write foreign-currency nominal amounts into the TRY ledger. Enforce this invariant
-- at the database boundary so every API/import path is protected consistently.

CREATE OR REPLACE FUNCTION enforce_expense_base_currency_posting()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."currency" <> 'TRY'
     AND NEW."accounting_status" IN ('READY_TO_POST', 'POSTED') THEN
    RAISE EXCEPTION 'Foreign-currency expense accounting is not supported until base-currency ledger FX is implemented.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "expenses_base_currency_posting_guard" ON "expenses";
CREATE TRIGGER "expenses_base_currency_posting_guard"
BEFORE INSERT OR UPDATE OF "currency", "accounting_status"
ON "expenses"
FOR EACH ROW
EXECUTE FUNCTION enforce_expense_base_currency_posting();

CREATE OR REPLACE FUNCTION enforce_income_base_currency_posting()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."currency" <> 'TRY'
     AND NEW."accounting_status" IN ('READY_TO_POST', 'POSTED') THEN
    RAISE EXCEPTION 'Foreign-currency income accounting is not supported until base-currency ledger FX is implemented.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "income_records_base_currency_posting_guard" ON "income_records";
CREATE TRIGGER "income_records_base_currency_posting_guard"
BEFORE INSERT OR UPDATE OF "currency", "accounting_status"
ON "income_records"
FOR EACH ROW
EXECUTE FUNCTION enforce_income_base_currency_posting();

CREATE OR REPLACE FUNCTION enforce_income_collection_base_currency()
RETURNS TRIGGER AS $$
DECLARE
  record_currency TEXT;
BEGIN
  SELECT "currency"
    INTO record_currency
    FROM "income_records"
   WHERE "id" = NEW."income_record_id";

  IF record_currency IS NULL THEN
    RAISE EXCEPTION 'Income record not found for collection.'
      USING ERRCODE = '23503';
  END IF;

  IF record_currency <> 'TRY' THEN
    RAISE EXCEPTION 'Foreign-currency income collections are not supported until base-currency ledger FX is implemented.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "income_collections_base_currency_guard" ON "income_collections";
CREATE TRIGGER "income_collections_base_currency_guard"
BEFORE INSERT
ON "income_collections"
FOR EACH ROW
EXECUTE FUNCTION enforce_income_collection_base_currency();

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

-- expense_payments is introduced by a later migration. Keep clean database installs valid
-- while still installing the guard immediately on environments where the table already exists.
DO $guard$
BEGIN
  IF to_regclass('public.expense_payments') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS "expense_payments_base_currency_guard" ON "expense_payments"';
    EXECUTE 'CREATE TRIGGER "expense_payments_base_currency_guard" BEFORE INSERT ON "expense_payments" FOR EACH ROW EXECUTE FUNCTION enforce_expense_payment_base_currency()';
  END IF;
END;
$guard$;

-- Reversal tables are intentionally not blocked. Historical non-TRY postings/collections/payments
-- must remain reversible so incorrect legacy ledger entries can be unwound safely.
