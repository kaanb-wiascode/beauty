CREATE TABLE "operations_rooms" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "room_type" TEXT NOT NULL DEFAULT 'TREATMENT_ROOM',
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operations_rooms_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operations_rooms_capacity_check" CHECK ("capacity" > 0),
    CONSTRAINT "operations_rooms_status_check" CHECK (
      "status" IN ('AVAILABLE', 'RESERVED', 'IN_USE', 'CLEANING', 'OUT_OF_SERVICE')
    ),
    CONSTRAINT "operations_rooms_tenant_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "operations_rooms_company_fkey"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "operations_rooms_branch_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "operations_rooms_branch_code_unique" UNIQUE ("branch_id", "code")
);

CREATE INDEX "operations_rooms_scope_status_idx"
  ON "operations_rooms"("tenant_id", "company_id", "branch_id", "status");
CREATE INDEX "operations_rooms_branch_type_idx"
  ON "operations_rooms"("branch_id", "room_type", "status");

CREATE TABLE "service_operational_requirements" (
    "service_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "room_type" TEXT,
    "required_asset_type" TEXT,
    "required_asset_id" TEXT,
    "prep_duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "cleanup_duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_operational_requirements_pkey" PRIMARY KEY ("service_id"),
    CONSTRAINT "service_operational_requirements_prep_check" CHECK ("prep_duration_minutes" >= 0),
    CONSTRAINT "service_operational_requirements_cleanup_check" CHECK ("cleanup_duration_minutes" >= 0),
    CONSTRAINT "service_operational_requirements_service_fkey"
      FOREIGN KEY ("service_id") REFERENCES "services"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "service_operational_requirements_tenant_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "service_operational_requirements_branch_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "service_operational_requirements_asset_fkey"
      FOREIGN KEY ("required_asset_id") REFERENCES "inventory_assets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "service_operational_requirements_scope_idx"
  ON "service_operational_requirements"("tenant_id", "branch_id");
CREATE INDEX "service_operational_requirements_asset_idx"
  ON "service_operational_requirements"("required_asset_id")
  WHERE "required_asset_id" IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_service_operational_requirement_scope()
RETURNS trigger AS $$
DECLARE
  service_tenant_id TEXT;
  service_branch_id TEXT;
  asset_company_id TEXT;
  asset_branch_id TEXT;
  branch_company_id TEXT;
BEGIN
  SELECT s."tenantId", s."branchId"
    INTO service_tenant_id, service_branch_id
  FROM "services" s
  WHERE s.id = NEW."service_id";

  IF service_tenant_id IS NULL
     OR service_tenant_id <> NEW."tenant_id"
     OR service_branch_id <> NEW."branch_id" THEN
    RAISE EXCEPTION 'Service operational requirement scope mismatch';
  END IF;

  IF NEW."required_asset_id" IS NOT NULL THEN
    SELECT a.company_id, a.branch_id
      INTO asset_company_id, asset_branch_id
    FROM inventory_assets a
    WHERE a.id = NEW."required_asset_id"
      AND a.status = 'ACTIVE';

    SELECT b."companyId"
      INTO branch_company_id
    FROM branches b
    WHERE b.id = NEW."branch_id";

    IF asset_company_id IS NULL
       OR asset_company_id <> branch_company_id
       OR (asset_branch_id IS NOT NULL AND asset_branch_id <> NEW."branch_id") THEN
      RAISE EXCEPTION 'Required inventory asset is outside service branch scope';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER service_operational_requirements_scope_guard
BEFORE INSERT OR UPDATE ON "service_operational_requirements"
FOR EACH ROW EXECUTE FUNCTION validate_service_operational_requirement_scope();
