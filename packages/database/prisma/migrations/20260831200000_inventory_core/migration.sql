CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "InventoryWarehouseType" AS ENUM ('MAIN_DEPOT','BRANCH');
CREATE TYPE "InventoryProductStatus" AS ENUM ('ACTIVE','INACTIVE','ARCHIVED');
CREATE TYPE "InventoryUnit" AS ENUM ('UNIT','ML','LITER','GRAM','KG','METER','PAIR','BOX');
CREATE TYPE "InventoryMovementType" AS ENUM ('PURCHASE','SERVICE_CONSUMPTION','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT','DAMAGE','EXPIRED','RETURN');
CREATE TYPE "InventoryPurchaseStatus" AS ENUM ('DRAFT','PENDING','APPROVED','ORDERED','RECEIVED','CANCELLED');

CREATE TABLE "inventory_products" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" UUID NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "category_id" UUID,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "brand" TEXT,
  "description" TEXT,
  "unit" "InventoryUnit" NOT NULL DEFAULT 'UNIT',
  "status" "InventoryProductStatus" NOT NULL DEFAULT 'ACTIVE',
  "track_stock" BOOLEAN NOT NULL DEFAULT TRUE,
  "track_expiry" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "inventory_categories" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" UUID NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("company_id", "name")
);
ALTER TABLE "inventory_products" ADD CONSTRAINT "inventory_products_category_fk" FOREIGN KEY ("category_id") REFERENCES "inventory_categories"("id") ON DELETE SET NULL;

CREATE TABLE "inventory_warehouses" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" UUID NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "branch_id" UUID REFERENCES "branches"("id") ON DELETE RESTRICT,
  "name" TEXT NOT NULL,
  "type" "InventoryWarehouseType" NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "inventory_main_depot_unique" ON "inventory_warehouses"("company_id") WHERE "type" = 'MAIN_DEPOT';
CREATE UNIQUE INDEX "inventory_branch_warehouse_unique" ON "inventory_warehouses"("branch_id") WHERE "type" = 'BRANCH';

CREATE TABLE "inventory_stock" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL REFERENCES "inventory_products"("id") ON DELETE CASCADE,
  "warehouse_id" UUID NOT NULL REFERENCES "inventory_warehouses"("id") ON DELETE CASCADE,
  "quantity" NUMERIC(14,3) NOT NULL DEFAULT 0,
  "minimum_quantity" NUMERIC(14,3) NOT NULL DEFAULT 0,
  "target_quantity" NUMERIC(14,3) NOT NULL DEFAULT 0,
  "cost_per_unit" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("product_id", "warehouse_id")
);

CREATE TABLE "inventory_movements" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" UUID NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "product_id" UUID NOT NULL REFERENCES "inventory_products"("id") ON DELETE RESTRICT,
  "warehouse_id" UUID NOT NULL REFERENCES "inventory_warehouses"("id") ON DELETE RESTRICT,
  "type" "InventoryMovementType" NOT NULL,
  "quantity" NUMERIC(14,3) NOT NULL CHECK ("quantity" > 0),
  "unit_cost" NUMERIC(12,2),
  "reference_type" TEXT,
  "reference_id" UUID,
  "note" TEXT,
  "created_by_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "inventory_service_materials" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "service_id" UUID NOT NULL REFERENCES "services"("id") ON DELETE CASCADE,
  "product_id" UUID NOT NULL REFERENCES "inventory_products"("id") ON DELETE RESTRICT,
  "quantity" NUMERIC(14,3) NOT NULL CHECK ("quantity" > 0),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("service_id", "product_id")
);

CREATE TABLE "inventory_purchase_requests" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" UUID NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "warehouse_id" UUID NOT NULL REFERENCES "inventory_warehouses"("id") ON DELETE RESTRICT,
  "product_id" UUID NOT NULL REFERENCES "inventory_products"("id") ON DELETE RESTRICT,
  "current_quantity" NUMERIC(14,3) NOT NULL,
  "requested_quantity" NUMERIC(14,3) NOT NULL,
  "status" "InventoryPurchaseStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "inventory_notifications" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" UUID NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "branch_id" UUID REFERENCES "branches"("id") ON DELETE SET NULL,
  "role_target" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "reference_type" TEXT,
  "reference_id" UUID,
  "read_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "inventory_products_company_idx" ON "inventory_products"("company_id", "status");
CREATE INDEX "inventory_stock_warehouse_idx" ON "inventory_stock"("warehouse_id");
CREATE INDEX "inventory_movements_company_date_idx" ON "inventory_movements"("company_id", "created_at");
CREATE INDEX "inventory_movements_product_idx" ON "inventory_movements"("product_id", "created_at");
CREATE INDEX "inventory_purchase_status_idx" ON "inventory_purchase_requests"("company_id", "status");
CREATE INDEX "inventory_notifications_target_idx" ON "inventory_notifications"("company_id", "role_target", "read_at");

CREATE OR REPLACE FUNCTION inventory_consume_for_completed_appointment()
RETURNS TRIGGER AS $$
DECLARE
  material RECORD;
  stock_row RECORD;
  warehouse UUID;
  target_qty NUMERIC;
  branch_uuid UUID;
BEGIN
  IF OLD.status = NEW.status OR NEW.status <> 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  branch_uuid := NEW.branch_id;
  SELECT id INTO warehouse FROM inventory_warehouses WHERE branch_id = branch_uuid AND type = 'BRANCH' AND status = 'ACTIVE' LIMIT 1;
  IF warehouse IS NULL THEN
    RAISE EXCEPTION 'Inventory warehouse not found for branch %', branch_uuid;
  END IF;

  FOR material IN SELECT ism.product_id, ism.quantity, s.tenant_id, s.branch_id FROM inventory_service_materials ism JOIN services s ON s.id = ism.service_id WHERE ism.service_id = NEW.service_id LOOP
    SELECT * INTO stock_row FROM inventory_stock WHERE product_id = material.product_id AND warehouse_id = warehouse FOR UPDATE;
    IF stock_row IS NULL THEN
      RAISE EXCEPTION 'No stock record for product %', material.product_id;
    END IF;
    IF stock_row.quantity < material.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product %: required %, available %', material.product_id, material.quantity, stock_row.quantity;
    END IF;

    UPDATE inventory_stock SET quantity = quantity - material.quantity, updated_at = NOW() WHERE id = stock_row.id;
    INSERT INTO inventory_movements(tenant_id, company_id, product_id, warehouse_id, type, quantity, reference_type, reference_id, note)
      SELECT NEW.tenant_id, b.company_id, material.product_id, warehouse, 'SERVICE_CONSUMPTION', material.quantity, 'APPOINTMENT', NEW.id, 'Hizmet tamamlandı: otomatik stok tüketimi'
      FROM branches b WHERE b.id = branch_uuid;

    IF stock_row.quantity - material.quantity <= stock_row.minimum_quantity THEN
      target_qty := GREATEST(stock_row.target_quantity - (stock_row.quantity - material.quantity), 0);
      IF NOT EXISTS (SELECT 1 FROM inventory_purchase_requests pr WHERE pr.product_id = material.product_id AND pr.warehouse_id = warehouse AND pr.status IN ('PENDING','APPROVED','ORDERED')) AND target_qty > 0 THEN
        INSERT INTO inventory_purchase_requests(tenant_id, company_id, warehouse_id, product_id, current_quantity, requested_quantity, reason)
          SELECT NEW.tenant_id, b.company_id, warehouse, material.product_id, stock_row.quantity - material.quantity, target_qty, 'Minimum stok seviyesinin altına düştü'
          FROM branches b WHERE b.id = branch_uuid;
        INSERT INTO inventory_notifications(tenant_id, company_id, branch_id, role_target, type, title, message, reference_type, reference_id)
          SELECT NEW.tenant_id, b.company_id, branch_uuid, r, 'LOW_STOCK', 'Kritik stok uyarısı', 'Bir ürün minimum stok seviyesinin altına düştü. Satın alma önerisi oluşturuldu.', 'PRODUCT', material.product_id
          FROM branches b CROSS JOIN LATERAL (VALUES ('MANAGER'),('PURCHASING'),('FINANCE')) AS targets(r) WHERE b.id = branch_uuid;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_appointment_completed
AFTER UPDATE OF status ON appointments
FOR EACH ROW EXECUTE FUNCTION inventory_consume_for_completed_appointment();
