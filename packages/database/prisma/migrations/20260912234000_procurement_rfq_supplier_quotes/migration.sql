CREATE TABLE "procurement_rfqs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "warehouse_id" TEXT NOT NULL REFERENCES "inventory_warehouses"("id") ON DELETE RESTRICT,
  "title" TEXT NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "response_deadline" TIMESTAMPTZ,
  "created_by_user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "published_at" TIMESTAMPTZ,
  "closed_at" TIMESTAMPTZ,
  "awarded_quote_id" TEXT,
  "converted_purchase_order_id" TEXT REFERENCES "inventory_purchase_orders"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "procurement_rfqs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_rfqs_status_check" CHECK ("status" IN ('DRAFT','PUBLISHED','CLOSED','AWARDED','CANCELLED'))
);
CREATE INDEX "procurement_rfqs_scope_idx"
  ON "procurement_rfqs"("tenant_id","company_id","status","created_at" DESC);
CREATE INDEX "procurement_rfqs_warehouse_idx"
  ON "procurement_rfqs"("warehouse_id","status");

CREATE TABLE "procurement_rfq_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "rfq_id" TEXT NOT NULL REFERENCES "procurement_rfqs"("id") ON DELETE CASCADE,
  "inventory_product_id" TEXT NOT NULL REFERENCES "inventory_products"("id") ON DELETE RESTRICT,
  "catalog_variant_id" TEXT NOT NULL REFERENCES "catalog_variants"("id") ON DELETE RESTRICT,
  "quantity" NUMERIC(14,3) NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "procurement_rfq_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_rfq_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "procurement_rfq_items_product_key" UNIQUE ("rfq_id","inventory_product_id")
);
CREATE INDEX "procurement_rfq_items_variant_idx"
  ON "procurement_rfq_items"("catalog_variant_id");

CREATE TABLE "procurement_rfq_suppliers" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "rfq_id" TEXT NOT NULL REFERENCES "procurement_rfqs"("id") ON DELETE CASCADE,
  "supplier_connection_id" TEXT NOT NULL REFERENCES "supplier_connections"("id") ON DELETE RESTRICT,
  "supplier_organization_id" TEXT NOT NULL REFERENCES "supplier_organizations"("id") ON DELETE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'INVITED',
  "invited_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "responded_at" TIMESTAMPTZ,
  CONSTRAINT "procurement_rfq_suppliers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_rfq_suppliers_status_check" CHECK ("status" IN ('INVITED','RESPONDED','DECLINED')),
  CONSTRAINT "procurement_rfq_suppliers_connection_key" UNIQUE ("rfq_id","supplier_connection_id")
);
CREATE INDEX "procurement_rfq_suppliers_org_idx"
  ON "procurement_rfq_suppliers"("supplier_organization_id","status");

CREATE TABLE "supplier_quotes" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "rfq_id" TEXT NOT NULL REFERENCES "procurement_rfqs"("id") ON DELETE CASCADE,
  "rfq_supplier_id" TEXT NOT NULL REFERENCES "procurement_rfq_suppliers"("id") ON DELETE CASCADE,
  "supplier_organization_id" TEXT NOT NULL REFERENCES "supplier_organizations"("id") ON DELETE RESTRICT,
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "note" TEXT,
  "valid_until" TIMESTAMPTZ,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_supplier_membership_id" TEXT REFERENCES "supplier_memberships"("id") ON DELETE SET NULL,
  "updated_by_supplier_membership_id" TEXT REFERENCES "supplier_memberships"("id") ON DELETE SET NULL,
  "submitted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "supplier_quotes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_quotes_rfq_supplier_key" UNIQUE ("rfq_supplier_id"),
  CONSTRAINT "supplier_quotes_status_check" CHECK ("status" IN ('DRAFT','SUBMITTED','WITHDRAWN','ACCEPTED','REJECTED')),
  CONSTRAINT "supplier_quotes_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "supplier_quotes_version_check" CHECK ("version" > 0)
);
CREATE INDEX "supplier_quotes_rfq_status_idx"
  ON "supplier_quotes"("rfq_id","status");
CREATE INDEX "supplier_quotes_org_status_idx"
  ON "supplier_quotes"("supplier_organization_id","status");

CREATE TABLE "supplier_quote_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "supplier_quote_id" TEXT NOT NULL REFERENCES "supplier_quotes"("id") ON DELETE CASCADE,
  "rfq_item_id" TEXT NOT NULL REFERENCES "procurement_rfq_items"("id") ON DELETE RESTRICT,
  "unit_price" NUMERIC(14,4) NOT NULL,
  "available_quantity" NUMERIC(14,3),
  "lead_time_days" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  CONSTRAINT "supplier_quote_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_quote_items_price_check" CHECK ("unit_price" >= 0),
  CONSTRAINT "supplier_quote_items_available_check" CHECK ("available_quantity" IS NULL OR "available_quantity" >= 0),
  CONSTRAINT "supplier_quote_items_lead_check" CHECK ("lead_time_days" >= 0),
  CONSTRAINT "supplier_quote_items_rfq_item_key" UNIQUE ("supplier_quote_id","rfq_item_id")
);
CREATE INDEX "supplier_quote_items_rfq_item_idx"
  ON "supplier_quote_items"("rfq_item_id");

ALTER TABLE "procurement_rfqs"
  ADD CONSTRAINT "procurement_rfqs_awarded_quote_fk"
  FOREIGN KEY ("awarded_quote_id") REFERENCES "supplier_quotes"("id") ON DELETE SET NULL;

CREATE TABLE "procurement_rfq_events" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "rfq_id" TEXT NOT NULL REFERENCES "procurement_rfqs"("id") ON DELETE CASCADE,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "actor_user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "event_type" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "procurement_rfq_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_rfq_events_type_check" CHECK ("event_type" IN ('CREATED','PUBLISHED','CLOSED','CANCELLED','AWARDED','PURCHASE_ORDER_CREATED'))
);
CREATE INDEX "procurement_rfq_events_rfq_idx"
  ON "procurement_rfq_events"("rfq_id","created_at" DESC);

CREATE TABLE "supplier_quote_events" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "supplier_quote_id" TEXT NOT NULL REFERENCES "supplier_quotes"("id") ON DELETE CASCADE,
  "supplier_organization_id" TEXT NOT NULL REFERENCES "supplier_organizations"("id") ON DELETE CASCADE,
  "actor_supplier_membership_id" TEXT REFERENCES "supplier_memberships"("id") ON DELETE SET NULL,
  "event_type" TEXT NOT NULL,
  "from_status" TEXT,
  "to_status" TEXT,
  "from_version" INTEGER,
  "to_version" INTEGER NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "supplier_quote_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_quote_events_type_check" CHECK ("event_type" IN ('CREATED','UPDATED','SUBMITTED','WITHDRAWN','ACCEPTED','REJECTED')),
  CONSTRAINT "supplier_quote_events_version_check" CHECK ("to_version" > 0)
);
CREATE INDEX "supplier_quote_events_quote_idx"
  ON "supplier_quote_events"("supplier_quote_id","created_at" DESC);

CREATE OR REPLACE FUNCTION validate_procurement_rfq_scope()
RETURNS TRIGGER AS $$
DECLARE
  warehouse_tenant TEXT;
  warehouse_company TEXT;
BEGIN
  SELECT tenant_id, company_id INTO warehouse_tenant, warehouse_company
  FROM inventory_warehouses WHERE id=NEW.warehouse_id;
  IF warehouse_tenant IS NULL OR warehouse_tenant <> NEW.tenant_id OR warehouse_company <> NEW.company_id THEN
    RAISE EXCEPTION 'RFQ warehouse scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "procurement_rfqs_scope_guard"
BEFORE INSERT OR UPDATE OF "tenant_id","company_id","warehouse_id"
ON "procurement_rfqs"
FOR EACH ROW EXECUTE FUNCTION validate_procurement_rfq_scope();

CREATE OR REPLACE FUNCTION validate_procurement_rfq_item_scope()
RETURNS TRIGGER AS $$
DECLARE
  rfq_tenant TEXT;
  rfq_company TEXT;
  product_tenant TEXT;
  product_company TEXT;
BEGIN
  SELECT tenant_id, company_id INTO rfq_tenant, rfq_company FROM procurement_rfqs WHERE id=NEW.rfq_id;
  SELECT tenant_id, company_id INTO product_tenant, product_company FROM inventory_products WHERE id=NEW.inventory_product_id;
  IF rfq_tenant IS NULL OR product_tenant IS NULL OR rfq_tenant <> product_tenant OR rfq_company <> product_company THEN
    RAISE EXCEPTION 'RFQ item product scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "procurement_rfq_items_scope_guard"
BEFORE INSERT OR UPDATE OF "rfq_id","inventory_product_id"
ON "procurement_rfq_items"
FOR EACH ROW EXECUTE FUNCTION validate_procurement_rfq_item_scope();

CREATE OR REPLACE FUNCTION validate_procurement_rfq_supplier_scope()
RETURNS TRIGGER AS $$
DECLARE
  rfq_tenant TEXT;
  rfq_company TEXT;
  connection_tenant TEXT;
  connection_company TEXT;
  connection_org TEXT;
  connection_status TEXT;
BEGIN
  SELECT tenant_id, company_id INTO rfq_tenant, rfq_company FROM procurement_rfqs WHERE id=NEW.rfq_id;
  SELECT tenant_id, company_id, supplier_organization_id, status
    INTO connection_tenant, connection_company, connection_org, connection_status
  FROM supplier_connections WHERE id=NEW.supplier_connection_id;
  IF rfq_tenant IS NULL OR connection_tenant IS NULL
     OR rfq_tenant <> connection_tenant OR rfq_company <> connection_company
     OR connection_org <> NEW.supplier_organization_id OR connection_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'RFQ supplier connection scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "procurement_rfq_suppliers_scope_guard"
BEFORE INSERT OR UPDATE OF "rfq_id","supplier_connection_id","supplier_organization_id"
ON "procurement_rfq_suppliers"
FOR EACH ROW EXECUTE FUNCTION validate_procurement_rfq_supplier_scope();
