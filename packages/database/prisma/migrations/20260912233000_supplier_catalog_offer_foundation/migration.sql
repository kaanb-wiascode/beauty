CREATE TABLE "catalog_brands" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "catalog_brands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_brands_slug_key" UNIQUE ("slug"),
  CONSTRAINT "catalog_brands_status_check" CHECK ("status" IN ('ACTIVE','INACTIVE','ARCHIVED'))
);

CREATE TABLE "catalog_products" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "brand_id" TEXT REFERENCES "catalog_brands"("id") ON DELETE SET NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category_code" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "catalog_products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_products_slug_key" UNIQUE ("slug"),
  CONSTRAINT "catalog_products_status_check" CHECK ("status" IN ('ACTIVE','INACTIVE','ARCHIVED'))
);

CREATE TABLE "catalog_variants" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "catalog_product_id" TEXT NOT NULL REFERENCES "catalog_products"("id") ON DELETE CASCADE,
  "canonical_sku" TEXT,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'UNIT',
  "attributes" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "catalog_variants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_variants_status_check" CHECK ("status" IN ('ACTIVE','INACTIVE','ARCHIVED')),
  CONSTRAINT "catalog_variants_unit_check" CHECK ("unit" IN ('UNIT','ML','LITER','GRAM','KG','METER','PAIR','BOX'))
);

CREATE UNIQUE INDEX "catalog_variants_canonical_sku_key"
  ON "catalog_variants"("canonical_sku")
  WHERE "canonical_sku" IS NOT NULL;
CREATE INDEX "catalog_variants_product_idx"
  ON "catalog_variants"("catalog_product_id", "status");

CREATE TABLE "catalog_product_identifiers" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "catalog_variant_id" TEXT NOT NULL REFERENCES "catalog_variants"("id") ON DELETE CASCADE,
  "identifier_type" TEXT NOT NULL,
  "identifier_value" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "catalog_product_identifiers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_product_identifiers_type_check" CHECK ("identifier_type" IN ('GTIN','EAN','UPC','MPN','OTHER')),
  CONSTRAINT "catalog_product_identifiers_value_key" UNIQUE ("identifier_type", "identifier_value")
);
CREATE INDEX "catalog_product_identifiers_variant_idx"
  ON "catalog_product_identifiers"("catalog_variant_id");

CREATE TABLE "supplier_offers" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "supplier_organization_id" TEXT NOT NULL REFERENCES "supplier_organizations"("id") ON DELETE CASCADE,
  "catalog_variant_id" TEXT NOT NULL REFERENCES "catalog_variants"("id") ON DELETE RESTRICT,
  "supplier_sku" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "unit_price" NUMERIC(14,4) NOT NULL,
  "minimum_order_quantity" NUMERIC(14,3) NOT NULL DEFAULT 1,
  "order_multiple" NUMERIC(14,3) NOT NULL DEFAULT 1,
  "available_quantity" NUMERIC(14,3),
  "lead_time_days" INTEGER NOT NULL DEFAULT 0,
  "preparation_days" INTEGER NOT NULL DEFAULT 0,
  "shipping_days" INTEGER NOT NULL DEFAULT 0,
  "valid_from" TIMESTAMPTZ,
  "valid_to" TIMESTAMPTZ,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_supplier_membership_id" TEXT REFERENCES "supplier_memberships"("id") ON DELETE SET NULL,
  "updated_by_supplier_membership_id" TEXT REFERENCES "supplier_memberships"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "supplier_offers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_offers_org_variant_key" UNIQUE ("supplier_organization_id", "catalog_variant_id"),
  CONSTRAINT "supplier_offers_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','INACTIVE','ARCHIVED')),
  CONSTRAINT "supplier_offers_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "supplier_offers_unit_price_check" CHECK ("unit_price" >= 0),
  CONSTRAINT "supplier_offers_minimum_order_check" CHECK ("minimum_order_quantity" > 0),
  CONSTRAINT "supplier_offers_order_multiple_check" CHECK ("order_multiple" > 0),
  CONSTRAINT "supplier_offers_available_quantity_check" CHECK ("available_quantity" IS NULL OR "available_quantity" >= 0),
  CONSTRAINT "supplier_offers_lead_time_check" CHECK ("lead_time_days" >= 0 AND "preparation_days" >= 0 AND "shipping_days" >= 0),
  CONSTRAINT "supplier_offers_validity_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"),
  CONSTRAINT "supplier_offers_version_check" CHECK ("version" > 0)
);
CREATE INDEX "supplier_offers_variant_status_idx"
  ON "supplier_offers"("catalog_variant_id", "status");
CREATE INDEX "supplier_offers_supplier_status_idx"
  ON "supplier_offers"("supplier_organization_id", "status");

CREATE TABLE "supplier_offer_events" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "supplier_offer_id" TEXT NOT NULL REFERENCES "supplier_offers"("id") ON DELETE CASCADE,
  "supplier_organization_id" TEXT NOT NULL REFERENCES "supplier_organizations"("id") ON DELETE CASCADE,
  "actor_supplier_membership_id" TEXT REFERENCES "supplier_memberships"("id") ON DELETE SET NULL,
  "event_type" TEXT NOT NULL,
  "from_status" TEXT,
  "to_status" TEXT,
  "from_version" INTEGER,
  "to_version" INTEGER NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "supplier_offer_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_offer_events_type_check" CHECK ("event_type" IN ('CREATED','UPDATED','ACTIVATED','DEACTIVATED','ARCHIVED')),
  CONSTRAINT "supplier_offer_events_version_check" CHECK ("to_version" > 0)
);
CREATE INDEX "supplier_offer_events_offer_idx"
  ON "supplier_offer_events"("supplier_offer_id", "created_at" DESC);
