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

  branch_uuid := NEW."branchId"::uuid;

  SELECT id
    INTO warehouse
  FROM inventory_warehouses
  WHERE branch_id = branch_uuid
    AND type = 'BRANCH'
    AND status = 'ACTIVE'
  LIMIT 1;

  IF warehouse IS NULL THEN
    RAISE EXCEPTION 'Inventory warehouse not found for branch %', branch_uuid;
  END IF;

  FOR material IN
    SELECT ism.product_id, ism.quantity
    FROM inventory_service_materials ism
    WHERE ism.service_id = NEW."serviceId"::uuid
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
      RAISE EXCEPTION 'Insufficient stock for product %: required %, available %', material.product_id, material.quantity, stock_row.quantity;
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
      NEW."tenantId"::uuid,
      b."companyId"::uuid,
      material.product_id,
      warehouse,
      'SERVICE_CONSUMPTION',
      material.quantity,
      'APPOINTMENT',
      NEW.id::uuid,
      'Hizmet tamamlandı: otomatik stok tüketimi'
    FROM branches b
    WHERE b.id = NEW."branchId";

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
          NEW."tenantId"::uuid,
          b."companyId"::uuid,
          warehouse,
          material.product_id,
          stock_row.quantity - material.quantity,
          target_qty,
          'Minimum stok seviyesinin altına düştü'
        FROM branches b
        WHERE b.id = NEW."branchId";

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
          NEW."tenantId"::uuid,
          b."companyId"::uuid,
          branch_uuid,
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
        WHERE b.id = NEW."branchId";
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
