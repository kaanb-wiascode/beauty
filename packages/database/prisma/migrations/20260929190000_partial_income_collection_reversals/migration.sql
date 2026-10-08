ALTER TABLE income_collection_reversals
  ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2);

UPDATE income_collection_reversals r
SET amount=c.amount
FROM income_collections c
WHERE c.id=r.income_collection_id AND r.amount IS NULL;

ALTER TABLE income_collection_reversals
  ALTER COLUMN amount SET NOT NULL;

ALTER TABLE income_collection_reversals
  ADD CONSTRAINT income_collection_reversals_positive_amount CHECK (amount > 0);

DROP INDEX IF EXISTS income_collection_reversals_collection_key;

CREATE INDEX IF NOT EXISTS income_collection_reversals_collection_idx
  ON income_collection_reversals(income_collection_id,created_at);
