ALTER TABLE "inventory_purchase_requests"
  ADD COLUMN IF NOT EXISTS "supplier_id" TEXT REFERENCES "inventory_suppliers"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "estimated_unit_cost" NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "suggested_delivery_at" TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS "inventory_purchase_requests_supplier_idx" ON "inventory_purchase_requests"("company_id","supplier_id","status");

CREATE OR REPLACE FUNCTION inventory_consume_for_completed_appointment()
RETURNS TRIGGER AS $$
DECLARE material RECORD; stock_row RECORD; warehouse TEXT; target_qty NUMERIC; branch_text TEXT; supplier_row RECORD; delivery_at TIMESTAMPTZ;
BEGIN
  IF OLD.status = NEW.status OR NEW.status <> 'COMPLETED' THEN RETURN NEW; END IF;
  branch_text := NEW.branch_id;
  SELECT id INTO warehouse FROM inventory_warehouses WHERE branch_id = branch_text AND type = 'BRANCH' AND status = 'ACTIVE' LIMIT 1;
  IF warehouse IS NULL THEN RAISE EXCEPTION 'Inventory warehouse not found for branch %', branch_text; END IF;
  FOR material IN SELECT ism.product_id, ism.quantity FROM inventory_service_materials ism WHERE ism.service_id = NEW.service_id LOOP
    SELECT * INTO stock_row FROM inventory_stock WHERE product_id = material.product_id AND warehouse_id = warehouse FOR UPDATE;
    IF stock_row IS NULL THEN RAISE EXCEPTION 'No stock record for product %', material.product_id; END IF;
    IF stock_row.quantity < material.quantity THEN RAISE EXCEPTION 'Insufficient stock for product %: required %, available %', material.product_id, material.quantity, stock_row.quantity; END IF;
    UPDATE inventory_stock SET quantity = quantity - material.quantity, updated_at = NOW() WHERE id = stock_row.id;
    INSERT INTO inventory_movements(tenant_id, company_id, product_id, warehouse_id, type, quantity, reference_type, reference_id, note)
      SELECT NEW.tenant_id, b.company_id, material.product_id, warehouse, 'SERVICE_CONSUMPTION', material.quantity, 'APPOINTMENT', NEW.id, 'Hizmet tamamlandı: otomatik stok tüketimi' FROM branches b WHERE b.id = branch_text;
    IF stock_row.quantity - material.quantity <= stock_row.minimum_quantity THEN
      target_qty := GREATEST(stock_row.target_quantity - (stock_row.quantity - material.quantity), 0);
      SELECT ps.supplier_id, ps.unit_cost, (COALESCE(ps.lead_time_days,0)+COALESCE(ps.preparation_days,0)+COALESCE(ps.shipping_days,0)) AS total_days
      INTO supplier_row FROM inventory_product_suppliers ps WHERE ps.product_id = material.product_id AND ps.is_primary = TRUE ORDER BY ps.updated_at DESC LIMIT 1;
      delivery_at := NOW() + make_interval(days => COALESCE(supplier_row.total_days,0));
      IF target_qty > 0 AND NOT EXISTS (SELECT 1 FROM inventory_purchase_requests pr WHERE pr.product_id = material.product_id AND pr.warehouse_id = warehouse AND pr.status IN ('PENDING','APPROVED','ORDERED')) THEN
        INSERT INTO inventory_purchase_requests(tenant_id, company_id, warehouse_id, product_id, supplier_id, current_quantity, requested_quantity, estimated_unit_cost, suggested_delivery_at, reason)
          SELECT NEW.tenant_id, b.company_id, warehouse, material.product_id, supplier_row.supplier_id, stock_row.quantity - material.quantity, target_qty, COALESCE(supplier_row.unit_cost,0), delivery_at, 'Minimum stok seviyesinin altına düştü' FROM branches b WHERE b.id = branch_text;
        INSERT INTO inventory_notifications(tenant_id, company_id, branch_id, role_target, type, title, message, reference_type, reference_id)
          SELECT NEW.tenant_id, b.company_id, branch_text, r, 'LOW_STOCK', 'Kritik stok uyarısı', 'Bir ürün minimum stok seviyesinin altına düştü. Tedarik süresi dikkate alınarak satın alma önerisi oluşturuldu.', 'PRODUCT', material.product_id FROM branches b CROSS JOIN LATERAL (VALUES ('MANAGER'),('PURCHASING'),('FINANCE')) AS targets(r) WHERE b.id = branch_text;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
