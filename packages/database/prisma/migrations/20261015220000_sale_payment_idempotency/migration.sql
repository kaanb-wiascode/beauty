ALTER TABLE "sale_payments" ADD COLUMN "idempotencyKey" VARCHAR(100);

CREATE UNIQUE INDEX "sale_payments_tenantId_branchId_saleId_idempotencyKey_key"
ON "sale_payments"("tenantId", "branchId", "saleId", "idempotencyKey");
