ALTER TABLE inventory_transfers
  ADD COLUMN IF NOT EXISTS approved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatched_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

ALTER TABLE inventory_transfer_items
  ADD COLUMN IF NOT EXISTS dispatched_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS received_quantity NUMERIC(14,3) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS inventory_cycle_counts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
  warehouse_id TEXT NOT NULL REFERENCES inventory_warehouses(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  reason TEXT NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  submitted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  rejected_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  posted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  rejection_reason TEXT,
  total_variance_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_cycle_counts_status_chk CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','POSTED')) NOT VALID
);

CREATE TABLE IF NOT EXISTS inventory_cycle_count_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cycle_count_id TEXT NOT NULL REFERENCES inventory_cycle_counts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  expected_quantity NUMERIC(14,3) NOT NULL,
  counted_quantity NUMERIC(14,3) NOT NULL,
  variance_quantity NUMERIC(14,3) NOT NULL,
  unit_cost_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0,
  variance_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  UNIQUE(cycle_count_id, product_id)
);

CREATE INDEX IF NOT EXISTS inventory_cycle_counts_scope_status_idx
  ON inventory_cycle_counts(tenant_id,company_id,branch_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_cycle_count_items_count_idx
  ON inventory_cycle_count_items(cycle_count_id);
