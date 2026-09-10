-- Payment v2 foundation: additive sale-level payments without breaking legacy appointment payments.

CREATE TABLE "sale_payments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "refundedAt" TIMESTAMP(3),
  "refundReason" TEXT,
  "reference" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sale_payments_tenantId_branchId_paidAt_idx" ON "sale_payments"("tenantId", "branchId", "paidAt");
CREATE INDEX "sale_payments_tenantId_saleId_idx" ON "sale_payments"("tenantId", "saleId");
CREATE INDEX "sale_payments_tenantId_status_idx" ON "sale_payments"("tenantId", "status");
CREATE INDEX "sale_payments_tenantId_method_idx" ON "sale_payments"("tenantId", "method");

ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_amount_positive_check" CHECK ("amount" > 0);
