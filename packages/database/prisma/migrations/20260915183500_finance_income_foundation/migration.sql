CREATE TYPE "IncomeCollectionStatus" AS ENUM ('UNCOLLECTED', 'PARTIALLY_COLLECTED', 'COLLECTED', 'CANCELLED');

CREATE TABLE "income_categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT,
    "parent_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "income_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "income_records" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "cost_center_id" TEXT,
    "category_id" TEXT NOT NULL,
    "counterparty_name" TEXT,
    "counterparty_tax_number" TEXT,
    "document_type" TEXT,
    "document_number" TEXT,
    "document_date" TIMESTAMP(3),
    "document_url" TEXT,
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3),
    "gross_amount" DECIMAL(14,2) NOT NULL,
    "net_amount" DECIMAL(14,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'TRY',
    "exchange_rate" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "description" TEXT,
    "approval_status" "FinanceApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "collection_status" "IncomeCollectionStatus" NOT NULL DEFAULT 'UNCOLLECTED',
    "reconciliation_status" "FinanceReconciliationStatus" NOT NULL DEFAULT 'UNRECONCILED',
    "accounting_status" "FinanceAccountingStatus" NOT NULL DEFAULT 'UNPOSTED',
    "source_type" TEXT,
    "source_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "income_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "income_records_positive_amounts" CHECK ("gross_amount" >= 0 AND "net_amount" >= 0 AND "tax_amount" >= 0),
    CONSTRAINT "income_records_positive_exchange_rate" CHECK ("exchange_rate" > 0),
    CONSTRAINT "income_records_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "income_accounting_mappings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "revenue_account_id" TEXT NOT NULL,
    "tax_account_id" TEXT,
    "receivable_account_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "income_accounting_mappings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "income_audit_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "income_record_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "reason" TEXT,
    "before_state" JSONB,
    "after_state" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "income_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "income_categories_tenant_company_code_key" ON "income_categories"("tenant_id", "company_id", "code");
CREATE INDEX "income_categories_tenant_company_active_idx" ON "income_categories"("tenant_id", "company_id", "active");
CREATE INDEX "income_categories_parent_idx" ON "income_categories"("parent_id");
CREATE INDEX "income_records_tenant_company_transaction_date_idx" ON "income_records"("tenant_id", "company_id", "transaction_date");
CREATE INDEX "income_records_tenant_branch_transaction_date_idx" ON "income_records"("tenant_id", "branch_id", "transaction_date");
CREATE INDEX "income_records_tenant_company_approval_idx" ON "income_records"("tenant_id", "company_id", "approval_status");
CREATE INDEX "income_records_tenant_company_collection_idx" ON "income_records"("tenant_id", "company_id", "collection_status");
CREATE INDEX "income_records_tenant_company_accounting_idx" ON "income_records"("tenant_id", "company_id", "accounting_status");
CREATE INDEX "income_records_cost_center_idx" ON "income_records"("cost_center_id");
CREATE INDEX "income_records_category_idx" ON "income_records"("category_id");
CREATE UNIQUE INDEX "income_records_source_idempotency_key" ON "income_records"("tenant_id", "company_id", "source_type", "source_id") WHERE "source_type" IS NOT NULL AND "source_id" IS NOT NULL;
CREATE UNIQUE INDEX "income_accounting_mappings_company_category_key" ON "income_accounting_mappings"("company_id", "category_id");
CREATE INDEX "income_audit_events_income_created_at_idx" ON "income_audit_events"("income_record_id", "created_at");
CREATE INDEX "income_audit_events_tenant_company_idx" ON "income_audit_events"("tenant_id", "company_id", "created_at");

ALTER TABLE "income_categories" ADD CONSTRAINT "income_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "income_categories" ADD CONSTRAINT "income_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "income_categories" ADD CONSTRAINT "income_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "income_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "finance_cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "income_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_accounting_mappings" ADD CONSTRAINT "income_accounting_mappings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "income_accounting_mappings" ADD CONSTRAINT "income_accounting_mappings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "income_accounting_mappings" ADD CONSTRAINT "income_accounting_mappings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "income_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_accounting_mappings" ADD CONSTRAINT "income_accounting_mappings_revenue_account_id_fkey" FOREIGN KEY ("revenue_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_accounting_mappings" ADD CONSTRAINT "income_accounting_mappings_tax_account_id_fkey" FOREIGN KEY ("tax_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_accounting_mappings" ADD CONSTRAINT "income_accounting_mappings_receivable_account_id_fkey" FOREIGN KEY ("receivable_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_audit_events" ADD CONSTRAINT "income_audit_events_income_record_id_fkey" FOREIGN KEY ("income_record_id") REFERENCES "income_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "income_audit_events" ADD CONSTRAINT "income_audit_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "income_audit_events" ADD CONSTRAINT "income_audit_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_audit_events" ADD CONSTRAINT "income_audit_events_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
