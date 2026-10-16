CREATE TABLE "operations_resource_allocations" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "room_id" TEXT,
    "inventory_asset_id" TEXT,
    "blocked_from" TIMESTAMPTZ NOT NULL,
    "blocked_to" TIMESTAMPTZ NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "created_by_membership_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operations_resource_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operations_resource_allocations_resource_check" CHECK (
      (("room_id" IS NOT NULL)::int + ("inventory_asset_id" IS NOT NULL)::int) = 1
    ),
    CONSTRAINT "operations_resource_allocations_range_check" CHECK ("blocked_from" < "blocked_to"),
    CONSTRAINT "operations_resource_allocations_status_check" CHECK (
      "status" IN ('RESERVED', 'RELEASED')
    ),
    CONSTRAINT "operations_resource_allocations_tenant_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "operations_resource_allocations_company_fkey"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "operations_resource_allocations_branch_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "operations_resource_allocations_appointment_fkey"
      FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "operations_resource_allocations_room_fkey"
      FOREIGN KEY ("room_id") REFERENCES "operations_rooms"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "operations_resource_allocations_asset_fkey"
      FOREIGN KEY ("inventory_asset_id") REFERENCES "inventory_assets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "operations_resource_allocations_membership_fkey"
      FOREIGN KEY ("created_by_membership_id") REFERENCES "memberships"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "operations_resource_allocations_appointment_idx"
  ON "operations_resource_allocations"("appointment_id", "status");
CREATE INDEX "operations_resource_allocations_room_time_idx"
  ON "operations_resource_allocations"("room_id", "blocked_from", "blocked_to")
  WHERE "status" = 'RESERVED' AND "room_id" IS NOT NULL;
CREATE INDEX "operations_resource_allocations_asset_time_idx"
  ON "operations_resource_allocations"("inventory_asset_id", "blocked_from", "blocked_to")
  WHERE "status" = 'RESERVED' AND "inventory_asset_id" IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_operations_resource_allocation_scope()
RETURNS trigger AS $$
DECLARE
  appointment_tenant_id TEXT;
  appointment_branch_id TEXT;
  branch_company_id TEXT;
  room_tenant_id TEXT;
  room_company_id TEXT;
  room_branch_id TEXT;
  asset_company_id TEXT;
  asset_branch_id TEXT;
BEGIN
  SELECT a."tenantId", a."branchId"
    INTO appointment_tenant_id, appointment_branch_id
  FROM appointments a
  WHERE a.id = NEW."appointment_id";

  SELECT b."companyId"
    INTO branch_company_id
  FROM branches b
  WHERE b.id = NEW."branch_id";

  IF appointment_tenant_id IS NULL
     OR appointment_tenant_id <> NEW."tenant_id"
     OR appointment_branch_id <> NEW."branch_id"
     OR branch_company_id <> NEW."company_id" THEN
    RAISE EXCEPTION 'Appointment resource allocation scope mismatch';
  END IF;

  IF NEW."room_id" IS NOT NULL THEN
    SELECT r.tenant_id, r.company_id, r.branch_id
      INTO room_tenant_id, room_company_id, room_branch_id
    FROM operations_rooms r
    WHERE r.id = NEW."room_id";

    IF room_tenant_id IS NULL
       OR room_tenant_id <> NEW."tenant_id"
       OR room_company_id <> NEW."company_id"
       OR room_branch_id <> NEW."branch_id" THEN
      RAISE EXCEPTION 'Room allocation scope mismatch';
    END IF;
  END IF;

  IF NEW."inventory_asset_id" IS NOT NULL THEN
    SELECT a.company_id, a.branch_id
      INTO asset_company_id, asset_branch_id
    FROM inventory_assets a
    WHERE a.id = NEW."inventory_asset_id";

    IF asset_company_id IS NULL
       OR asset_company_id <> NEW."company_id"
       OR (asset_branch_id IS NOT NULL AND asset_branch_id <> NEW."branch_id") THEN
      RAISE EXCEPTION 'Inventory asset allocation scope mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER operations_resource_allocations_scope_guard
BEFORE INSERT OR UPDATE ON "operations_resource_allocations"
FOR EACH ROW EXECUTE FUNCTION validate_operations_resource_allocation_scope();
