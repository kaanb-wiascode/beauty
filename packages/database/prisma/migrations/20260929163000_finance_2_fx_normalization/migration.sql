-- Finance 2.0: operational records remain in transaction currency while journal lines
-- are posted in base currency using the record exchange rate. The legacy guards that
-- blocked non-TRY posting/collection/payment are therefore no longer required.

DROP TRIGGER IF EXISTS "expenses_base_currency_posting_guard" ON "expenses";
DROP TRIGGER IF EXISTS "income_records_base_currency_posting_guard" ON "income_records";
DROP TRIGGER IF EXISTS "income_collections_base_currency_guard" ON "income_collections";
DROP TRIGGER IF EXISTS "expense_payments_base_currency_guard" ON "expense_payments";

DROP FUNCTION IF EXISTS enforce_expense_base_currency_posting();
DROP FUNCTION IF EXISTS enforce_income_base_currency_posting();
DROP FUNCTION IF EXISTS enforce_income_collection_base_currency();
DROP FUNCTION IF EXISTS enforce_expense_payment_base_currency();
