ALTER TABLE "inventory_purchase_requests"
  ADD COLUMN "approved_at" TIMESTAMPTZ,
  ADD COLUMN "converted_at" TIMESTAMPTZ,
  ADD COLUMN "converted_purchase_order_id" TEXT;

CREATE UNIQUE INDEX "inventory_purchase_requests_converted_po_key"
  ON "inventory_purchase_requests"("converted_purchase_order_id")
  WHERE "converted_purchase_order_id" IS NOT NULL;

ALTER TABLE "inventory_purchase_requests"
  ADD CONSTRAINT "inventory_purchase_requests_converted_po_fkey"
  FOREIGN KEY ("converted_purchase_order_id") REFERENCES "inventory_purchase_orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
