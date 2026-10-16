ALTER TABLE "inventory_goods_receipts"
  ADD COLUMN "reversed_at" TIMESTAMPTZ,
  ADD COLUMN "reversal_reason" TEXT;

CREATE INDEX "inventory_goods_receipts_reversed_idx"
  ON "inventory_goods_receipts"("company_id", "reversed_at");

CREATE OR REPLACE FUNCTION prevent_goods_receipt_bill_generic_cancellation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.source_type = 'GOODS_RECEIPT'
     AND OLD.status <> 'CANCELLED'
     AND NEW.status = 'CANCELLED'
     AND NOT EXISTS (
       SELECT 1
       FROM inventory_goods_receipts gr
       WHERE gr.id = OLD.source_id
         AND gr.company_id = OLD.company_id
         AND gr.reversed_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'Goods receipt supplier bills must be reversed through the purchase return workflow';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS supplier_bills_goods_receipt_cancel_guard ON supplier_bills;
CREATE TRIGGER supplier_bills_goods_receipt_cancel_guard
BEFORE UPDATE OF status ON supplier_bills
FOR EACH ROW EXECUTE FUNCTION prevent_goods_receipt_bill_generic_cancellation();
