CREATE TABLE "inventory_product_catalog_links" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "inventory_product_id" TEXT NOT NULL REFERENCES "inventory_products"("id") ON DELETE CASCADE,
  "catalog_variant_id" TEXT NOT NULL REFERENCES "catalog_variants"("id") ON DELETE RESTRICT,
  "linked_by_user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "inventory_product_catalog_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_product_catalog_links_product_key" UNIQUE ("inventory_product_id")
);

CREATE INDEX "inventory_product_catalog_links_scope_idx"
  ON "inventory_product_catalog_links"("tenant_id","company_id","catalog_variant_id");

CREATE OR REPLACE FUNCTION validate_inventory_product_catalog_link_scope()
RETURNS TRIGGER AS $$
DECLARE
  product_tenant TEXT;
  product_company TEXT;
  variant_status TEXT;
BEGIN
  SELECT tenant_id, company_id
    INTO product_tenant, product_company
  FROM inventory_products
  WHERE id=NEW.inventory_product_id;

  SELECT status INTO variant_status
  FROM catalog_variants
  WHERE id=NEW.catalog_variant_id;

  IF product_tenant IS NULL
     OR product_tenant <> NEW.tenant_id
     OR product_company <> NEW.company_id THEN
    RAISE EXCEPTION 'inventory product catalog link scope mismatch';
  END IF;

  IF variant_status IS NULL OR variant_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'inventory product catalog link requires active catalog variant';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "inventory_product_catalog_links_scope_guard"
BEFORE INSERT OR UPDATE OF "tenant_id","company_id","inventory_product_id","catalog_variant_id"
ON "inventory_product_catalog_links"
FOR EACH ROW EXECUTE FUNCTION validate_inventory_product_catalog_link_scope();
