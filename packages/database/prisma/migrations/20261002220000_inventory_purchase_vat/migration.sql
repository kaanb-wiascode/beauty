ALTER TABLE "inventory_purchase_orders"
  ADD COLUMN IF NOT EXISTS "subtotal_amount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tax_amount" NUMERIC(14,2) NOT NULL DEFAULT 0;

UPDATE "inventory_purchase_orders"
SET "subtotal_amount" = "total_amount"
WHERE "subtotal_amount" = 0 AND "total_amount" <> 0;

ALTER TABLE "inventory_purchase_order_items"
  ADD COLUMN IF NOT EXISTS "tax_rate" NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tax_amount" NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "supplier_bills"
  ADD COLUMN IF NOT EXISTS "net_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE "supplier_bills"
SET "net_amount" = "amount"
WHERE "net_amount" = 0 AND "amount" <> 0;
