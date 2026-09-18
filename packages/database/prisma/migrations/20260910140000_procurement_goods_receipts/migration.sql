CREATE TABLE "inventory_goods_receipts" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "purchase_order_id" TEXT NOT NULL,
  "supplier_bill_id" TEXT,
  "received_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "inventory_goods_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_goods_receipt_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "goods_receipt_id" TEXT NOT NULL,
  "purchase_order_item_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "quantity" NUMERIC(14,3) NOT NULL,
  "unit_cost" NUMERIC(12,2) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "inventory_goods_receipt_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "supplier_bills"
  ADD COLUMN "source_type" TEXT,
  ADD COLUMN "source_id" TEXT;

CREATE UNIQUE INDEX "supplier_bills_company_source_key"
  ON "supplier_bills"("company_id", "source_type", "source_id")
  WHERE "source_type" IS NOT NULL AND "source_id" IS NOT NULL;
CREATE INDEX "inventory_goods_receipts_po_idx" ON "inventory_goods_receipts"("purchase_order_id", "received_at");
CREATE INDEX "inventory_goods_receipt_items_receipt_idx" ON "inventory_goods_receipt_items"("goods_receipt_id");
CREATE INDEX "inventory_goods_receipt_items_po_item_idx" ON "inventory_goods_receipt_items"("purchase_order_item_id");

ALTER TABLE "inventory_goods_receipts" ADD CONSTRAINT "inventory_goods_receipts_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_goods_receipts" ADD CONSTRAINT "inventory_goods_receipts_company_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_goods_receipts" ADD CONSTRAINT "inventory_goods_receipts_branch_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_goods_receipts" ADD CONSTRAINT "inventory_goods_receipts_po_fkey"
  FOREIGN KEY ("purchase_order_id") REFERENCES "inventory_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_goods_receipts" ADD CONSTRAINT "inventory_goods_receipts_bill_fkey"
  FOREIGN KEY ("supplier_bill_id") REFERENCES "supplier_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inventory_goods_receipt_items" ADD CONSTRAINT "inventory_goods_receipt_items_receipt_fkey"
  FOREIGN KEY ("goods_receipt_id") REFERENCES "inventory_goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_goods_receipt_items" ADD CONSTRAINT "inventory_goods_receipt_items_po_item_fkey"
  FOREIGN KEY ("purchase_order_item_id") REFERENCES "inventory_purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_goods_receipt_items" ADD CONSTRAINT "inventory_goods_receipt_items_product_fkey"
  FOREIGN KEY ("product_id") REFERENCES "inventory_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_goods_receipt_items" ADD CONSTRAINT "inventory_goods_receipt_items_quantity_positive_check"
  CHECK ("quantity" > 0);
ALTER TABLE "inventory_goods_receipt_items" ADD CONSTRAINT "inventory_goods_receipt_items_unit_cost_nonnegative_check"
  CHECK ("unit_cost" >= 0);
