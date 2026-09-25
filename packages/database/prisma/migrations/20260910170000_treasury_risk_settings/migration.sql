CREATE TABLE "treasury_risk_settings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "minimum_liquidity" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "warning_buffer_percent" DECIMAL(5,2) NOT NULL DEFAULT 20,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "treasury_risk_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "treasury_risk_settings_minimum_check" CHECK ("minimum_liquidity" >= 0),
  CONSTRAINT "treasury_risk_settings_buffer_check" CHECK ("warning_buffer_percent" >= 0 AND "warning_buffer_percent" <= 100)
);

CREATE UNIQUE INDEX "treasury_risk_settings_company_branch_key"
  ON "treasury_risk_settings"("company_id", COALESCE("branch_id", ''));

ALTER TABLE "treasury_risk_settings" ADD CONSTRAINT "treasury_risk_settings_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "treasury_risk_settings" ADD CONSTRAINT "treasury_risk_settings_company_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "treasury_risk_settings" ADD CONSTRAINT "treasury_risk_settings_branch_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
