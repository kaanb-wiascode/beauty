CREATE OR REPLACE FUNCTION record_rfq_purchase_order_origin()
RETURNS TRIGGER AS $$
DECLARE
  quote_supplier_org_id TEXT;
  quote_connection_id TEXT;
  quote_version INTEGER;
  quote_currency TEXT;
  quote_snapshot JSONB;
BEGIN
  IF NEW."status" <> 'AWARDED'
     OR NEW."awarded_quote_id" IS NULL
     OR NEW."converted_purchase_order_id" IS NULL
     OR (OLD."status" = 'AWARDED' AND OLD."converted_purchase_order_id" IS NOT DISTINCT FROM NEW."converted_purchase_order_id") THEN
    RETURN NEW;
  END IF;

  SELECT sq."supplier_organization_id", rs."supplier_connection_id", sq."version", sq."currency",
         jsonb_build_object(
           'rfqId', NEW."id",
           'supplierQuoteId', sq."id",
           'quoteStatus', sq."status",
           'quoteVersion', sq."version",
           'validUntil', sq."valid_until",
           'items', COALESCE((
             SELECT jsonb_agg(
               jsonb_build_object(
                 'rfqItemId', ri."id",
                 'inventoryProductId', ri."inventory_product_id",
                 'catalogVariantId', ri."catalog_variant_id",
                 'quantity', ri."quantity",
                 'sourceUnitPrice', sqi."unit_price",
                 'purchaseOrderUnitCost', ROUND(sqi."unit_price", 2),
                 'availableQuantity', sqi."available_quantity",
                 'leadTimeDays', sqi."lead_time_days"
               ) ORDER BY ri."id"
             )
             FROM "supplier_quote_items" sqi
             JOIN "procurement_rfq_items" ri ON ri."id" = sqi."rfq_item_id"
             WHERE sqi."supplier_quote_id" = sq."id"
           ), '[]'::jsonb)
         )
    INTO quote_supplier_org_id, quote_connection_id, quote_version, quote_currency, quote_snapshot
  FROM "supplier_quotes" sq
  JOIN "procurement_rfq_suppliers" rs ON rs."id" = sq."rfq_supplier_id"
  WHERE sq."id" = NEW."awarded_quote_id"
    AND sq."rfq_id" = NEW."id";

  IF quote_supplier_org_id IS NULL OR quote_connection_id IS NULL THEN
    RAISE EXCEPTION 'awarded supplier quote connection not found';
  END IF;

  INSERT INTO "procurement_purchase_order_origins"(
    "tenant_id", "company_id", "purchase_order_id", "source_type",
    "supplier_organization_id", "supplier_connection_id", "supplier_quote_id",
    "source_version", "currency", "idempotency_key", "commercial_snapshot", "created_by_user_id"
  ) VALUES(
    NEW."tenant_id", NEW."company_id", NEW."converted_purchase_order_id", 'SUPPLIER_QUOTE',
    quote_supplier_org_id, quote_connection_id, NEW."awarded_quote_id",
    quote_version, quote_currency,
    'rfq-award:' || NEW."id" || ':' || NEW."awarded_quote_id",
    quote_snapshot, NULL
  )
  ON CONFLICT ("purchase_order_id") DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "procurement_rfqs_purchase_order_origin_bridge"
AFTER UPDATE OF "status", "awarded_quote_id", "converted_purchase_order_id"
ON "procurement_rfqs"
FOR EACH ROW
EXECUTE FUNCTION record_rfq_purchase_order_origin();
