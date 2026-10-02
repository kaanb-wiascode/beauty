CREATE OR REPLACE FUNCTION inventory_consume_for_completed_appointment()
RETURNS TRIGGER AS $$
DECLARE
  material RECORD;
  stock_row RECORD;
  warehouse TEXT;
  target_qty NUMERIC;
  branch_text TEXT;
  supplier_row RECORD;
  delivery_at TIMESTAMPTZ;
  company_text TEXT;
  total_cost NUMERIC(14,2) := 0;
  line_cost NUMERIC(14,2);
  inventory_account_id TEXT;
  service_cost_account_id TEXT;
  journal_id TEXT;
  journal_number TEXT;
BEGIN
  IF OLD.status = NEW.status OR NEW.status <> 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  branch_text := NEW.branch_id;

  SELECT b."companyId"
    INTO company_text
  FROM branches b
  WHERE b.id = branch_text;

  IF company_text IS NULL THEN
    RAISE EXCEPTION 'Company not found for branch %', branch_text;
  END IF;

  SELECT id
    INTO warehouse
  FROM inventory_warehouses
  WHERE branch_id = branch_text
    AND type = 'BRANCH'
    AND status = 'ACTIVE'
  LIMIT 1;

  IF warehouse IS NULL THEN
    RAISE EXCEPTION 'Inventory warehouse not found for branch %', branch_text;
  END IF;

  FOR material IN
    SELECT ism.product_id, ism.quantity
    FROM inventory_service_materials ism
    WHERE ism.service_id = NEW.service_id
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
      RAISE EXCEPTION
        'Insufficient stock for product %: required %, available %',
        material.product_id,
        material.quantity,
        stock_row.quantity;
    END IF;

    line_cost := ROUND((material.quantity * COALESCE(stock_row.cost_per_unit, 0))::numeric, 2);
    total_cost := ROUND((total_cost + line_cost)::numeric, 2);

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
      unit_cost,
      reference_type,
      reference_id,
      note
    )
    VALUES(
      NEW.tenant_id,
      company_text,
      material.product_id,
      warehouse,
      'SERVICE_CONSUMPTION',
      material.quantity,
      COALESCE(stock_row.cost_per_unit, 0),
      'APPOINTMENT',
      NEW.id,
      'Hizmet tamamlandı: otomatik stok tüketimi'
    );

    IF stock_row.quantity - material.quantity <= stock_row.minimum_quantity THEN
      target_qty := GREATEST(
        stock_row.target_quantity - (stock_row.quantity - material.quantity),
        0
      );

      SELECT
        ps.supplier_id,
        ps.unit_cost,
        (
          COALESCE(ps.lead_time_days, 0) +
          COALESCE(ps.preparation_days, 0) +
          COALESCE(ps.shipping_days, 0)
        ) AS total_days
      INTO supplier_row
      FROM inventory_product_suppliers ps
      WHERE ps.product_id = material.product_id
        AND ps.is_primary = TRUE
      ORDER BY ps.updated_at DESC
      LIMIT 1;

      delivery_at := NOW() + make_interval(days => COALESCE(supplier_row.total_days, 0));

      IF target_qty > 0
         AND NOT EXISTS (
           SELECT 1
           FROM inventory_purchase_requests pr
           WHERE pr.product_id = material.product_id
             AND pr.warehouse_id = warehouse
             AND pr.status IN ('PENDING', 'APPROVED', 'ORDERED')
         )
      THEN
        INSERT INTO inventory_purchase_requests(
          tenant_id,
          company_id,
          warehouse_id,
          product_id,
          supplier_id,
          current_quantity,
          requested_quantity,
          estimated_unit_cost,
          suggested_delivery_at,
          reason
        )
        VALUES(
          NEW.tenant_id,
          company_text,
          warehouse,
          material.product_id,
          supplier_row.supplier_id,
          stock_row.quantity - material.quantity,
          target_qty,
          COALESCE(supplier_row.unit_cost, 0),
          delivery_at,
          'Minimum stok seviyesinin altına düştü'
        );

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
          NEW.tenant_id,
          company_text,
          branch_text,
          role_target,
          'LOW_STOCK',
          'Kritik stok uyarısı',
          'Bir ürün minimum stok seviyesinin altına düştü. Tedarik süresi dikkate alınarak satın alma önerisi oluşturuldu.',
          'PRODUCT',
          material.product_id
        FROM (VALUES ('MANAGER'), ('PURCHASING'), ('FINANCE')) AS targets(role_target);
      END IF;
    END IF;
  END LOOP;

  IF total_cost > 0
     AND NOT EXISTS (
       SELECT 1
       FROM journal_entries je
       WHERE je."tenantId" = NEW.tenant_id
         AND je."companyId" = company_text
         AND je."referenceType" = 'SERVICE_CONSUMPTION'
         AND je."referenceId" = NEW.id
     )
  THEN
    INSERT INTO chart_of_accounts(
      id,
      "tenantId",
      "companyId",
      code,
      name,
      type,
      active,
      "createdAt",
      "updatedAt"
    )
    VALUES(
      gen_random_uuid()::text,
      NEW.tenant_id,
      company_text,
      '150',
      'İlk Madde ve Malzeme',
      'ASSET',
      TRUE,
      NOW(),
      NOW()
    )
    ON CONFLICT ("companyId", code)
    DO UPDATE SET active = TRUE, "updatedAt" = NOW()
    RETURNING id INTO inventory_account_id;

    INSERT INTO chart_of_accounts(
      id,
      "tenantId",
      "companyId",
      code,
      name,
      type,
      active,
      "createdAt",
      "updatedAt"
    )
    VALUES(
      gen_random_uuid()::text,
      NEW.tenant_id,
      company_text,
      '740',
      'Hizmet Üretim Maliyeti',
      'EXPENSE',
      TRUE,
      NOW(),
      NOW()
    )
    ON CONFLICT ("companyId", code)
    DO UPDATE SET active = TRUE, "updatedAt" = NOW()
    RETURNING id INTO service_cost_account_id;

    journal_id := gen_random_uuid()::text;
    journal_number :=
      'JE-SVC-' ||
      TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') ||
      '-' ||
      UPPER(SUBSTRING(REPLACE(NEW.id::text, '-', '') FROM 1 FOR 8));

    INSERT INTO journal_entries(
      id,
      "tenantId",
      "companyId",
      "branchId",
      number,
      status,
      "entryDate",
      description,
      "referenceType",
      "referenceId",
      "postedAt",
      "createdAt",
      "updatedAt"
    )
    VALUES(
      journal_id,
      NEW.tenant_id,
      company_text,
      branch_text,
      journal_number,
      'POSTED',
      NOW(),
      'Hizmet sarf malzemesi maliyeti',
      'SERVICE_CONSUMPTION',
      NEW.id,
      NOW(),
      NOW(),
      NOW()
    );

    INSERT INTO journal_entry_lines(
      id,
      "journalEntryId",
      "accountId",
      debit,
      credit,
      memo,
      "createdAt"
    )
    VALUES
      (
        gen_random_uuid()::text,
        journal_id,
        service_cost_account_id,
        total_cost,
        0,
        'Hizmette kullanılan sarf malzemeleri',
        NOW()
      ),
      (
        gen_random_uuid()::text,
        journal_id,
        inventory_account_id,
        0,
        total_cost,
        'Stoktan hizmet sarfı',
        NOW()
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
