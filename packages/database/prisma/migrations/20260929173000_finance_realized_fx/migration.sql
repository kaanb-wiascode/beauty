ALTER TABLE income_collections ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8);
UPDATE income_collections c
SET exchange_rate=i.exchange_rate
FROM income_records i
WHERE i.id=c.income_record_id AND c.exchange_rate IS NULL;
ALTER TABLE income_collections ALTER COLUMN exchange_rate SET DEFAULT 1;
ALTER TABLE income_collections ALTER COLUMN exchange_rate SET NOT NULL;
ALTER TABLE income_collections
  ADD CONSTRAINT income_collections_positive_exchange_rate CHECK (exchange_rate > 0);

ALTER TABLE expense_payments ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8);
UPDATE expense_payments p
SET exchange_rate=e.exchange_rate
FROM expenses e
WHERE e.id=p.expense_id AND p.exchange_rate IS NULL;
ALTER TABLE expense_payments ALTER COLUMN exchange_rate SET DEFAULT 1;
ALTER TABLE expense_payments ALTER COLUMN exchange_rate SET NOT NULL;
ALTER TABLE expense_payments
  ADD CONSTRAINT expense_payments_positive_exchange_rate CHECK (exchange_rate > 0);
