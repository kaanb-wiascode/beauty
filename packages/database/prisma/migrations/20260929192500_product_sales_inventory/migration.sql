ALTER TYPE "SaleItemType" ADD VALUE IF NOT EXISTS 'PRODUCT';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'SALE';

ALTER TABLE "sale_items"
  ADD COLUMN IF NOT EXISTS "productId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_items_productId_fkey'
  ) THEN
    ALTER TABLE "sale_items"
      ADD CONSTRAINT "sale_items_productId_fkey"
      FOREIGN KEY ("productId")
      REFERENCES "inventory_products"("id")
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "sale_items_productId_idx"
  ON "sale_items"("productId");
