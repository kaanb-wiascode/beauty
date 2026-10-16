ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS discount_allocated NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE sale_items
  ADD CONSTRAINT sale_items_tax_allocation_nonnegative_chk
  CHECK (discount_allocated >= 0 AND taxable_amount >= 0 AND net_amount >= 0 AND vat_amount >= 0) NOT VALID;

CREATE OR REPLACE FUNCTION reconcile_sale_item_tax(p_sale_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  s RECORD;
BEGIN
  SELECT id,subtotal,"discountTotal" AS discount_total,vat_rate,prices_include_vat
  INTO s FROM sales WHERE id=p_sale_id;
  IF NOT FOUND THEN RETURN; END IF;

  WITH base AS (
    SELECT si.id,
           ROUND((si."unitPrice"*si.quantity)::numeric,2) AS line_base,
           ROW_NUMBER() OVER (ORDER BY si.id) AS rn,
           COUNT(*) OVER () AS cnt
    FROM sale_items si WHERE si."saleId"=p_sale_id
  ), provisional AS (
    SELECT id,line_base,rn,cnt,
           CASE
             WHEN COALESCE(s.subtotal,0)<=0 OR COALESCE(s.discount_total,0)<=0 THEN 0::numeric
             ELSE ROUND(s.discount_total*line_base/s.subtotal,2)
           END AS provisional_discount
    FROM base
  ), allocated AS (
    SELECT id,line_base,rn,cnt,
           CASE
             WHEN rn=cnt THEN GREATEST(0,ROUND(s.discount_total-
               COALESCE(SUM(CASE WHEN rn<cnt THEN provisional_discount ELSE 0 END) OVER (),0),2))
             ELSE provisional_discount
           END AS discount_amount
    FROM provisional
  ), calculated AS (
    SELECT id,
           LEAST(line_base,discount_amount) AS discount_amount,
           GREATEST(0,ROUND(line_base-LEAST(line_base,discount_amount),2)) AS taxable
    FROM allocated
  )
  UPDATE sale_items si
  SET discount_allocated=c.discount_amount,
      taxable_amount=c.taxable,
      net_amount=CASE
        WHEN COALESCE(s.vat_rate,0)=0 THEN c.taxable
        WHEN s.prices_include_vat THEN ROUND(c.taxable/(1+s.vat_rate/100),2)
        ELSE c.taxable
      END,
      vat_amount=CASE
        WHEN COALESCE(s.vat_rate,0)=0 THEN 0
        WHEN s.prices_include_vat THEN ROUND(c.taxable-ROUND(c.taxable/(1+s.vat_rate/100),2),2)
        ELSE ROUND(c.taxable*s.vat_rate/100,2)
      END,
      vat_rate=COALESCE(s.vat_rate,0)
  FROM calculated c WHERE si.id=c.id;
END;
$$;

CREATE OR REPLACE FUNCTION reconcile_sale_item_tax_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM reconcile_sale_item_tax(NEW."saleId");
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reconcile_sale_item_tax ON sale_items;
CREATE TRIGGER trg_reconcile_sale_item_tax
AFTER INSERT ON sale_items
FOR EACH ROW EXECUTE FUNCTION reconcile_sale_item_tax_trigger();

-- Backfill line-level tax allocation for existing sales without changing sale totals.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM sales LOOP
    PERFORM reconcile_sale_item_tax(r.id);
  END LOOP;
END;
$$;
