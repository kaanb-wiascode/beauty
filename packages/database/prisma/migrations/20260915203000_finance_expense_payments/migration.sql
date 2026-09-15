-- Operational expense settlement. Payments and reversals are immutable financial events.

CREATE TABLE "expense_payments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "expense_id" TEXT NOT NULL,
    "payable_account_id" TEXT NOT NULL,
    "payment_account_id" TEXT NOT NULL,
    "journal_entry_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "source_type" TEXT,
    "source_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expense_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_payments_positive_amount" CHECK ("amount" > 0),
    CONSTRAINT "expense_payments_method" CHECK ("method" IN ('CASH','CARD','TRANSFER','OTHER')),
    CONSTRAINT "expense_payments_source_pair" CHECK (("source_type" IS NULL) = ("source_id" IS NULL))
);

CREATE TABLE "expense_payment_reversals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "expense_payment_id" TEXT NOT NULL,
    "journal_entry_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source_type" TEXT,
    "source_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expense_payment_reversals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_payment_reversals_reason" CHECK (length(btrim("reason")) > 0),
    CONSTRAINT "expense_payment_reversals_source_pair" CHECK (("source_type" IS NULL) = ("source_id" IS NULL))
);

CREATE INDEX "expense_payments_expense_created_at_idx"
    ON "expense_payments"("expense_id", "created_at");
CREATE INDEX "expense_payments_tenant_company_paid_at_idx"
    ON "expense_payments"("tenant_id", "company_id", "paid_at");
CREATE UNIQUE INDEX "expense_payments_journal_entry_key"
    ON "expense_payments"("journal_entry_id");
CREATE UNIQUE INDEX "expense_payments_source_idempotency_key"
    ON "expense_payments"("tenant_id", "company_id", "source_type", "source_id")
    WHERE "source_type" IS NOT NULL AND "source_id" IS NOT NULL;

CREATE UNIQUE INDEX "expense_payment_reversals_payment_key"
    ON "expense_payment_reversals"("expense_payment_id");
CREATE UNIQUE INDEX "expense_payment_reversals_journal_entry_key"
    ON "expense_payment_reversals"("journal_entry_id");
CREATE INDEX "expense_payment_reversals_tenant_company_created_at_idx"
    ON "expense_payment_reversals"("tenant_id", "company_id", "created_at");
CREATE UNIQUE INDEX "expense_payment_reversals_source_idempotency_key"
    ON "expense_payment_reversals"("tenant_id", "company_id", "source_type", "source_id")
    WHERE "source_type" IS NOT NULL AND "source_id" IS NOT NULL;

ALTER TABLE "expense_payments"
    ADD CONSTRAINT "expense_payments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_payments"
    ADD CONSTRAINT "expense_payments_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_payments"
    ADD CONSTRAINT "expense_payments_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_payments"
    ADD CONSTRAINT "expense_payments_expense_id_fkey"
    FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_payments"
    ADD CONSTRAINT "expense_payments_payable_account_id_fkey"
    FOREIGN KEY ("payable_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_payments"
    ADD CONSTRAINT "expense_payments_payment_account_id_fkey"
    FOREIGN KEY ("payment_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_payments"
    ADD CONSTRAINT "expense_payments_journal_entry_id_fkey"
    FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expense_payment_reversals"
    ADD CONSTRAINT "expense_payment_reversals_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_payment_reversals"
    ADD CONSTRAINT "expense_payment_reversals_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_payment_reversals"
    ADD CONSTRAINT "expense_payment_reversals_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_payment_reversals"
    ADD CONSTRAINT "expense_payment_reversals_expense_payment_id_fkey"
    FOREIGN KEY ("expense_payment_id") REFERENCES "expense_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_payment_reversals"
    ADD CONSTRAINT "expense_payment_reversals_journal_entry_id_fkey"
    FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
