CREATE TABLE "procurement_purchase_order_origins" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "purchase_order_id" TEXT NOT NULL REFERENCES "inventory_purchase_orders"("id") ON DELETE CASCADE,
  "source_type" TEXT NOT NULL,
  "supplier_organization_id" TEXT NOT NULL REFERENCES "supplier_organizations"("id") ON DELETE RESTRICT,
  "supplier_connection_id" TEXT NOT NULL REFERENCES "supplier_connections"("id") ON DELETE RESTRICT,
  "supplier_offer_id" TEXT REFERENCES "supplier_offers"("id") ON DELETE RESTRICT,
  "supplier_quote_id" TEXT REFERENCES "supplier_quotes"("id") ON DELETE RESTRICT,
  "source_version" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "commercial_snapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_by_user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "procurement_purchase_order_origins_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_purchase_order_origins_purchase_order_key" UNIQUE ("purchase_order_id"),
  CONSTRAINT "procurement_purchase_order_origins_idempotency_key" UNIQUE ("tenant_id", "company_id", "idempotency_key"),
  CONSTRAINT "procurement_purchase_order_origins_source_type_check" CHECK ("source_type" IN ('SUPPLIER_OFFER','SUPPLIER_QUOTE')),
  CONSTRAINT "procurement_purchase_order_origins_source_version_check" CHECK ("source_version" > 0),
  CONSTRAINT "procurement_purchase_order_origins_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "procurement_purchase_order_origins_source_ref_check" CHECK (
    ("source_type"='SUPPLIER_OFFER' AND "supplier_offer_id" IS NOT NULL AND "supplier_quote_id" IS NULL)
    OR
    ("source_type"='SUPPLIER_QUOTE' AND "supplier_quote_id" IS NOT NULL AND "supplier_offer_id" IS NULL)
  )
);

CREATE INDEX "procurement_purchase_order_origins_source_idx"
  ON "procurement_purchase_order_origins"("source_type", "supplier_organization_id", "created_at" DESC);

CREATE INDEX "procurement_purchase_order_origins_connection_idx"
  ON "procurement_purchase_order_origins"("tenant_id", "company_id", "supplier_connection_id", "created_at" DESC);

CREATE OR REPLACE FUNCTION validate_procurement_purchase_order_origin_scope()
RETURNS TRIGGER AS $$
DECLARE
  po_tenant_id TEXT;
  po_company_id TEXT;
  po_supplier_id TEXT;
  connection_tenant_id TEXT;
  connection_company_id TEXT;
  connection_supplier_org_id TEXT;
  connection_inventory_supplier_id TEXT;
  source_supplier_org_id TEXT;
BEGIN
  SELECT "tenant_id", "company_id", "supplier_id"
    INTO po_tenant_id, po_company_id, po_supplier_id
  FROM "inventory_purchase_orders"
  WHERE "id" = NEW."purchase_order_id";

  IF po_tenant_id IS NULL THEN
    RAISE EXCEPTION 'purchase order not found';
  END IF;

  IF po_tenant_id <> NEW."tenant_id" OR po_company_id <> NEW."company_id" THEN
    RAISE EXCEPTION 'purchase order origin scope does not match purchase order';
  END IF;

  SELECT "tenant_id", "company_id", "supplier_organization_id", "inventory_supplier_id"
    INTO connection_tenant_id, connection_company_id, connection_supplier_org_id, connection_inventory_supplier_id
  FROM "supplier_connections"
  WHERE "id" = NEW."supplier_connection_id";

  IF connection_tenant_id IS NULL THEN
    RAISE EXCEPTION 'supplier connection not found';
  END IF;

  IF connection_tenant_id <> NEW."tenant_id"
     OR connection_company_id <> NEW."company_id"
     OR connection_supplier_org_id <> NEW."supplier_organization_id"
     OR connection_inventory_supplier_id IS DISTINCT FROM po_supplier_id THEN
    RAISE EXCEPTION 'purchase order origin supplier connection scope mismatch';
  END IF;

  IF NEW."source_type" = 'SUPPLIER_OFFER' THEN
    SELECT "supplier_organization_id" INTO source_supplier_org_id
    FROM "supplier_offers"
    WHERE "id" = NEW."supplier_offer_id";
  ELSE
    SELECT "supplier_organization_id" INTO source_supplier_org_id
    FROM "supplier_quotes"
    WHERE "id" = NEW."supplier_quote_id";
  END IF;

  IF source_supplier_org_id IS NULL OR source_supplier_org_id <> NEW."supplier_organization_id" THEN
    RAISE EXCEPTION 'purchase order origin source supplier mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "procurement_purchase_order_origins_scope_guard"
BEFORE INSERT OR UPDATE OF
  "tenant_id", "company_id", "purchase_order_id", "supplier_organization_id",
  "supplier_connection_id", "supplier_offer_id", "supplier_quote_id", "source_type"
ON "procurement_purchase_order_origins"
FOR EACH ROW
EXECUTE FUNCTION validate_procurement_purchase_order_origin_scope();
