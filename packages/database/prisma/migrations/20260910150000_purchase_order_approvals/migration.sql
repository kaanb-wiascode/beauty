CREATE TABLE "inventory_purchase_order_approvals" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "purchase_order_id" TEXT NOT NULL REFERENCES "inventory_purchase_orders"("id") ON DELETE CASCADE,
  "level" INTEGER NOT NULL,
  "required_role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "approved_by_user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "inventory_purchase_order_approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_purchase_order_approvals_level_positive" CHECK ("level" > 0),
  CONSTRAINT "inventory_purchase_order_approvals_status_check" CHECK ("status" IN ('PENDING','APPROVED','REJECTED')),
  UNIQUE ("purchase_order_id","level")
);

CREATE INDEX "inventory_purchase_order_approvals_po_status_idx"
  ON "inventory_purchase_order_approvals"("purchase_order_id","status","level");

CREATE OR REPLACE FUNCTION enforce_purchase_order_approval_before_ordering()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'ORDERED' AND OLD.status <> 'ORDERED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM inventory_purchase_order_approvals a
      WHERE a.purchase_order_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Purchase order % has no approval workflow', NEW.id;
    END IF;

    IF EXISTS (
      SELECT 1 FROM inventory_purchase_order_approvals a
      WHERE a.purchase_order_id = NEW.id AND a.status <> 'APPROVED'
    ) THEN
      RAISE EXCEPTION 'Purchase order % has pending or rejected approvals', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_purchase_order_require_approval ON inventory_purchase_orders;
CREATE TRIGGER inventory_purchase_order_require_approval
BEFORE UPDATE OF status ON inventory_purchase_orders
FOR EACH ROW
EXECUTE FUNCTION enforce_purchase_order_approval_before_ordering();
