CREATE TABLE IF NOT EXISTS inventory_purchase_replacement_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  purchase_return_id TEXT NOT NULL REFERENCES inventory_purchase_returns(id),
  goods_receipt_id TEXT NOT NULL REFERENCES inventory_goods_receipts(id),
  supplier_bill_id TEXT NOT NULL REFERENCES supplier_bills(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','RECEIVED')),
  reason TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  approved_by_user_id TEXT,
  approved_at TIMESTAMPTZ,
  rejected_by_user_id TEXT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  received_by_user_id TEXT,
  received_at TIMESTAMPTZ,
  replacement_receipt_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_purchase_replacement_items (
  id TEXT PRIMARY KEY,
  replacement_request_id TEXT NOT NULL REFERENCES inventory_purchase_replacement_requests(id) ON DELETE CASCADE,
  purchase_return_item_id TEXT NOT NULL REFERENCES inventory_purchase_return_items(id),
  purchase_order_item_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(18,4) NOT NULL CHECK (unit_cost >= 0),
  received_quantity NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0 AND received_quantity <= quantity),
  UNIQUE(replacement_request_id,purchase_return_item_id)
);

CREATE INDEX IF NOT EXISTS inventory_purchase_replacement_requests_scope_idx
  ON inventory_purchase_replacement_requests(company_id,branch_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_purchase_replacement_requests_return_idx
  ON inventory_purchase_replacement_requests(purchase_return_id);
CREATE INDEX IF NOT EXISTS inventory_purchase_replacement_items_return_item_idx
  ON inventory_purchase_replacement_items(purchase_return_item_id);
