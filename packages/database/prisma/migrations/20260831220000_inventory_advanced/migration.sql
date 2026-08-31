-- Advanced inventory, procurement and fixed-asset management.
-- All IDs intentionally use TEXT to match the existing ERP schema.

ALTER TABLE "inventory_categories"
  ADD COLUMN IF NOT EXISTS "parent_id" TEXT,
  ADD COLUMN IF NOT EXISTS "code" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "default_unit" "InventoryUnit",
  ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS "inventory_categories_parent_idx" ON "inventory_categories"("company_id", "parent_id");
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_categories_code_unique" ON "inventory_categories"("company_id", "code") WHERE "code" IS NOT NULL;
ALTER TABLE "inventory_categories" ADD CONSTRAINT "inventory_categories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "inventory_categories"("id") ON DELETE SET NULL;

ALTER TABLE "inventory_products"
  ADD COLUMN IF NOT EXISTS "barcode" TEXT,
  ADD COLUMN IF NOT EXISTS "manufacturer" TEXT,
  ADD COLUMN IF NOT EXISTS "model" TEXT,
  ADD COLUMN IF NOT EXISTS "origin_country" TEXT,
  ADD COLUMN IF NOT EXISTS "package_quantity" NUMERIC(14,3),
  ADD COLUMN IF NOT EXISTS "tax_rate" NUMERIC(5,2) NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "purchase_price" NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sale_price" NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'TRY',
  ADD COLUMN IF NOT EXISTS "minimum_order_quantity" NUMERIC(14,3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "order_multiple" NUMERIC(14,3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "lead_time_days" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "preparation_days" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "shipping_days" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "returnable" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "image_url" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT;
CREATE INDEX IF NOT EXISTS "inventory_products_barcode_idx" ON "inventory_products"("company_id", "barcode");

CREATE TABLE IF NOT EXISTS "inventory_product_suppliers" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "product_id" TEXT NOT NULL REFERENCES "inventory_products"("id") ON DELETE CASCADE,
  "supplier_id" TEXT NOT NULL REFERENCES "inventory_suppliers"("id") ON DELETE CASCADE,
  "supplier_product_code" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
  "unit_cost" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "minimum_order_quantity" NUMERIC(14,3) NOT NULL DEFAULT 1,
  "order_multiple" NUMERIC(14,3) NOT NULL DEFAULT 1,
  "lead_time_days" INTEGER NOT NULL DEFAULT 0,
  "preparation_days" INTEGER NOT NULL DEFAULT 0,
  "shipping_days" INTEGER NOT NULL DEFAULT 0,
  "last_ordered_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "inventory_product_suppliers_pkey" PRIMARY KEY ("id"),
  UNIQUE ("product_id", "supplier_id")
);
CREATE INDEX IF NOT EXISTS "inventory_product_suppliers_company_idx" ON "inventory_product_suppliers"("company_id", "supplier_id");

CREATE TABLE IF NOT EXISTS "inventory_product_lots" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "product_id" TEXT NOT NULL REFERENCES "inventory_products"("id") ON DELETE CASCADE,
  "warehouse_id" TEXT NOT NULL REFERENCES "inventory_warehouses"("id") ON DELETE RESTRICT,
  "lot_number" TEXT NOT NULL,
  "manufactured_at" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ,
  "quantity" NUMERIC(14,3) NOT NULL DEFAULT 0,
  "unit_cost" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "inventory_product_lots_pkey" PRIMARY KEY ("id"),
  UNIQUE ("product_id", "warehouse_id", "lot_number")
);
CREATE INDEX IF NOT EXISTS "inventory_product_lots_expiry_idx" ON "inventory_product_lots"("company_id", "expires_at");

CREATE TABLE IF NOT EXISTS "inventory_assets" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "category_id" TEXT REFERENCES "inventory_categories"("id") ON DELETE SET NULL,
  "asset_code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "asset_type" TEXT NOT NULL DEFAULT 'EQUIPMENT',
  "brand" TEXT,
  "model" TEXT,
  "serial_number" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "condition" TEXT NOT NULL DEFAULT 'GOOD',
  "branch_id" TEXT REFERENCES "branches"("id") ON DELETE SET NULL,
  "warehouse_id" TEXT REFERENCES "inventory_warehouses"("id") ON DELETE SET NULL,
  "assigned_to_staff_id" TEXT REFERENCES "staff"("id") ON DELETE SET NULL,
  "purchase_date" TIMESTAMPTZ,
  "supplier_id" TEXT REFERENCES "inventory_suppliers"("id") ON DELETE SET NULL,
  "invoice_number" TEXT,
  "purchase_price" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "warranty_start" TIMESTAMPTZ,
  "warranty_end" TIMESTAMPTZ,
  "maintenance_interval_days" INTEGER,
  "next_maintenance_at" TIMESTAMPTZ,
  "image_url" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "inventory_assets_pkey" PRIMARY KEY ("id"),
  UNIQUE ("company_id", "asset_code")
);
CREATE INDEX IF NOT EXISTS "inventory_assets_location_idx" ON "inventory_assets"("company_id", "branch_id", "status");
CREATE INDEX IF NOT EXISTS "inventory_assets_maintenance_idx" ON "inventory_assets"("company_id", "next_maintenance_at");

CREATE TABLE IF NOT EXISTS "inventory_asset_assignments" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "asset_id" TEXT NOT NULL REFERENCES "inventory_assets"("id") ON DELETE CASCADE,
  "staff_id" TEXT REFERENCES "staff"("id") ON DELETE SET NULL,
  "branch_id" TEXT REFERENCES "branches"("id") ON DELETE SET NULL,
  "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "returned_at" TIMESTAMPTZ,
  "note" TEXT,
  CONSTRAINT "inventory_asset_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "inventory_asset_assignments_asset_idx" ON "inventory_asset_assignments"("asset_id", "assigned_at");

CREATE TABLE IF NOT EXISTS "inventory_asset_maintenance" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "asset_id" TEXT NOT NULL REFERENCES "inventory_assets"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL DEFAULT 'PREVENTIVE',
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "scheduled_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "provider" TEXT,
  "cost" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "description" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "inventory_asset_maintenance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "inventory_asset_maintenance_status_idx" ON "inventory_asset_maintenance"("asset_id", "status", "scheduled_at");

CREATE TABLE IF NOT EXISTS "inventory_asset_transfers" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "asset_id" TEXT NOT NULL REFERENCES "inventory_assets"("id") ON DELETE CASCADE,
  "from_branch_id" TEXT REFERENCES "branches"("id") ON DELETE SET NULL,
  "to_branch_id" TEXT REFERENCES "branches"("id") ON DELETE SET NULL,
  "from_warehouse_id" TEXT REFERENCES "inventory_warehouses"("id") ON DELETE SET NULL,
  "to_warehouse_id" TEXT REFERENCES "inventory_warehouses"("id") ON DELETE SET NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "transferred_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "note" TEXT,
  CONSTRAINT "inventory_asset_transfers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "inventory_asset_transfers_asset_idx" ON "inventory_asset_transfers"("asset_id", "transferred_at");

CREATE TABLE IF NOT EXISTS "inventory_asset_documents" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "asset_id" TEXT NOT NULL REFERENCES "inventory_assets"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "file_url" TEXT,
  "document_date" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "inventory_asset_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "inventory_purchase_order_events" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "purchase_order_id" TEXT NOT NULL REFERENCES "inventory_purchase_orders"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "inventory_purchase_order_events_pkey" PRIMARY KEY ("id")
);

INSERT INTO "inventory_categories"("tenant_id","company_id","name","code","default_unit")
SELECT c."tenantId",c.id,x.name,x.code,x.unit::"InventoryUnit"
FROM companies c
CROSS JOIN (VALUES
 ('Cilt Bakımı','SKINCARE','UNIT'),
 ('Kremler','CREAMS','UNIT'),
 ('Serumlar','SERUMS','ML'),
 ('Temizleyiciler','CLEANSERS','ML'),
 ('Saç','HAIR','UNIT'),
 ('Sarf Malzemeleri','CONSUMABLES','UNIT'),
 ('Temizlik','CLEANING','UNIT'),
 ('Kırtasiye','STATIONERY','UNIT'),
 ('Cihazlar ve Ekipman','EQUIPMENT','UNIT')
) AS x(name,code,unit)
ON CONFLICT ("company_id","name") DO NOTHING;
