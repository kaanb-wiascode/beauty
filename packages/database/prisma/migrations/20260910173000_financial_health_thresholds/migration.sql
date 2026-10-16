CREATE TABLE "financial_health_thresholds" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "minimum_health_score" NUMERIC(5,2) NOT NULL DEFAULT 60,
  "minimum_runway_weeks" NUMERIC(8,2) NOT NULL DEFAULT 8,
  "maximum_dso_days" NUMERIC(8,2) NOT NULL DEFAULT 45,
  "minimum_net_working_capital" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "maximum_overdue_receivable_ratio" NUMERIC(5,2) NOT NULL DEFAULT 20,
  "maximum_liquidity_alerts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "financial_health_thresholds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_health_thresholds_score_check" CHECK ("minimum_health_score" >= 0 AND "minimum_health_score" <= 100),
  CONSTRAINT "financial_health_thresholds_runway_check" CHECK ("minimum_runway_weeks" >= 0),
  CONSTRAINT "financial_health_thresholds_dso_check" CHECK ("maximum_dso_days" >= 0),
  CONSTRAINT "financial_health_thresholds_overdue_ratio_check" CHECK ("maximum_overdue_receivable_ratio" >= 0 AND "maximum_overdue_receivable_ratio" <= 100),
  CONSTRAINT "financial_health_thresholds_alerts_check" CHECK ("maximum_liquidity_alerts" >= 0)
);

CREATE UNIQUE INDEX "financial_health_thresholds_scope_key"
ON "financial_health_thresholds"("company_id", (COALESCE("branch_id", '')));

ALTER TABLE "financial_health_thresholds"
  ADD CONSTRAINT "financial_health_thresholds_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "financial_health_thresholds"
  ADD CONSTRAINT "financial_health_thresholds_company_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "financial_health_thresholds"
  ADD CONSTRAINT "financial_health_thresholds_branch_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
