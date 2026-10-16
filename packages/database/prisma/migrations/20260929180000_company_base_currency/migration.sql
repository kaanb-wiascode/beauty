ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "baseCurrency" TEXT NOT NULL DEFAULT 'TRY';

ALTER TABLE "companies"
  DROP CONSTRAINT IF EXISTS "companies_base_currency_check";

ALTER TABLE "companies"
  ADD CONSTRAINT "companies_base_currency_check"
  CHECK ("baseCurrency" ~ '^[A-Z]{3}$');
