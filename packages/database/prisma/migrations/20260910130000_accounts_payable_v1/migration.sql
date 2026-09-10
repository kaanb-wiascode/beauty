CREATE TYPE "SupplierBillStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

CREATE TABLE "supplier_bills" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "supplier_id" TEXT NOT NULL,
  "invoice_number" TEXT,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "due_at" TIMESTAMP(3),
  "status" "SupplierBillStatus" NOT NULL DEFAULT 'OPEN',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_bills_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_bill_payments" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "supplier_bill_id" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_bill_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_bills_company_supplier_idx" ON "supplier_bills"("company_id", "supplier_id");
CREATE INDEX "supplier_bills_company_status_due_idx" ON "supplier_bills"("company_id", "status", "due_at");
CREATE INDEX "supplier_bill_payments_bill_idx" ON "supplier_bill_payments"("supplier_bill_id", "paid_at");

ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_company_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_branch_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_supplier_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "inventory_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_bill_payments" ADD CONSTRAINT "supplier_bill_payments_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_bill_payments" ADD CONSTRAINT "supplier_bill_payments_company_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_bill_payments" ADD CONSTRAINT "supplier_bill_payments_branch_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_bill_payments" ADD CONSTRAINT "supplier_bill_payments_bill_fkey"
  FOREIGN KEY ("supplier_bill_id") REFERENCES "supplier_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_amount_positive_check" CHECK ("amount" > 0);
ALTER TABLE "supplier_bill_payments" ADD CONSTRAINT "supplier_bill_payments_amount_positive_check" CHECK ("amount" > 0);
