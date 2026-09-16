-- Phase 1 / Finance Transaction Foundation: operational expense core.
-- This migration intentionally keeps Expense distinct from Payment and JournalEntry.

CREATE TYPE "FinanceApprovalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "FinancePaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');
CREATE TYPE "FinanceReconciliationStatus" AS ENUM ('UNRECONCILED', 'PARTIALLY_RECONCILED', 'RECONCILED');
CREATE TYPE "FinanceAccountingStatus" AS ENUM ('UNPOSTED', 'READY_TO_POST', 'POSTED', 'REVERSED');

CREATE TABLE "finance_cost_centers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_cost_centers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expense_categories" (
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
    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expenses" (
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
    "withholding_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'TRY',
    "exchange_rate" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "description" TEXT,
    "approval_status" "FinanceApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "payment_status" "FinancePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "reconciliation_status" "FinanceReconciliationStatus" NOT NULL DEFAULT 'UNRECONCILED',
    "accounting_status" "FinanceAccountingStatus" NOT NULL DEFAULT 'UNPOSTED',
    "source_type" TEXT,
    "source_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expenses_positive_amounts" CHECK ("gross_amount" >= 0 AND "net_amount" >= 0 AND "tax_amount" >= 0 AND "withholding_amount" >= 0),
    CONSTRAINT "expenses_positive_exchange_rate" CHECK ("exchange_rate" > 0),
    CONSTRAINT "expenses_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "expense_accounting_mappings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "expense_account_id" TEXT NOT NULL,
    "tax_account_id" TEXT,
    "payable_account_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "expense_accounting_mappings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expense_audit_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "expense_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "reason" TEXT,
    "before_state" JSONB,
    "after_state" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expense_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_cost_centers_company_code_key" ON "finance_cost_centers"("company_id", "code");
CREATE INDEX "finance_cost_centers_tenant_company_idx" ON "finance_cost_centers"("tenant_id", "company_id", "active");
CREATE UNIQUE INDEX "expense_categories_tenant_company_code_key" ON "expense_categories"("tenant_id", "company_id", "code");
CREATE INDEX "expense_categories_tenant_company_active_idx" ON "expense_categories"("tenant_id", "company_id", "active");
CREATE INDEX "expense_categories_parent_idx" ON "expense_categories"("parent_id");
CREATE INDEX "expenses_tenant_company_transaction_date_idx" ON "expenses"("tenant_id", "company_id", "transaction_date");
CREATE INDEX "expenses_tenant_branch_transaction_date_idx" ON "expenses"("tenant_id", "branch_id", "transaction_date");
CREATE INDEX "expenses_tenant_company_approval_idx" ON "expenses"("tenant_id", "company_id", "approval_status");
CREATE INDEX "expenses_tenant_company_payment_idx" ON "expenses"("tenant_id", "company_id", "payment_status");
CREATE INDEX "expenses_tenant_company_accounting_idx" ON "expenses"("tenant_id", "company_id", "accounting_status");
CREATE INDEX "expenses_cost_center_idx" ON "expenses"("cost_center_id");
CREATE INDEX "expenses_category_idx" ON "expenses"("category_id");
CREATE UNIQUE INDEX "expenses_source_idempotency_key" ON "expenses"("tenant_id", "company_id", "source_type", "source_id") WHERE "source_type" IS NOT NULL AND "source_id" IS NOT NULL;
CREATE UNIQUE INDEX "expense_accounting_mappings_company_category_key" ON "expense_accounting_mappings"("company_id", "category_id");
CREATE INDEX "expense_audit_events_expense_created_at_idx" ON "expense_audit_events"("expense_id", "created_at");
CREATE INDEX "expense_audit_events_tenant_company_idx" ON "expense_audit_events"("tenant_id", "company_id", "created_at");

ALTER TABLE "finance_cost_centers" ADD CONSTRAINT "finance_cost_centers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_cost_centers" ADD CONSTRAINT "finance_cost_centers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "finance_cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_accounting_mappings" ADD CONSTRAINT "expense_accounting_mappings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_accounting_mappings" ADD CONSTRAINT "expense_accounting_mappings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_accounting_mappings" ADD CONSTRAINT "expense_accounting_mappings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_accounting_mappings" ADD CONSTRAINT "expense_accounting_mappings_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_accounting_mappings" ADD CONSTRAINT "expense_accounting_mappings_tax_account_id_fkey" FOREIGN KEY ("tax_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_accounting_mappings" ADD CONSTRAINT "expense_accounting_mappings_payable_account_id_fkey" FOREIGN KEY ("payable_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_audit_events" ADD CONSTRAINT "expense_audit_events_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_audit_events" ADD CONSTRAINT "expense_audit_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_audit_events" ADD CONSTRAINT "expense_audit_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_audit_events" ADD CONSTRAINT "expense_audit_events_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
