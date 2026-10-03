CREATE TYPE "FinancialObligationStatus" AS ENUM (
  'DRAFT',
  'SCHEDULED',
  'DUE',
  'APPROVAL_PENDING',
  'APPROVED',
  'READY_FOR_PAYMENT',
  'PARTIALLY_PAID',
  'PAID',
  'RECONCILED',
  'POSTED',
  'OVERDUE',
  'REJECTED',
  'CANCELLED'
);

CREATE TYPE "FinancialObligationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');
CREATE TYPE "FinancialRecurrenceFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

CREATE TABLE "financial_obligation_rules" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "name" TEXT NOT NULL,
  "obligation_type" TEXT NOT NULL,
  "counterparty" TEXT,
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'TRY',
  "frequency" "FinancialRecurrenceFrequency" NOT NULL,
  "interval_count" INTEGER NOT NULL DEFAULT 1,
  "day_of_month" INTEGER,
  "start_date" DATE NOT NULL,
  "end_date" DATE,
  "priority" "FinancialObligationPriority" NOT NULL DEFAULT 'NORMAL',
  "cost_center_id" TEXT,
  "category_id" TEXT,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "source_type" TEXT,
  "source_id" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "financial_obligation_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_obligation_rules_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "financial_obligation_rules_interval_check" CHECK ("interval_count" > 0),
  CONSTRAINT "financial_obligation_rules_day_check" CHECK ("day_of_month" IS NULL OR "day_of_month" BETWEEN 1 AND 31),
  CONSTRAINT "financial_obligation_rules_date_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date"),
  CONSTRAINT "financial_obligation_rules_source_pair_check" CHECK (("source_type" IS NULL) = ("source_id" IS NULL))
);

CREATE TABLE "financial_obligations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "rule_id" TEXT,
  "period_key" TEXT,
  "obligation_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "counterparty" TEXT,
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'TRY',
  "due_date" DATE NOT NULL,
  "status" "FinancialObligationStatus" NOT NULL DEFAULT 'DRAFT',
  "priority" "FinancialObligationPriority" NOT NULL DEFAULT 'NORMAL',
  "cost_center_id" TEXT,
  "category_id" TEXT,
  "description" TEXT,
  "source_type" TEXT,
  "source_id" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "financial_obligations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_obligations_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "financial_obligations_source_pair_check" CHECK (("source_type" IS NULL) = ("source_id" IS NULL)),
  CONSTRAINT "financial_obligations_rule_period_check" CHECK (("rule_id" IS NULL AND "period_key" IS NULL) OR ("rule_id" IS NOT NULL AND "period_key" IS NOT NULL))
);

CREATE INDEX "financial_obligation_rules_scope_idx"
  ON "financial_obligation_rules"("tenant_id", "company_id", "branch_id", "is_active");
CREATE INDEX "financial_obligations_scope_due_idx"
  ON "financial_obligations"("tenant_id", "company_id", "branch_id", "due_date", "status");
CREATE INDEX "financial_obligations_rule_idx" ON "financial_obligations"("rule_id");

CREATE UNIQUE INDEX "financial_obligation_rules_source_key"
  ON "financial_obligation_rules"("tenant_id", "company_id", "source_type", "source_id")
  WHERE "source_type" IS NOT NULL AND "source_id" IS NOT NULL;
CREATE UNIQUE INDEX "financial_obligations_source_key"
  ON "financial_obligations"("tenant_id", "company_id", "source_type", "source_id")
  WHERE "source_type" IS NOT NULL AND "source_id" IS NOT NULL;
CREATE UNIQUE INDEX "financial_obligations_rule_period_key"
  ON "financial_obligations"("rule_id", "period_key")
  WHERE "rule_id" IS NOT NULL AND "period_key" IS NOT NULL;

ALTER TABLE "financial_obligation_rules"
  ADD CONSTRAINT "financial_obligation_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_obligation_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_obligation_rules_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_obligation_rules_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "finance_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_obligation_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_obligations"
  ADD CONSTRAINT "financial_obligations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_obligations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_obligations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_obligations_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "financial_obligation_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_obligations_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "finance_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_obligations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
