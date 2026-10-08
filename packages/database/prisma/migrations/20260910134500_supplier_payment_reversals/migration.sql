ALTER TABLE "supplier_bill_payments"
  DROP CONSTRAINT IF EXISTS "supplier_bill_payments_amount_positive_check";

ALTER TABLE "supplier_bill_payments"
  ADD COLUMN "reversal_of_payment_id" TEXT,
  ADD COLUMN "reversal_reason" TEXT;

ALTER TABLE "supplier_bill_payments"
  ADD CONSTRAINT "supplier_bill_payments_amount_nonzero_check"
  CHECK ("amount" <> 0);

ALTER TABLE "supplier_bill_payments"
  ADD CONSTRAINT "supplier_bill_payments_reversal_of_fkey"
  FOREIGN KEY ("reversal_of_payment_id") REFERENCES "supplier_bill_payments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "supplier_bill_payments_reversal_of_key"
  ON "supplier_bill_payments"("reversal_of_payment_id")
  WHERE "reversal_of_payment_id" IS NOT NULL;

CREATE INDEX "supplier_bill_payments_reversal_lookup_idx"
  ON "supplier_bill_payments"("supplier_bill_id", "reversal_of_payment_id");
