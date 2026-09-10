ALTER TABLE "supplier_bills"
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "cancel_reason" TEXT;

CREATE INDEX "supplier_bills_company_due_status_idx"
  ON "supplier_bills"("company_id", "due_at", "status");
CREATE INDEX "supplier_bills_supplier_created_idx"
  ON "supplier_bills"("supplier_id", "created_at");
