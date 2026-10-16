CREATE TABLE "finance_reconciliation_matches" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "bank_transaction_id" TEXT NOT NULL,
  "expense_payment_id" TEXT,
  "income_collection_id" TEXT,
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'TRY',
  "matched_by" TEXT NOT NULL,
  "matched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversed_by" TEXT,
  "reversed_at" TIMESTAMP(3),
  "reversal_reason" TEXT,

  CONSTRAINT "finance_reconciliation_matches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_reconciliation_matches_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "finance_reconciliation_matches_target_check" CHECK (
    (("expense_payment_id" IS NOT NULL)::int + ("income_collection_id" IS NOT NULL)::int) = 1
  ),
  CONSTRAINT "finance_reconciliation_matches_reversal_check" CHECK (
    ("reversed_at" IS NULL AND "reversed_by" IS NULL AND "reversal_reason" IS NULL)
    OR
    ("reversed_at" IS NOT NULL AND "reversed_by" IS NOT NULL AND "reversal_reason" IS NOT NULL)
  )
);

CREATE INDEX "finance_reconciliation_matches_tenant_company_idx"
  ON "finance_reconciliation_matches"("tenant_id", "company_id", "matched_at");
CREATE INDEX "finance_reconciliation_matches_expense_payment_idx"
  ON "finance_reconciliation_matches"("expense_payment_id");
CREATE INDEX "finance_reconciliation_matches_income_collection_idx"
  ON "finance_reconciliation_matches"("income_collection_id");

CREATE UNIQUE INDEX "finance_reconciliation_matches_active_bank_tx_key"
  ON "finance_reconciliation_matches"("bank_transaction_id")
  WHERE "reversed_at" IS NULL;
CREATE UNIQUE INDEX "finance_reconciliation_matches_active_expense_payment_key"
  ON "finance_reconciliation_matches"("expense_payment_id")
  WHERE "expense_payment_id" IS NOT NULL AND "reversed_at" IS NULL;
CREATE UNIQUE INDEX "finance_reconciliation_matches_active_income_collection_key"
  ON "finance_reconciliation_matches"("income_collection_id")
  WHERE "income_collection_id" IS NOT NULL AND "reversed_at" IS NULL;

ALTER TABLE "finance_reconciliation_matches"
  ADD CONSTRAINT "finance_reconciliation_matches_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_reconciliation_matches"
  ADD CONSTRAINT "finance_reconciliation_matches_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_reconciliation_matches"
  ADD CONSTRAINT "finance_reconciliation_matches_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_reconciliation_matches"
  ADD CONSTRAINT "finance_reconciliation_matches_bank_transaction_id_fkey"
  FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_reconciliation_matches"
  ADD CONSTRAINT "finance_reconciliation_matches_expense_payment_id_fkey"
  FOREIGN KEY ("expense_payment_id") REFERENCES "expense_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_reconciliation_matches"
  ADD CONSTRAINT "finance_reconciliation_matches_income_collection_id_fkey"
  FOREIGN KEY ("income_collection_id") REFERENCES "income_collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
