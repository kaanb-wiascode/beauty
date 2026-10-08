CREATE TABLE "operations_service_execution_consumables" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "execution_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "expected_quantity" NUMERIC(14,3) NOT NULL CHECK ("expected_quantity" >= 0),
  "actual_quantity" NUMERIC(14,3) CHECK ("actual_quantity" >= 0),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operations_service_execution_consumables_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_execution_consumables_execution_fkey"
    FOREIGN KEY ("execution_id") REFERENCES "operations_service_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_execution_consumables_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_execution_consumables_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_execution_consumables_product_fkey"
    FOREIGN KEY ("product_id") REFERENCES "inventory_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_execution_consumables_execution_product_key"
    UNIQUE ("execution_id", "product_id")
);

CREATE INDEX "operations_execution_consumables_tenant_branch_idx"
  ON "operations_service_execution_consumables"("tenant_id", "branch_id", "execution_id");

CREATE OR REPLACE FUNCTION operations_snapshot_execution_consumables()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO operations_service_execution_consumables (
    execution_id,
    tenant_id,
    branch_id,
    product_id,
    expected_quantity
  )
  SELECT
    NEW.id,
    NEW.tenant_id,
    NEW.branch_id,
    ism.product_id,
    ism.quantity
  FROM inventory_service_materials ism
  JOIN inventory_products p ON p.id = ism.product_id
  WHERE ism.service_id = NEW.service_id
    AND p.tenant_id = NEW.tenant_id
    AND p.company_id = NEW.company_id
  ON CONFLICT (execution_id, product_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS operations_service_execution_consumable_snapshot
  ON operations_service_executions;
CREATE TRIGGER operations_service_execution_consumable_snapshot
AFTER INSERT ON operations_service_executions
FOR EACH ROW
EXECUTE FUNCTION operations_snapshot_execution_consumables();

-- Backfill execution snapshots created before this migration. Historical inventory
-- movements remain untouched; this only provides expected-consumption context.
INSERT INTO operations_service_execution_consumables (
  execution_id,
  tenant_id,
  branch_id,
  product_id,
  expected_quantity
)
SELECT
  e.id,
  e.tenant_id,
  e.branch_id,
  ism.product_id,
  ism.quantity
FROM operations_service_executions e
JOIN inventory_service_materials ism ON ism.service_id = e.service_id
JOIN inventory_products p ON p.id = ism.product_id
WHERE p.tenant_id = e.tenant_id
  AND p.company_id = e.company_id
ON CONFLICT (execution_id, product_id) DO NOTHING;

CREATE OR REPLACE FUNCTION inventory_consume_for_completed_appointment()
RETURNS TRIGGER AS $$
DECLARE
  material RECORD;
  stock_row RECORD;
  warehouse TEXT;
  target_qty NUMERIC;
  branch_id_value TEXT;
  execution_id_value TEXT;
  use_execution_consumables BOOLEAN := FALSE;
  movement_reference_type TEXT;
  movement_reference_id TEXT;
BEGIN
  IF OLD.status = NEW.status OR NEW.status <> 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  branch_id_value := NEW."branchId";

  SELECT e.id
    INTO execution_id_value
  FROM operations_service_executions e
  WHERE e.appointment_id = NEW.id
    AND e.tenant_id = NEW."tenantId"
    AND e.branch_id = branch_id_value
    AND e.status = 'COMPLETED'::"ServiceExecutionStatus"
  ORDER BY e.completed_at DESC NULLS LAST, e.created_at DESC
  LIMIT 1;

  IF execution_id_value IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM operations_service_execution_consumables c
      WHERE c.execution_id = execution_id_value
        AND c.tenant_id = NEW."tenantId"
        AND c.branch_id = branch_id_value
    ) INTO use_execution_consumables;
  END IF;

  movement_reference_type := CASE
    WHEN use_execution_consumables THEN 'SERVICE_EXECUTION'
    ELSE 'APPOINTMENT'
  END;
  movement_reference_id := CASE
    WHEN use_execution_consumables THEN execution_id_value
    ELSE NEW.id
  END;

  SELECT id
    INTO warehouse
  FROM inventory_warehouses
  WHERE branch_id = branch_id_value
    AND type = 'BRANCH'
    AND status = 'ACTIVE'
  LIMIT 1;

  IF warehouse IS NULL THEN
    RAISE EXCEPTION 'Inventory warehouse not found for branch %', branch_id_value;
  END IF;

  FOR material IN
    SELECT
      c.product_id,
      COALESCE(c.actual_quantity, c.expected_quantity) AS quantity
    FROM operations_service_execution_consumables c
    WHERE use_execution_consumables
      AND c.execution_id = execution_id_value
      AND c.tenant_id = NEW."tenantId"
      AND c.branch_id = branch_id_value
      AND COALESCE(c.actual_quantity, c.expected_quantity) > 0

    UNION ALL

    SELECT
      ism.product_id,
      ism.quantity
    FROM inventory_service_materials ism
    WHERE NOT use_execution_consumables
      AND ism.service_id = NEW."serviceId"
  LOOP
    SELECT *
      INTO stock_row
    FROM inventory_stock
    WHERE product_id = material.product_id
      AND warehouse_id = warehouse
    FOR UPDATE;

    IF stock_row IS NULL THEN
      RAISE EXCEPTION 'No stock record for product %', material.product_id;
    END IF;

    IF stock_row.quantity < material.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product %: required %, available %',
        material.product_id, material.quantity, stock_row.quantity;
    END IF;

    UPDATE inventory_stock
    SET quantity = quantity - material.quantity,
        updated_at = NOW()
    WHERE id = stock_row.id;

    INSERT INTO inventory_movements(
      tenant_id,
      company_id,
      product_id,
      warehouse_id,
      type,
      quantity,
      reference_type,
      reference_id,
      note
    )
    SELECT
      NEW."tenantId",
      b."companyId",
      material.product_id,
      warehouse,
      'SERVICE_CONSUMPTION',
      material.quantity,
      movement_reference_type,
      movement_reference_id,
      CASE
        WHEN use_execution_consumables
          THEN 'Service execution completed: actual/expected consumable posting'
        ELSE 'Hizmet tamamlandı: otomatik stok tüketimi'
      END
    FROM branches b
    WHERE b.id = branch_id_value;

    IF stock_row.quantity - material.quantity <= stock_row.minimum_quantity THEN
      target_qty := GREATEST(
        stock_row.target_quantity - (stock_row.quantity - material.quantity),
        0
      );

      IF NOT EXISTS (
        SELECT 1
        FROM inventory_purchase_requests pr
        WHERE pr.product_id = material.product_id
          AND pr.warehouse_id = warehouse
          AND pr.status IN ('PENDING', 'APPROVED', 'ORDERED')
      ) AND target_qty > 0 THEN
        INSERT INTO inventory_purchase_requests(
          tenant_id,
          company_id,
          warehouse_id,
          product_id,
          current_quantity,
          requested_quantity,
          reason
        )
        SELECT
          NEW."tenantId",
          b."companyId",
          warehouse,
          material.product_id,
          stock_row.quantity - material.quantity,
          target_qty,
          'Minimum stok seviyesinin altına düştü'
        FROM branches b
        WHERE b.id = branch_id_value;

        INSERT INTO inventory_notifications(
          tenant_id,
          company_id,
          branch_id,
          role_target,
          type,
          title,
          message,
          reference_type,
          reference_id
        )
        SELECT
          NEW."tenantId",
          b."companyId",
          branch_id_value,
          targets.role_target,
          'LOW_STOCK',
          'Kritik stok uyarısı',
          'Bir ürün minimum stok seviyesinin altına düştü. Satın alma önerisi oluşturuldu.',
          'PRODUCT',
          material.product_id
        FROM branches b
        CROSS JOIN LATERAL (
          VALUES ('MANAGER'), ('PURCHASING'), ('FINANCE')
        ) AS targets(role_target)
        WHERE b.id = branch_id_value;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
