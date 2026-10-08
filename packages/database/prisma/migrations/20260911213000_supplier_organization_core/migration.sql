CREATE TABLE "supplier_organizations" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "slug" TEXT NOT NULL,
  "legal_name" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "organization_type" TEXT NOT NULL DEFAULT 'OTHER',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "verification_status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "website" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "tax_country" TEXT,
  "tax_number" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "supplier_organizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_organizations_slug_key" UNIQUE ("slug"),
  CONSTRAINT "supplier_organizations_type_check" CHECK (
    "organization_type" IN ('MANUFACTURER','DISTRIBUTOR','IMPORTER','WHOLESALER','RETAILER','SERVICE_PROVIDER','OTHER')
  ),
  CONSTRAINT "supplier_organizations_status_check" CHECK (
    "status" IN ('ACTIVE','INACTIVE','SUSPENDED','ARCHIVED')
  ),
  CONSTRAINT "supplier_organizations_verification_check" CHECK (
    "verification_status" IN ('UNVERIFIED','PENDING','VERIFIED','REJECTED','SUSPENDED')
  )
);

CREATE INDEX "supplier_organizations_status_idx"
  ON "supplier_organizations"("status", "verification_status");

CREATE INDEX "supplier_organizations_display_name_idx"
  ON "supplier_organizations"("display_name");

CREATE UNIQUE INDEX "supplier_organizations_tax_identity_key"
  ON "supplier_organizations"("tax_country", "tax_number")
  WHERE "tax_country" IS NOT NULL AND "tax_number" IS NOT NULL;

CREATE TABLE "supplier_connections" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "supplier_organization_id" TEXT NOT NULL REFERENCES "supplier_organizations"("id") ON DELETE CASCADE,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "inventory_supplier_id" TEXT NOT NULL REFERENCES "inventory_suppliers"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "supplier_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_connections_inventory_supplier_key" UNIQUE ("inventory_supplier_id"),
  CONSTRAINT "supplier_connections_status_check" CHECK ("status" IN ('ACTIVE','INACTIVE'))
);

CREATE INDEX "supplier_connections_org_idx"
  ON "supplier_connections"("supplier_organization_id", "status");

CREATE INDEX "supplier_connections_company_idx"
  ON "supplier_connections"("tenant_id", "company_id", "status");

CREATE OR REPLACE FUNCTION validate_supplier_connection_scope()
RETURNS TRIGGER AS $$
DECLARE
  supplier_tenant_id TEXT;
  supplier_company_id TEXT;
BEGIN
  SELECT "tenant_id", "company_id"
    INTO supplier_tenant_id, supplier_company_id
  FROM "inventory_suppliers"
  WHERE "id" = NEW."inventory_supplier_id";

  IF supplier_tenant_id IS NULL THEN
    RAISE EXCEPTION 'inventory supplier not found';
  END IF;

  IF supplier_tenant_id <> NEW."tenant_id" OR supplier_company_id <> NEW."company_id" THEN
    RAISE EXCEPTION 'supplier connection scope does not match inventory supplier scope';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "supplier_connections_scope_guard"
BEFORE INSERT OR UPDATE OF "tenant_id", "company_id", "inventory_supplier_id"
ON "supplier_connections"
FOR EACH ROW
EXECUTE FUNCTION validate_supplier_connection_scope();
