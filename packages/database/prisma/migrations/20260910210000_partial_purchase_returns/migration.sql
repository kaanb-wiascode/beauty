CREATE TABLE "inventory_purchase_returns" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "goods_receipt_id" TEXT NOT NULL,
  "supplier_bill_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "total_amount" NUMERIC(12,2) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "inventory_purchase_returns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_purchase_returns_total_positive" CHECK ("total_amount" > 0)
);

CREATE TABLE "inventory_purchase_return_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "purchase_return_id" TEXT NOT NULL,
  "goods_receipt_item_id" TEXT NOT NULL,
  "purchase_order_item_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "quantity" NUMERIC(14,3) NOT NULL,
  "unit_cost" NUMERIC(12,2) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "inventory_purchase_return_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_purchase_return_items_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "inventory_purchase_return_items_cost_nonnegative" CHECK ("unit_cost" >= 0)
);

CREATE TABLE "supplier_credit_notes" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "supplier_id" TEXT NOT NULL,
  "supplier_bill_id" TEXT NOT NULL,
  "purchase_return_id" TEXT NOT NULL,
  "amount" NUMERIC(12,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "supplier_credit_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_credit_notes_amount_positive" CHECK ("amount" > 0)
);

CREATE INDEX "inventory_purchase_returns_receipt_idx"
  ON "inventory_purchase_returns"("goods_receipt_id", "created_at");
CREATE INDEX "inventory_purchase_return_items_receipt_item_idx"
  ON "inventory_purchase_return_items"("goods_receipt_item_id");
CREATE UNIQUE INDEX "supplier_credit_notes_purchase_return_key"
  ON "supplier_credit_notes"("purchase_return_id");
CREATE INDEX "supplier_credit_notes_bill_idx"
  ON "supplier_credit_notes"("supplier_bill_id", "created_at");

ALTER TABLE "inventory_purchase_returns" ADD CONSTRAINT "inventory_purchase_returns_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_returns" ADD CONSTRAINT "inventory_purchase_returns_company_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_returns" ADD CONSTRAINT "inventory_purchase_returns_branch_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_returns" ADD CONSTRAINT "inventory_purchase_returns_receipt_fkey"
  FOREIGN KEY ("goods_receipt_id") REFERENCES "inventory_goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_returns" ADD CONSTRAINT "inventory_purchase_returns_bill_fkey"
  FOREIGN KEY ("supplier_bill_id") REFERENCES "supplier_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_purchase_return_items" ADD CONSTRAINT "inventory_purchase_return_items_return_fkey"
  FOREIGN KEY ("purchase_return_id") REFERENCES "inventory_purchase_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_return_items" ADD CONSTRAINT "inventory_purchase_return_items_receipt_item_fkey"
  FOREIGN KEY ("goods_receipt_item_id") REFERENCES "inventory_goods_receipt_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_return_items" ADD CONSTRAINT "inventory_purchase_return_items_po_item_fkey"
  FOREIGN KEY ("purchase_order_item_id") REFERENCES "inventory_purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_return_items" ADD CONSTRAINT "inventory_purchase_return_items_product_fkey"
  FOREIGN KEY ("product_id") REFERENCES "inventory_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_credit_notes" ADD CONSTRAINT "supplier_credit_notes_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_credit_notes" ADD CONSTRAINT "supplier_credit_notes_company_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_credit_notes" ADD CONSTRAINT "supplier_credit_notes_branch_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_credit_notes" ADD CONSTRAINT "supplier_credit_notes_supplier_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "inventory_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_credit_notes" ADD CONSTRAINT "supplier_credit_notes_bill_fkey"
  FOREIGN KEY ("supplier_bill_id") REFERENCES "supplier_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_credit_notes" ADD CONSTRAINT "supplier_credit_notes_return_fkey"
  FOREIGN KEY ("purchase_return_id") REFERENCES "inventory_purchase_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_full_reversal_after_partial_return()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.reversed_at IS NULL AND NEW.reversed_at IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM inventory_purchase_returns pr
       WHERE pr.goods_receipt_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'Goods receipt with partial returns cannot use full reversal workflow';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_goods_receipts_partial_return_full_reversal_guard
BEFORE UPDATE OF reversed_at ON inventory_goods_receipts
FOR EACH ROW EXECUTE FUNCTION prevent_full_reversal_after_partial_return();
