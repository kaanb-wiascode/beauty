CREATE TYPE "BudgetTargetType" AS ENUM ('BRANCH','COST_CENTER');
CREATE TYPE "BudgetMetricType" AS ENUM ('REVENUE','EXPENSE');

CREATE TABLE "budgets" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "target_type" "BudgetTargetType" NOT NULL,
  "target_id" TEXT NOT NULL,
  "metric_type" "BudgetMetricType" NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "budgets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "budgets_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "budgets_period_check" CHECK ("period_end" >= "period_start")
);

CREATE UNIQUE INDEX "budgets_target_metric_period_key"
  ON "budgets"("company_id","target_type","target_id","metric_type","period_start","period_end");
CREATE INDEX "budgets_company_period_idx"
  ON "budgets"("company_id","period_start","period_end");
CREATE INDEX "budgets_target_idx"
  ON "budgets"("target_type","target_id");

ALTER TABLE "budgets" ADD CONSTRAINT "budgets_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_company_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION validate_budget_target()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.target_type = 'BRANCH' THEN
    IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.id=NEW.target_id AND b."companyId"=NEW.company_id) THEN
      RAISE EXCEPTION 'Invalid budget branch target';
    END IF;
  ELSIF NEW.target_type = 'COST_CENTER' THEN
    IF NOT EXISTS (SELECT 1 FROM cost_centers cc WHERE cc.id=NEW.target_id AND cc.company_id=NEW.company_id AND cc.active=true) THEN
      RAISE EXCEPTION 'Invalid budget cost center target';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER budgets_validate_target
BEFORE INSERT OR UPDATE ON budgets
FOR EACH ROW EXECUTE FUNCTION validate_budget_target();
