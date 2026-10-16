ALTER TABLE inventory_transfers
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_value NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE inventory_transfer_items
  ADD COLUMN IF NOT EXISTS unit_cost_snapshot NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS line_value NUMERIC(14,2);

CREATE TABLE IF NOT EXISTS inventory_stock_adjustments (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
  warehouse_id TEXT NOT NULL REFERENCES inventory_warehouses(id) ON DELETE RESTRICT,
  type TEXT NOT NULL,
  reason TEXT NOT NULL,
  total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'POSTED',
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_stock_adjustments_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_stock_adjustments_type_chk CHECK (type IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT','DAMAGE','EXPIRED')) NOT VALID,
  CONSTRAINT inventory_stock_adjustments_total_chk CHECK (total_value >= 0) NOT VALID
);

CREATE TABLE IF NOT EXISTS inventory_stock_adjustment_items (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  adjustment_id TEXT NOT NULL REFERENCES inventory_stock_adjustments(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,3) NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL,
  line_value NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_stock_adjustment_items_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_stock_adjustment_items_qty_chk CHECK (quantity > 0) NOT VALID,
  CONSTRAINT inventory_stock_adjustment_items_cost_chk CHECK (unit_cost >= 0 AND line_value >= 0) NOT VALID,
  CONSTRAINT inventory_stock_adjustment_items_unique UNIQUE (adjustment_id, product_id)
);

CREATE INDEX IF NOT EXISTS inventory_adjustments_company_date_idx
  ON inventory_stock_adjustments(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_adjustments_warehouse_date_idx
  ON inventory_stock_adjustments(warehouse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_transfer_received_idx
  ON inventory_transfers(company_id, received_at DESC)
  WHERE status='RECEIVED';
