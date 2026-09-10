CREATE TABLE "financial_health_snapshots" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "snapshot_date" DATE NOT NULL,
  "lookback_days" INTEGER NOT NULL,
  "health_score" DECIMAL(6,2) NOT NULL,
  "health_status" TEXT NOT NULL,
  "component_scores" JSONB NOT NULL,
  "covenant_summary" JSONB NOT NULL,
  "executive_alerts" JSONB NOT NULL,
  "metrics" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "financial_health_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_health_snapshots_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "financial_health_snapshots_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "financial_health_snapshots_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "financial_health_snapshots_score_check" CHECK ("health_score" >= 0 AND "health_score" <= 100),
  CONSTRAINT "financial_health_snapshots_lookback_check" CHECK ("lookback_days" >= 7 AND "lookback_days" <= 730)
);

CREATE UNIQUE INDEX "financial_health_snapshots_scope_date_unique"
  ON "financial_health_snapshots"("company_id", (COALESCE("branch_id", '')), "snapshot_date", "lookback_days");

CREATE INDEX "financial_health_snapshots_company_date_idx"
  ON "financial_health_snapshots"("company_id", "snapshot_date" DESC);
