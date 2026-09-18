CREATE OR REPLACE FUNCTION profitability_auto_attribute_sale_items()
RETURNS TRIGGER AS $$
DECLARE
  sale_item_row RECORD;
  candidate_count INTEGER;
  candidate_appointment_id TEXT;
  candidate_staff_id TEXT;
  commission_rate NUMERIC(5,2);
BEGIN
  IF NEW.status <> 'CONFIRMED' OR OLD.status = 'CONFIRMED' THEN
    RETURN NEW;
  END IF;

  FOR sale_item_row IN
    SELECT si.id, si."serviceId"
    FROM sale_items si
    WHERE si."saleId" = NEW.id
      AND si.type = 'SERVICE'
      AND si."serviceId" IS NOT NULL
      AND si.quantity = 1
      AND NOT EXISTS (
        SELECT 1 FROM sale_item_attributions sia WHERE sia.sale_item_id = si.id
      )
  LOOP
    SELECT COUNT(*)::int,
           MIN(a.id),
           MIN(a."staffId")
      INTO candidate_count, candidate_appointment_id, candidate_staff_id
    FROM appointments a
    WHERE a."tenantId" = NEW."tenantId"
      AND a."branchId" = NEW."branchId"
      AND a."customerId" = NEW."customerId"
      AND a."serviceId" = sale_item_row."serviceId"
      AND a.status = 'COMPLETED'
      AND a."endAt" <= NEW."confirmedAt"
      AND a."endAt" >= NEW."confirmedAt" - INTERVAL '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM sale_item_attributions existing
        WHERE existing.appointment_id = a.id
      );

    IF candidate_count = 1 THEN
      SELECT COALESCE(rate,0)
        INTO commission_rate
      FROM staff_commission_rates
      WHERE staff_id = candidate_staff_id
        AND tenant_id = NEW."tenantId"
        AND branch_id = NEW."branchId"
      LIMIT 1;

      commission_rate := COALESCE(commission_rate,0);

      INSERT INTO sale_item_attributions(
        sale_item_id,tenant_id,branch_id,appointment_id,staff_id,
        commission_rate_snapshot,created_at,updated_at
      ) VALUES(
        sale_item_row.id,NEW."tenantId",NEW."branchId",candidate_appointment_id,candidate_staff_id,
        commission_rate,NOW(),NOW()
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profitability_auto_attribute_sale_items_trigger ON sales;
CREATE TRIGGER profitability_auto_attribute_sale_items_trigger
AFTER UPDATE OF status ON sales
FOR EACH ROW
WHEN (NEW.status = 'CONFIRMED')
EXECUTE FUNCTION profitability_auto_attribute_sale_items();
