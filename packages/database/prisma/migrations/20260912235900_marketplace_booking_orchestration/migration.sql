CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_active_staff_time_excl"
EXCLUDE USING gist (
  "tenantId" WITH =,
  "branchId" WITH =,
  "staffId" WITH =,
  tsrange("startAt", "endAt", '[)') WITH &&
)
WHERE ("status" NOT IN ('CANCELLED'::"AppointmentStatus", 'NO_SHOW'::"AppointmentStatus"));

CREATE TABLE "marketplace_bookings" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "booking_reference" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "branch_id" TEXT NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "service_id" TEXT NOT NULL REFERENCES "services"("id") ON DELETE RESTRICT,
  "staff_id" TEXT NOT NULL REFERENCES "staff"("id") ON DELETE RESTRICT,
  "customer_id" TEXT NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "appointment_id" TEXT NOT NULL REFERENCES "appointments"("id") ON DELETE RESTRICT,
  "idempotency_key" TEXT NOT NULL,
  "requested_start_at" TIMESTAMP(3) NOT NULL,
  "start_at" TIMESTAMP(3) NOT NULL,
  "end_at" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "contact_first_name" TEXT NOT NULL,
  "contact_last_name" TEXT NOT NULL,
  "contact_email" TEXT,
  "contact_phone" TEXT,
  "contact_snapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "confirmed_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "cancelled_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "marketplace_bookings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "marketplace_bookings_reference_key" UNIQUE ("booking_reference"),
  CONSTRAINT "marketplace_bookings_appointment_key" UNIQUE ("appointment_id"),
  CONSTRAINT "marketplace_bookings_scope_idempotency_key" UNIQUE ("tenant_id", "company_id", "branch_id", "idempotency_key"),
  CONSTRAINT "marketplace_bookings_status_check" CHECK ("status" IN ('CONFIRMED','CANCELLED')),
  CONSTRAINT "marketplace_bookings_time_check" CHECK ("start_at" < "end_at"),
  CONSTRAINT "marketplace_bookings_contact_check" CHECK ("contact_email" IS NOT NULL OR "contact_phone" IS NOT NULL)
);

CREATE INDEX "marketplace_bookings_scope_start_idx"
  ON "marketplace_bookings"("tenant_id", "company_id", "branch_id", "start_at");
CREATE INDEX "marketplace_bookings_customer_idx"
  ON "marketplace_bookings"("customer_id", "created_at" DESC);
CREATE INDEX "marketplace_bookings_service_idx"
  ON "marketplace_bookings"("service_id", "start_at");

CREATE TABLE "marketplace_booking_events" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "marketplace_booking_id" TEXT NOT NULL REFERENCES "marketplace_bookings"("id") ON DELETE CASCADE,
  "event_type" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "marketplace_booking_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "marketplace_booking_events_type_check" CHECK ("event_type" IN ('CONFIRMED','CANCELLED'))
);

CREATE INDEX "marketplace_booking_events_booking_idx"
  ON "marketplace_booking_events"("marketplace_booking_id", "created_at");

CREATE OR REPLACE FUNCTION validate_marketplace_booking_scope()
RETURNS TRIGGER AS $$
DECLARE
  branch_company_id TEXT;
  company_tenant_id TEXT;
  service_tenant_id TEXT;
  service_branch_id TEXT;
  staff_tenant_id TEXT;
  staff_branch_id TEXT;
  customer_tenant_id TEXT;
  customer_branch_id TEXT;
  appointment_tenant_id TEXT;
  appointment_branch_id TEXT;
  appointment_service_id TEXT;
  appointment_staff_id TEXT;
  appointment_customer_id TEXT;
BEGIN
  SELECT "companyId" INTO branch_company_id FROM "branches" WHERE "id"=NEW."branch_id";
  SELECT "tenantId" INTO company_tenant_id FROM "companies" WHERE "id"=NEW."company_id";
  SELECT "tenantId","branchId" INTO service_tenant_id,service_branch_id FROM "services" WHERE "id"=NEW."service_id";
  SELECT "tenantId","branchId" INTO staff_tenant_id,staff_branch_id FROM "staff" WHERE "id"=NEW."staff_id";
  SELECT "tenantId","branchId" INTO customer_tenant_id,customer_branch_id FROM "customers" WHERE "id"=NEW."customer_id";
  SELECT "tenantId","branchId","serviceId","staffId","customerId"
    INTO appointment_tenant_id,appointment_branch_id,appointment_service_id,appointment_staff_id,appointment_customer_id
  FROM "appointments" WHERE "id"=NEW."appointment_id";

  IF branch_company_id IS DISTINCT FROM NEW."company_id"
     OR company_tenant_id IS DISTINCT FROM NEW."tenant_id"
     OR service_tenant_id IS DISTINCT FROM NEW."tenant_id"
     OR service_branch_id IS DISTINCT FROM NEW."branch_id"
     OR staff_tenant_id IS DISTINCT FROM NEW."tenant_id"
     OR staff_branch_id IS DISTINCT FROM NEW."branch_id"
     OR customer_tenant_id IS DISTINCT FROM NEW."tenant_id"
     OR customer_branch_id IS DISTINCT FROM NEW."branch_id"
     OR appointment_tenant_id IS DISTINCT FROM NEW."tenant_id"
     OR appointment_branch_id IS DISTINCT FROM NEW."branch_id"
     OR appointment_service_id IS DISTINCT FROM NEW."service_id"
     OR appointment_staff_id IS DISTINCT FROM NEW."staff_id"
     OR appointment_customer_id IS DISTINCT FROM NEW."customer_id" THEN
    RAISE EXCEPTION 'marketplace booking scope mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "marketplace_bookings_scope_guard"
BEFORE INSERT OR UPDATE OF "tenant_id","company_id","branch_id","service_id","staff_id","customer_id","appointment_id"
ON "marketplace_bookings"
FOR EACH ROW
EXECUTE FUNCTION validate_marketplace_booking_scope();
