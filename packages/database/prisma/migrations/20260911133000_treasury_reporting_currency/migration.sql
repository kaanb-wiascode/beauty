ALTER TABLE "treasury_risk_settings"
  ADD COLUMN "reporting_currency" TEXT;

ALTER TABLE "treasury_risk_settings"
  ADD CONSTRAINT "treasury_risk_settings_reporting_currency_check"
  CHECK (
    "reporting_currency" IS NULL
    OR "reporting_currency" ~ '^[A-Z]{3}$'
  );
