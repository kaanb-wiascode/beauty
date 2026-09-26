CREATE OR REPLACE FUNCTION prevent_goods_receipt_bill_generic_cancellation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.source_type = 'GOODS_RECEIPT'
     AND OLD.status <> 'CANCELLED'
     AND NEW.status = 'CANCELLED' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'GOODS_RECEIPT supplier bills must be reversed through purchase return workflow';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER supplier_bills_goods_receipt_cancel_guard
BEFORE UPDATE OF status ON supplier_bills
FOR EACH ROW
EXECUTE FUNCTION prevent_goods_receipt_bill_generic_cancellation();
