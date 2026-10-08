ALTER TABLE "expense_accounting_mappings"
ADD COLUMN "withholding_account_id" TEXT;

ALTER TABLE "expense_accounting_mappings"
ADD CONSTRAINT "expense_accounting_mappings_withholding_account_id_fkey"
FOREIGN KEY ("withholding_account_id") REFERENCES "chart_of_accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "expense_accounting_mappings_withholding_account_idx"
ON "expense_accounting_mappings"("withholding_account_id");
