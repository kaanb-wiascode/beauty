CREATE TYPE "PurchaseReturnRequestStatus" AS ENUM ('PENDING','APPROVED','REJECTED','EXECUTED');

CREATE TABLE "inventory_purchase_return_requests" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "goods_receipt_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "items" JSONB NOT NULL,
  "status" "PurchaseReturnRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requested_by_user_id" TEXT NOT NULL,
  "approved_by_user_id" TEXT,
  "approved_at" TIMESTAMPTZ,
  "rejected_by_user_id" TEXT,
  "rejected_at" TIMESTAMPTZ,
  "rejection_reason" TEXT,
  "executed_purchase_return_id" TEXT,
  "executed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "inventory_purchase_return_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_purchase_return_requests_items_array" CHECK (jsonb_typeof("items")='array')
);

CREATE INDEX "inventory_purchase_return_requests_company_status_idx"
  ON "inventory_purchase_return_requests"("company_id","status","created_at");
CREATE INDEX "inventory_purchase_return_requests_receipt_idx"
  ON "inventory_purchase_return_requests"("goods_receipt_id","created_at");

ALTER TABLE "inventory_purchase_return_requests" ADD CONSTRAINT "inventory_purchase_return_requests_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_return_requests" ADD CONSTRAINT "inventory_purchase_return_requests_company_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_return_requests" ADD CONSTRAINT "inventory_purchase_return_requests_branch_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_return_requests" ADD CONSTRAINT "inventory_purchase_return_requests_receipt_fkey"
  FOREIGN KEY ("goods_receipt_id") REFERENCES "inventory_goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_return_requests" ADD CONSTRAINT "inventory_purchase_return_requests_requested_user_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_return_requests" ADD CONSTRAINT "inventory_purchase_return_requests_approved_user_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_return_requests" ADD CONSTRAINT "inventory_purchase_return_requests_rejected_user_fkey"
  FOREIGN KEY ("rejected_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_return_requests" ADD CONSTRAINT "inventory_purchase_return_requests_executed_return_fkey"
  FOREIGN KEY ("executed_purchase_return_id") REFERENCES "inventory_purchase_returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
