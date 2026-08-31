CREATE TYPE "InventoryTransferStatus" AS ENUM ('DRAFT','PENDING','APPROVED','IN_TRANSIT','RECEIVED','CANCELLED');

CREATE TABLE "inventory_suppliers" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "contact_name" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "tax_number" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "inventory_suppliers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "inventory_suppliers_company_idx" ON "inventory_suppliers"("company_id","status");

CREATE TABLE "inventory_purchase_orders" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "supplier_id" TEXT REFERENCES "inventory_suppliers"("id") ON DELETE SET NULL,
  "warehouse_id" TEXT NOT NULL REFERENCES "inventory_warehouses"("id") ON DELETE RESTRICT,
  "status" "InventoryPurchaseStatus" NOT NULL DEFAULT 'DRAFT',
  "total_amount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "note" TEXT,
  "ordered_at" TIMESTAMPTZ,
  "received_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "inventory_purchase_orders_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "inventory_purchase_order_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "purchase_order_id" TEXT NOT NULL REFERENCES "inventory_purchase_orders"("id") ON DELETE CASCADE,
  "product_id" TEXT NOT NULL REFERENCES "inventory_products"("id") ON DELETE RESTRICT,
  "quantity" NUMERIC(14,3) NOT NULL CHECK ("quantity" > 0),
  "unit_cost" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "received_quantity" NUMERIC(14,3) NOT NULL DEFAULT 0,
  CONSTRAINT "inventory_purchase_order_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "inventory_purchase_orders_company_idx" ON "inventory_purchase_orders"("company_id","status");

CREATE TABLE "inventory_transfers" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "source_warehouse_id" TEXT NOT NULL REFERENCES "inventory_warehouses"("id") ON DELETE RESTRICT,
  "destination_warehouse_id" TEXT NOT NULL REFERENCES "inventory_warehouses"("id") ON DELETE RESTRICT,
  "status" "InventoryTransferStatus" NOT NULL DEFAULT 'DRAFT',
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "inventory_transfers_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "inventory_transfer_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "transfer_id" TEXT NOT NULL REFERENCES "inventory_transfers"("id") ON DELETE CASCADE,
  "product_id" TEXT NOT NULL REFERENCES "inventory_products"("id") ON DELETE RESTRICT,
  "quantity" NUMERIC(14,3) NOT NULL CHECK ("quantity" > 0),
  CONSTRAINT "inventory_transfer_items_pkey" PRIMARY KEY ("id"),
  UNIQUE ("transfer_id","product_id")
);
CREATE INDEX "inventory_transfers_company_idx" ON "inventory_transfers"("company_id","status","created_at");
