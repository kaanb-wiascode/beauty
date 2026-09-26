CREATE TABLE "installment_plans" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "installmentCount" INTEGER NOT NULL,
  "intervalMonths" INTEGER NOT NULL DEFAULT 1,
  "firstDueAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "installments" (
  "id" TEXT NOT NULL,
  "installmentPlanId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "installment_allocations" (
  "id" TEXT NOT NULL,
  "installmentId" TEXT NOT NULL,
  "salePaymentId" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "installment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "installment_plans_saleId_key" ON "installment_plans"("saleId");
CREATE INDEX "installment_plans_tenantId_branchId_idx" ON "installment_plans"("tenantId", "branchId");
CREATE UNIQUE INDEX "installments_installmentPlanId_sequence_key" ON "installments"("installmentPlanId", "sequence");
CREATE INDEX "installments_dueAt_idx" ON "installments"("dueAt");
CREATE UNIQUE INDEX "installment_allocations_installmentId_salePaymentId_key" ON "installment_allocations"("installmentId", "salePaymentId");
CREATE INDEX "installment_allocations_salePaymentId_idx" ON "installment_allocations"("salePaymentId");

ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "installments" ADD CONSTRAINT "installments_installmentPlanId_fkey"
  FOREIGN KEY ("installmentPlanId") REFERENCES "installment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "installment_allocations" ADD CONSTRAINT "installment_allocations_installmentId_fkey"
  FOREIGN KEY ("installmentId") REFERENCES "installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "installment_allocations" ADD CONSTRAINT "installment_allocations_salePaymentId_fkey"
  FOREIGN KEY ("salePaymentId") REFERENCES "sale_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_installment_count_positive_check" CHECK ("installmentCount" > 0);
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_interval_months_positive_check" CHECK ("intervalMonths" > 0);
ALTER TABLE "installments" ADD CONSTRAINT "installments_sequence_positive_check" CHECK ("sequence" > 0);
ALTER TABLE "installments" ADD CONSTRAINT "installments_amount_positive_check" CHECK ("amount" > 0);
ALTER TABLE "installment_allocations" ADD CONSTRAINT "installment_allocations_amount_positive_check" CHECK ("amount" > 0);
