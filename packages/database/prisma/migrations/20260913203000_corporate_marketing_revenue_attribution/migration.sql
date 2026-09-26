BEGIN;

CREATE OR REPLACE FUNCTION sync_corporate_marketing_sale_attribution()
RETURNS TRIGGER AS $$
DECLARE
  marketing_row RECORD;
BEGIN
  IF NEW."sale_id" IS NULL OR NEW."lead_id" IS NULL THEN
    RETURN NEW;
  END IF;

  FOR marketing_row IN
    UPDATE corporate_marketing_leads ml
       SET sale_id = NEW."sale_id",
           status = 'WON',
           updated_at = NOW()
     WHERE ml.tenant_id = NEW."tenant_id"
       AND ml.company_id = NEW."company_id"
       AND ml.branch_id = NEW."branch_id"
       AND ml.crm_lead_id = NEW."lead_id"
       AND (ml.sale_id IS NULL OR ml.sale_id = NEW."sale_id")
     RETURNING ml.id, ml.campaign_id, ml.provider
  LOOP
    INSERT INTO corporate_marketing_touchpoints(
      tenant_id,
      company_id,
      marketing_lead_id,
      campaign_id,
      provider,
      touch_type,
      metadata
    ) VALUES (
      NEW."tenant_id",
      NEW."company_id",
      marketing_row.id,
      marketing_row.campaign_id,
      marketing_row.provider,
      'SALE_CREATED',
      jsonb_build_object(
        'opportunityId', NEW."id",
        'saleId', NEW."sale_id"
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "corporate_marketing_sale_attribution" ON "crm_opportunities";
CREATE TRIGGER "corporate_marketing_sale_attribution"
AFTER UPDATE OF "sale_id" ON "crm_opportunities"
FOR EACH ROW
WHEN (NEW."sale_id" IS NOT NULL AND NEW."sale_id" IS DISTINCT FROM OLD."sale_id")
EXECUTE FUNCTION sync_corporate_marketing_sale_attribution();

CREATE OR REPLACE FUNCTION sync_corporate_marketing_payment_attribution()
RETURNS TRIGGER AS $$
DECLARE
  company_id_value TEXT;
  collected_amount NUMERIC(18,2);
  marketing_row RECORD;
  event_name TEXT;
BEGIN
  SELECT b."companyId"
    INTO company_id_value
    FROM "branches" b
   WHERE b."id" = NEW."branchId";

  IF company_id_value IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(p."amount"), 0)::NUMERIC(18,2)
    INTO collected_amount
    FROM "sale_payments" p
   WHERE p."tenantId" = NEW."tenantId"
     AND p."branchId" = NEW."branchId"
     AND p."saleId" = NEW."saleId"
     AND p."status" = 'COMPLETED';

  event_name := CASE
    WHEN NEW."status" = 'REFUNDED' THEN 'PAYMENT_REFUNDED'
    ELSE 'PAYMENT_COMPLETED'
  END;

  FOR marketing_row IN
    UPDATE corporate_marketing_leads ml
       SET revenue_amount = collected_amount,
           updated_at = NOW()
     WHERE ml.tenant_id = NEW."tenantId"
       AND ml.company_id = company_id_value
       AND ml.branch_id = NEW."branchId"
       AND ml.sale_id = NEW."saleId"
     RETURNING ml.id, ml.campaign_id, ml.provider
  LOOP
    INSERT INTO corporate_marketing_touchpoints(
      tenant_id,
      company_id,
      marketing_lead_id,
      campaign_id,
      provider,
      touch_type,
      metadata
    ) VALUES (
      NEW."tenantId",
      company_id_value,
      marketing_row.id,
      marketing_row.campaign_id,
      marketing_row.provider,
      event_name,
      jsonb_build_object(
        'saleId', NEW."saleId",
        'paymentId', NEW."id",
        'paymentStatus', NEW."status",
        'revenueAmount', collected_amount
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "corporate_marketing_payment_attribution" ON "sale_payments";
CREATE TRIGGER "corporate_marketing_payment_attribution"
AFTER INSERT OR UPDATE OF "status", "amount" ON "sale_payments"
FOR EACH ROW
WHEN (NEW."status" IN ('COMPLETED', 'REFUNDED'))
EXECUTE FUNCTION sync_corporate_marketing_payment_attribution();

-- Backfill existing Opportunity -> Sale links created before this migration.
UPDATE corporate_marketing_leads ml
   SET sale_id = o."sale_id",
       status = 'WON',
       updated_at = NOW()
  FROM crm_opportunities o
 WHERE o."sale_id" IS NOT NULL
   AND o."lead_id" IS NOT NULL
   AND ml.tenant_id = o."tenant_id"
   AND ml.company_id = o."company_id"
   AND ml.branch_id = o."branch_id"
   AND ml.crm_lead_id = o."lead_id"
   AND (ml.sale_id IS NULL OR ml.sale_id = o."sale_id");

-- Backfill actual collected revenue from completed sale payments only.
UPDATE corporate_marketing_leads ml
   SET revenue_amount = payment_totals.collected_amount,
       updated_at = NOW()
  FROM (
    SELECT p."tenantId" AS tenant_id,
           p."branchId" AS branch_id,
           p."saleId" AS sale_id,
           COALESCE(SUM(p."amount") FILTER (WHERE p."status" = 'COMPLETED'), 0)::NUMERIC(18,2) AS collected_amount
      FROM "sale_payments" p
     GROUP BY p."tenantId", p."branchId", p."saleId"
  ) payment_totals
 WHERE ml.tenant_id = payment_totals.tenant_id
   AND ml.branch_id = payment_totals.branch_id
   AND ml.sale_id = payment_totals.sale_id;

COMMIT;
